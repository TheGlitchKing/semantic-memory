import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintVault } from "../../src/core/lint.js";
import { addAlias } from "../../src/core/lexicon.js";

async function seedVault(): Promise<{ root: string; vault: string }> {
  const root = await mkdtemp(join(tmpdir(), "aliasconf-"));
  const vault = join(root, ".claude", ".vault");
  await mkdir(vault, { recursive: true });
  return { root, vault };
}

describe("lint alias_conflicts", () => {
  let root: string;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("flags a phrase that maps to two different canonicals", async () => {
    const s = await seedVault();
    root = s.root;
    await addAlias(s.vault, { canonical: "src/core/indexer.ts", phrases: ["the flaky thing"] });
    await addAlias(s.vault, { canonical: "src/core/watcher.ts", phrases: ["the flaky thing"] });
    const report = await lintVault(s.vault, { checkAliasConflicts: true });
    expect(report.byRule.alias_conflicts).toHaveLength(1);
    expect(report.byRule.alias_conflicts[0].message).toContain("the flaky thing");
    expect(report.byRule.alias_conflicts[0].message).toContain("2 targets");
  });

  it("is clean when each phrase maps to one canonical", async () => {
    const s = await seedVault();
    root = s.root;
    await addAlias(s.vault, { canonical: "a.md", phrases: ["thing a"] });
    await addAlias(s.vault, { canonical: "b.md", phrases: ["thing b"] });
    const report = await lintVault(s.vault, { checkAliasConflicts: true });
    expect(report.byRule.alias_conflicts).toEqual([]);
  });

  it("is a no-op (empty) when checkAliasConflicts is not set — opt-in only", async () => {
    const s = await seedVault();
    root = s.root;
    await addAlias(s.vault, { canonical: "a.md", phrases: ["dup"] });
    await addAlias(s.vault, { canonical: "b.md", phrases: ["dup"] });
    const report = await lintVault(s.vault);
    expect(report.byRule.alias_conflicts).toEqual([]);
  });
});
