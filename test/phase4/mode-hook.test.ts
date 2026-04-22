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

  it("SessionStart resets mode to vault-first", async () => {
    await writeFile(join(tempDir, ".claude", ".sidekick-mode"), "research", "utf-8");
    runHook(
      tempDir,
      { hook_event_name: "SessionStart", cwd: tempDir },
      { SIDEKICK_VAULT_PATH: vaultDir }
    );
    const mode = await readFile(join(tempDir, ".claude", ".sidekick-mode"), "utf-8");
    expect(mode).toBe("vault-first");
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
    const ctx = out?.hookSpecificOutput?.additionalContext ?? "";
    expect(ctx).toContain("postmortem");
    expect(ctx).toContain("outage-silence");
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
    expect(existsSync(join(tempDir, ".claude", ".sidekick-capture-pending.json"))).toBe(true);

    const { out } = runHook(
      tempDir,
      { hook_event_name: "Stop", cwd: tempDir },
      { SIDEKICK_VAULT_PATH: vaultDir }
    );
    expect(out.decision).toBe("block");
    const ctx = out?.hookSpecificOutput?.additionalContext ?? "";
    expect(ctx).toContain("research");
    expect(ctx).toContain("synthesize_note");
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
    const ctx = out?.hookSpecificOutput?.additionalContext ?? "";
    expect(ctx).toContain("vault-capture-prompt");
  });
});
