import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { migrateState } from "../../src/cli/migrate-state.js";

async function seedProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "migrate-state-"));
  await mkdir(join(dir, ".claude"), { recursive: true });
  return dir;
}

describe("migrateState", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await seedProject();
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("clean project (no legacy files): all skipped", () => {
    const r = migrateState({ projectRoot: dir });
    expect(r.migrated).toEqual([]);
    expect(r.conflicts).toEqual([]);
    expect(r.skipped).toHaveLength(3);
    expect(r.skipped.every((s) => s.status === "skipped-no-source")).toBe(true);
  });

  it("only legacy mode present: migrates it, leaves other names skipped", async () => {
    await writeFile(join(dir, ".claude", ".sidekick-mode"), "research", "utf-8");
    const r = migrateState({ projectRoot: dir });
    expect(r.migrated).toHaveLength(1);
    expect(r.migrated[0].name).toBe("mode");
    expect(r.migrated[0].status).toBe("migrated");
    expect(r.skipped.map((s) => s.name).sort()).toEqual(["capture-pending", "fingerprints"]);

    // Verify the file actually moved
    expect(existsSync(join(dir, ".claude", ".sidekick-mode"))).toBe(false);
    const content = await readFile(join(dir, ".claude", ".semantic-memory", "mode"), "utf-8");
    expect(content).toBe("research");
  });

  it("all three legacy files present: migrates all", async () => {
    await writeFile(join(dir, ".claude", ".sidekick-mode"), "vault-first", "utf-8");
    await writeFile(join(dir, ".claude", ".sidekick-fingerprints.json"), '{"recent":[]}', "utf-8");
    await writeFile(join(dir, ".claude", ".sidekick-capture-pending.json"), '{"items":[]}', "utf-8");
    const r = migrateState({ projectRoot: dir });
    expect(r.migrated).toHaveLength(3);
    expect(r.skipped).toEqual([]);
    expect(r.conflicts).toEqual([]);
    // No legacy paths remain
    expect(existsSync(join(dir, ".claude", ".sidekick-mode"))).toBe(false);
    expect(existsSync(join(dir, ".claude", ".sidekick-fingerprints.json"))).toBe(false);
    expect(existsSync(join(dir, ".claude", ".sidekick-capture-pending.json"))).toBe(false);
    // All new paths exist
    expect(existsSync(join(dir, ".claude", ".semantic-memory", "mode"))).toBe(true);
    expect(existsSync(join(dir, ".claude", ".semantic-memory", "fingerprints.json"))).toBe(true);
    expect(existsSync(join(dir, ".claude", ".semantic-memory", "capture-pending.json"))).toBe(true);
  });

  it("idempotent: a second run after migration is all skipped (already-migrated)", async () => {
    await writeFile(join(dir, ".claude", ".sidekick-mode"), "outage-silence", "utf-8");
    migrateState({ projectRoot: dir });
    const r2 = migrateState({ projectRoot: dir });
    expect(r2.migrated).toEqual([]);
    expect(r2.conflicts).toEqual([]);
    // mode is now at new path → skipped-already-migrated
    expect(r2.skipped.find((s) => s.name === "mode")?.status).toBe("skipped-already-migrated");
    // others never existed → skipped-no-source
    expect(r2.skipped.find((s) => s.name === "fingerprints")?.status).toBe("skipped-no-source");
  });

  it("conflict (both paths exist) without --force: refused", async () => {
    await writeFile(join(dir, ".claude", ".sidekick-mode"), "research", "utf-8");
    await mkdir(join(dir, ".claude", ".semantic-memory"), { recursive: true });
    await writeFile(join(dir, ".claude", ".semantic-memory", "mode"), "vault-first", "utf-8");

    const r = migrateState({ projectRoot: dir });
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].name).toBe("mode");
    expect(r.migrated).toEqual([]);
    // Both files survive untouched
    expect(existsSync(join(dir, ".claude", ".sidekick-mode"))).toBe(true);
    expect(existsSync(join(dir, ".claude", ".semantic-memory", "mode"))).toBe(true);
  });

  it("conflict with --force: prefers new, deletes old", async () => {
    await writeFile(join(dir, ".claude", ".sidekick-mode"), "research", "utf-8");
    await mkdir(join(dir, ".claude", ".semantic-memory"), { recursive: true });
    await writeFile(join(dir, ".claude", ".semantic-memory", "mode"), "vault-first", "utf-8");

    const r = migrateState({ projectRoot: dir, force: true });
    expect(r.migrated).toHaveLength(1);
    expect(r.migrated[0].status).toBe("resolved-by-force");
    expect(existsSync(join(dir, ".claude", ".sidekick-mode"))).toBe(false);
    // New path content preserved
    const content = await readFile(join(dir, ".claude", ".semantic-memory", "mode"), "utf-8");
    expect(content).toBe("vault-first");
  });

  it("--dry-run: reports planned actions without changing anything", async () => {
    await writeFile(join(dir, ".claude", ".sidekick-mode"), "research", "utf-8");
    const r = migrateState({ projectRoot: dir, dryRun: true });
    expect(r.migrated).toHaveLength(1);
    expect(r.migrated[0].detail).toMatch(/dry-run/);
    // No actual move happened
    expect(existsSync(join(dir, ".claude", ".sidekick-mode"))).toBe(true);
    expect(existsSync(join(dir, ".claude", ".semantic-memory", "mode"))).toBe(false);
  });

  it("--dry-run + conflict + --force: previews the resolution without acting", async () => {
    await writeFile(join(dir, ".claude", ".sidekick-mode"), "research", "utf-8");
    await mkdir(join(dir, ".claude", ".semantic-memory"), { recursive: true });
    await writeFile(join(dir, ".claude", ".semantic-memory", "mode"), "vault-first", "utf-8");

    const r = migrateState({ projectRoot: dir, dryRun: true, force: true });
    expect(r.migrated).toHaveLength(1);
    expect(r.migrated[0].status).toBe("resolved-by-force");
    expect(r.migrated[0].detail).toMatch(/dry-run/);
    // Both files still exist (dry-run took no action)
    expect(existsSync(join(dir, ".claude", ".sidekick-mode"))).toBe(true);
    expect(existsSync(join(dir, ".claude", ".semantic-memory", "mode"))).toBe(true);
  });
});
