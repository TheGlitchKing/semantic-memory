import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { logEvent } from "../../src/core/log.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const HOOK = join(ROOT, "hooks", "vault-context.js");

function runHook(cwd: string, input: object, extraEnv: Record<string, string> = {}) {
  const r = spawnSync("node", [HOOK], {
    input: JSON.stringify(input),
    encoding: "utf8",
    cwd,
    env: { ...process.env, ...extraEnv },
    timeout: 60_000,
  });
  if (r.status !== 0 && r.status !== null) {
    throw new Error(`hook exited ${r.status}: ${r.stderr}`);
  }
  return { stdout: r.stdout, stderr: r.stderr, out: r.stdout ? JSON.parse(r.stdout) : null };
}

describe("Phase 4.5 SessionStart state-delta preload", () => {
  let tempDir: string;
  let vaultDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sidekick-phase45-"));
    vaultDir = join(tempDir, "vault");
    await mkdir(vaultDir, { recursive: true });
    await writeFile(join(vaultDir, "README.md"), "# seed\nbody\n", "utf-8");
    await mkdir(join(tempDir, ".claude"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("SessionStart injects state-delta block even when log is empty", async () => {
    const { out } = runHook(
      tempDir,
      { hook_event_name: "SessionStart", cwd: tempDir },
      { SIDEKICK_VAULT_PATH: vaultDir }
    );
    const ctx = out?.hookSpecificOutput?.additionalContext ?? "";
    expect(ctx).toContain("<vault-state-since");
    expect(ctx).toContain("No logged activity in the last 14 days");
  });

  it("SessionStart summarizes recent events by kind", async () => {
    const now = new Date().toISOString();
    await logEvent(vaultDir, { kind: "ingest", summary: "ingested doc A", ts: now });
    await logEvent(vaultDir, { kind: "synthesis", summary: "filed note X", ts: now });
    await logEvent(vaultDir, { kind: "error", summary: "apply_patch failed", ts: now });

    const { out } = runHook(
      tempDir,
      { hook_event_name: "SessionStart", cwd: tempDir },
      { SIDEKICK_VAULT_PATH: vaultDir }
    );
    const ctx = out?.hookSpecificOutput?.additionalContext ?? "";
    expect(ctx).toContain("<vault-state-since");
    expect(ctx).toContain("ingest=1");
    expect(ctx).toContain("synthesis=1");
    expect(ctx).toContain("error=1");
    expect(ctx).toContain("filed note X");
  });

  it("SessionStart logs mode_change when prior mode was non-default", async () => {
    await writeFile(join(tempDir, ".claude", ".sidekick-mode"), "research", "utf-8");
    runHook(
      tempDir,
      { hook_event_name: "SessionStart", cwd: tempDir },
      { SIDEKICK_VAULT_PATH: vaultDir }
    );
    // mode_change should now be in log.md
    const entries = await (await import("../../src/core/log.js")).logQuery(vaultDir, { kind: "mode_change" });
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const last = entries[entries.length - 1];
    expect(last.payload?.from).toBe("research");
    expect(last.payload?.to).toBe("vault-first");
  });
});
