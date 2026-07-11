import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addAlias,
  removeAlias,
  compileLexicon,
  loadLexiconCache,
  lookupPhrase,
  expandQuery,
  normalizePhrase,
} from "../../src/core/lexicon.js";

async function seedVault(): Promise<{ root: string; vault: string }> {
  const root = await mkdtemp(join(tmpdir(), "lex-"));
  const vault = join(root, ".claude", ".vault");
  await mkdir(vault, { recursive: true });
  return { root, vault };
}

describe("lexicon", () => {
  let root: string;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("addAlias creates a lexicon note + cache; upsert bumps evidence and confidence", async () => {
    const s = await seedVault();
    root = s.root;
    const r1 = await addAlias(s.vault, { canonical: "src/core/indexer.ts", phrases: ["the indexer thing"], today: "2026-07-10" });
    expect(r1.created).toBe(true);
    expect(r1.evidence_count).toBe(1);
    expect(r1.confidence).toBe("low");
    expect(existsSync(join(s.vault, r1.path))).toBe(true);

    // same canonical, new phrase → upsert
    const r2 = await addAlias(s.vault, { canonical: "src/core/indexer.ts", phrases: ["indexer race"], today: "2026-07-11" });
    expect(r2.created).toBe(false);
    expect(r2.evidence_count).toBe(2);
    expect(r2.confidence).toBe("medium");

    const aliases = await loadLexiconCache(s.vault);
    const entry = aliases.find((a) => a.canonical === "src/core/indexer.ts")!;
    expect(entry.phrases.sort()).toEqual(["indexer race", "the indexer thing"]);
    expect(entry.evidence_count).toBe(2);
  });

  it("lookupPhrase matches exact normalized phrases", async () => {
    const s = await seedVault();
    root = s.root;
    await addAlias(s.vault, { canonical: "runbooks/deploy.md", phrases: ["the deploy dance"] });
    const aliases = await compileLexicon(s.vault);
    expect(lookupPhrase(aliases, "The Deploy Dance")[0]?.canonical).toBe("runbooks/deploy.md");
    expect(lookupPhrase(aliases, "unrelated")).toEqual([]);
  });

  it("expandQuery appends canonical targets for alias phrases found in the utterance", async () => {
    const s = await seedVault();
    root = s.root;
    await addAlias(s.vault, { canonical: "src/core/indexer.ts", phrases: ["the flaky thing"] });
    const aliases = await compileLexicon(s.vault);
    const { expanded, matched } = expandQuery(aliases, "is the flaky thing fixed?");
    expect(matched).toHaveLength(1);
    expect(expanded).toContain("src/core/indexer.ts");
    expect(expanded).toContain("is the flaky thing fixed?");

    const none = expandQuery(aliases, "how does auth work");
    expect(none.matched).toEqual([]);
    expect(none.expanded).toBe("how does auth work");
  });

  it("removeAlias deletes the note and updates the cache", async () => {
    const s = await seedVault();
    root = s.root;
    await addAlias(s.vault, { canonical: "x.md", phrases: ["x thing"] });
    expect(await removeAlias(s.vault, "x.md")).toBe(true);
    expect(await removeAlias(s.vault, "x.md")).toBe(false);
    expect(await loadLexiconCache(s.vault)).toEqual([]);
  });

  it("normalizePhrase lowercases and collapses whitespace", () => {
    expect(normalizePhrase("  The   Flaky  Thing ")).toBe("the flaky thing");
  });
});
