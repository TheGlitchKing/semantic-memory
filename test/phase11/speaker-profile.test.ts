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

async function seedProject(profileBody?: string) {
  const dir = await mkdtemp(join(tmpdir(), "profile-hook-"));
  const vault = join(dir, ".claude", ".vault");
  await mkdir(vault, { recursive: true });
  await mkdir(join(dir, ".claude", ".semantic-memory"), { recursive: true });
  if (profileBody !== undefined) {
    await mkdir(join(vault, "profile"), { recursive: true });
    await writeFile(join(vault, "profile", "speaker.md"), profileBody, "utf-8");
  }
  return dir;
}

describe("Speaker profile injection (v1.5 Phase 11)", () => {
  let projectRoot: string;
  afterEach(async () => {
    if (projectRoot) await rm(projectRoot, { recursive: true, force: true });
  });

  it("injects a filled profile's learned lines at SessionStart", async () => {
    const body = `---\ntitle: Speaker profile\ntype: profile\nstatus: active\n---\n# Speaker profile\n\n## Severity calibration\n\n- "on fire" = drop everything\n\n## Verbosity preference\n\n- terse first, reasoning on request\n`;
    projectRoot = await seedProject(body);
    const r = runHook(projectRoot, { hook_event_name: "SessionStart" });
    expect(r.stdout).toContain("vault-speaker-profile");
    expect(r.stdout).toContain("on fire");
    expect(r.stdout).toContain("terse first");
  });

  it("stays silent when the profile is only placeholders (nothing learned yet)", async () => {
    const body = `---\ntitle: Speaker profile\ntype: profile\nstatus: active\n---\n# Speaker profile\n\n## Severity calibration\n\n_What their words map to._\n`;
    projectRoot = await seedProject(body);
    const r = runHook(projectRoot, { hook_event_name: "SessionStart" });
    expect(r.stdout).not.toContain("vault-speaker-profile");
  });

  it("emits nothing profile-related when no profile note exists", async () => {
    projectRoot = await seedProject(); // no profile
    const r = runHook(projectRoot, { hook_event_name: "SessionStart" });
    expect(r.stdout).not.toContain("vault-speaker-profile");
  });
});
