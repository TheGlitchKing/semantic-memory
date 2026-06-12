import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const HOOK = join(ROOT, "hooks", "vault-context.js");

function runHook(cwd: string, input: object, extraEnv: Record<string, string> = {}) {
  const r = spawnSync("node", [HOOK], {
    input: JSON.stringify(input),
    encoding: "utf8",
    cwd,
    env: { ...process.env, ...extraEnv },
    timeout: 30_000,
  });
  if (r.status !== 0 && r.status !== null) {
    throw new Error(`hook exited ${r.status}: ${r.stderr}`);
  }
  return { stdout: r.stdout, stderr: r.stderr, out: r.stdout ? JSON.parse(r.stdout) : null };
}

describe("Phase 4 mode hook behavior", () => {
  let tempDir: string;
  let vaultDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sidekick-phase4-"));
    vaultDir = join(tempDir, "vault");
    await mkdir(vaultDir, { recursive: true });
    await writeFile(join(vaultDir, "README.md"), "# seed\nbody\n", "utf-8");
    await mkdir(join(tempDir, ".claude"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("SessionStart resets mode to vault-first (legacy state file present, write goes to new path)", async () => {
    // Simulate an existing v1.1 user: legacy mode file at the old path.
    await writeFile(join(tempDir, ".claude", ".sidekick-mode"), "research", "utf-8");
    runHook(
      tempDir,
      { hook_event_name: "SessionStart", cwd: tempDir },
      { SIDEKICK_VAULT_PATH: vaultDir }
    );
    // v1.2 contract: writes always go to the new path, reads fall back to old.
    // After the hook runs, the new path holds the canonical value.
    const newMode = await readFile(join(tempDir, ".claude", ".semantic-memory", "mode"), "utf-8");
    expect(newMode).toBe("vault-first");
  });

  it("UserPromptSubmit in outage-silence suppresses vault context", async () => {
    await writeFile(join(tempDir, ".claude", ".sidekick-mode"), "outage-silence", "utf-8");
    const { out } = runHook(
      tempDir,
      { hook_event_name: "UserPromptSubmit", prompt: "how does mfa work?", cwd: tempDir },
      { SIDEKICK_VAULT_PATH: vaultDir }
    );
    const ctx = out?.hookSpecificOutput?.additionalContext;
    expect(ctx).toBeUndefined();
  });

  it("Stop hook in outage-silence emits postmortem prompt and decision=block", async () => {
    await writeFile(join(tempDir, ".claude", ".sidekick-mode"), "outage-silence", "utf-8");
    const { out } = runHook(
      tempDir,
      { hook_event_name: "Stop", cwd: tempDir },
      { SIDEKICK_VAULT_PATH: vaultDir }
    );
    expect(out.decision).toBe("block");
    const reason = out?.reason ?? "";
    expect(reason).toContain("postmortem");
    expect(reason).toContain("outage-silence");
  });

  it("Stop hook in research mode emits synthesis prompt when capture pending", async () => {
    await writeFile(join(tempDir, ".claude", ".sidekick-mode"), "research", "utf-8");
    // Prime capture-pending via a prompt with a cue
    runHook(
      tempDir,
      {
        hook_event_name: "UserPromptSubmit",
        prompt: "the fix was to upgrade the library because the old version had a bug",
        cwd: tempDir,
      },
      { SIDEKICK_VAULT_PATH: vaultDir }
    );
    // v1.2: capture-pending state writes go to the new path under .semantic-memory/.
    expect(existsSync(join(tempDir, ".claude", ".semantic-memory", "capture-pending.json"))).toBe(true);

    const { out } = runHook(
      tempDir,
      { hook_event_name: "Stop", cwd: tempDir },
      { SIDEKICK_VAULT_PATH: vaultDir }
    );
    expect(out.decision).toBe("block");
    const reason = out?.reason ?? "";
    expect(reason).toContain("research");
    expect(reason).toContain("synthesize_note");
  });

  it("vault-first Stop hook behaves as Phase 2 (generic capture prompt)", async () => {
    // mode file absent → default vault-first
    runHook(
      tempDir,
      { hook_event_name: "UserPromptSubmit", prompt: "decided to go with option A because X", cwd: tempDir },
      { SIDEKICK_VAULT_PATH: vaultDir }
    );
    const { out } = runHook(
      tempDir,
      { hook_event_name: "Stop", cwd: tempDir },
      { SIDEKICK_VAULT_PATH: vaultDir }
    );
    expect(out.decision).toBe("block");
    const reason = out?.reason ?? "";
    expect(reason).toContain("vault-capture-prompt");
  });

  it("conversational 'gotcha' acknowledgment does NOT prime capture-pending", async () => {
    // Regression: the bare-word /\bgotcha\b/ cue used to fire on filler
    // acknowledgments. "Gotcha, ok…" is not new knowledge worth capturing.
    runHook(
      tempDir,
      {
        hook_event_name: "UserPromptSubmit",
        prompt: "gotcha... ok. so commit the doc change, and then include per token validation.",
        cwd: tempDir,
      },
      { SIDEKICK_VAULT_PATH: vaultDir }
    );
    const { out } = runHook(
      tempDir,
      { hook_event_name: "Stop", cwd: tempDir },
      { SIDEKICK_VAULT_PATH: vaultDir }
    );
    // No cue → no pending → empty (non-blocking) Stop payload.
    expect(out).toEqual({});
  });

  it("noun-context 'gotcha' (the gotcha is…) DOES prime capture-pending", async () => {
    runHook(
      tempDir,
      {
        hook_event_name: "UserPromptSubmit",
        prompt: "the gotcha is that the upstream API silently truncates payloads over 1MB",
        cwd: tempDir,
      },
      { SIDEKICK_VAULT_PATH: vaultDir }
    );
    const { out } = runHook(
      tempDir,
      { hook_event_name: "Stop", cwd: tempDir },
      { SIDEKICK_VAULT_PATH: vaultDir }
    );
    expect(out.decision).toBe("block");
    expect(out?.reason ?? "").toContain("vault-capture-prompt");
  });

  it("quoting the hook's own <vault-capture-prompt> output does NOT re-prime capture-pending", async () => {
    // Regression: pasting tool output back (which contains the literal words
    // gotcha/workaround/hack and the cue regexes) used to scan the quoted
    // machinery and nag about its own nag — a self-referential loop.
    const pastedNag = [
      "Stop hook feedback:",
      '<vault-capture-prompt count="1">',
      "This session surfaced 1 capture-worthy moment (user prompts contained decision/gotcha/fix cues):",
      "- cue `\\bgotcha\\b|\\bworkaround\\b|\\bhack\\b`: \"some earlier prompt\"",
      "</vault-capture-prompt>",
    ].join("\n");
    runHook(
      tempDir,
      { hook_event_name: "UserPromptSubmit", prompt: pastedNag, cwd: tempDir },
      { SIDEKICK_VAULT_PATH: vaultDir }
    );
    const { out } = runHook(
      tempDir,
      { hook_event_name: "Stop", cwd: tempDir },
      { SIDEKICK_VAULT_PATH: vaultDir }
    );
    expect(out).toEqual({});
  });

  it("a real cue alongside pasted machinery still primes (strip is surgical, not total)", async () => {
    const mixed = [
      "the gotcha is the upstream API truncates payloads over 1MB.",
      "```",
      "ERROR: workaround applied, hack in place",
      "```",
    ].join("\n");
    runHook(
      tempDir,
      { hook_event_name: "UserPromptSubmit", prompt: mixed, cwd: tempDir },
      { SIDEKICK_VAULT_PATH: vaultDir }
    );
    const { out } = runHook(
      tempDir,
      { hook_event_name: "Stop", cwd: tempDir },
      { SIDEKICK_VAULT_PATH: vaultDir }
    );
    expect(out.decision).toBe("block");
    expect(out?.reason ?? "").toContain("vault-capture-prompt");
  });

  it("Stop hook emits {} (not hookSpecificOutput) when no vault is found", async () => {
    // No SIDEKICK_VAULT_PATH set, no .mcp.json under cwd → findVaultPath returns null,
    // hook short-circuits before reaching handleStop.
    const { out } = runHook(
      tempDir,
      { hook_event_name: "Stop", cwd: tempDir }
    );
    expect(out).toEqual({});
    // Schema-critical: must NOT carry hookSpecificOutput on Stop.
    expect((out as any)?.hookSpecificOutput).toBeUndefined();
  });

  it("Stop hook emits {} when vault is found but CLI bin is missing", async () => {
    // Vault path resolves, but cwd has no node_modules/@theglitchking/...
    // and the dev-fallback dist may or may not be present from the test runner's
    // perspective. Either way, the early-exit path must not emit hookSpecificOutput.
    const isolated = join(tempDir, "isolated-no-cli");
    await mkdir(isolated, { recursive: true });
    const { out } = runHook(
      isolated,
      { hook_event_name: "Stop", cwd: isolated },
      { SIDEKICK_VAULT_PATH: vaultDir }
    );
    // Two valid no-op shapes for Stop: bare {} or — if the dev-fallback CLI is
    // discoverable from the hook's own location — a proper handleStop result.
    // What we forbid is the broken hookSpecificOutput envelope.
    expect((out as any)?.hookSpecificOutput).toBeUndefined();
  });

  it("vault-context Instructions are conditional, not unconditional", async () => {
    // Regression: the injected <vault-context> block used to issue an unconditional
    // "cite filenames... say 'not in vault' and name the nearest misses" — which
    // overrode CLAUDE.md's nuanced cite-or-deflect rule and caused models in
    // consumer projects to narrate "X unrelated" on debugging/status/directive
    // prompts. Instructions must scope cite-or-deflect to project prose lookups
    // and explicitly forbid the noise narration.
    const { formatContextBlock } = await import("../../hooks/vault-context.js");
    const block = formatContextBlock("prompt", "test", [
      { path: "foo.md", score: 0.5, snippet: "x" },
    ]);
    expect(block).toContain("project prose lookup");
    expect(block).toContain("ignore this block silently");
    expect(block).toContain('Do NOT narrate "X unrelated"');
    // The old unconditional imperative must NOT survive verbatim.
    expect(block).not.toMatch(/^Instructions: Read the top hits.*cite filenames in your response\. If none of these actually answer the question, say "not in vault" and name the nearest misses\.$/m);
  });
});
