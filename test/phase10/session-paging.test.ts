import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const HOOK = join(ROOT, "hooks", "vault-context.js");

function runHook(cwd: string, input: object) {
  const r = spawnSync("node", [HOOK], { input: JSON.stringify(input), encoding: "utf8", cwd, env: { ...process.env }, timeout: 30_000 });
  return { stdout: r.stdout, stderr: r.stderr };
}

async function seedProject() {
  const dir = await mkdtemp(join(tmpdir(), "paging-hook-"));
  await mkdir(join(dir, ".claude", ".vault"), { recursive: true });
  await mkdir(join(dir, ".claude", ".semantic-memory"), { recursive: true });
  return dir;
}

async function writeSession(projectRoot: string, partial: Record<string, unknown>) {
  const dir = join(projectRoot, ".claude", ".semantic-memory");
  const state = {
    id: "ses_test",
    task: "wire the paging digest",
    started_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    verifications: [],
    notes_touched: [],
    ...partial,
  };
  await writeFile(join(dir, "session.json"), JSON.stringify(state), "utf-8");
}

async function writeDossierCache(projectRoot: string, dossiers: unknown[]) {
  const dir = join(projectRoot, ".claude", ".semantic-memory");
  await writeFile(join(dir, "dossier-cache.json"), JSON.stringify({ dossiers }), "utf-8");
}

describe("Session paging (v1.5 Phase 10)", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await seedProject();
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("SessionStart pages in a curated digest (active task + dossier states) instead of a broad search", async () => {
    await writeSession(projectRoot, { task: "harden the queue" });
    await writeDossierCache(projectRoot, [
      { entity: "payment-gateway", aliases: [], path: "dossiers/payment-gateway.md", purpose: "Charges cards.", current_state: "stable since pool bump" },
    ]);
    const r = runHook(projectRoot, { hook_event_name: "SessionStart" });
    expect(r.stdout).toContain("vault-session-digest");
    expect(r.stdout).toContain("harden the queue");
    expect(r.stdout).toContain("payment-gateway");
    expect(r.stdout).toContain("stable since pool bump");
    // Curated digest replaces the broad seeded search.
    expect(r.stdout).not.toContain('source="sessionstart"');
  });

  it("SessionStart falls back to broad search when there's nothing to page in", async () => {
    // No session, no dossier cache → digest is empty → search path (or empty).
    const r = runHook(projectRoot, { hook_event_name: "SessionStart" });
    expect(r.stdout).not.toContain("vault-session-digest");
  });

  it("Stop on an open session appends the digest-paging proposal instruction", async () => {
    await writeSession(projectRoot, {
      id: "ses_page",
      task: "x",
      verifications: [{ cmd: "npm test", exit: 0, signal: null, duration_ms: 10, tail: "ok", at: new Date().toISOString() }],
    });
    const r = runHook(projectRoot, { hook_event_name: "Stop" });
    // Stop output is JSON — the instruction lives in the `reason` field, so parse it
    // rather than matching quote-containing substrings against the escaped stream.
    const reason = JSON.parse(r.stdout).reason as string;
    expect(reason).toContain("vault-session-close");
    expect(reason).toContain("synthesize_note");
    expect(reason).toContain('proposal_subdir: "sessions"');
    expect(reason).toContain("sessions/ses_page.md");
    expect(reason).toContain("from_session");
  });
});
