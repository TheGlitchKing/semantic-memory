import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expandQueryViaLexicon } from "../../hooks/vault-context.js";

/** Seed <root>/.claude/.semantic-memory/lexicon-cache.json (what the hook reads). */
async function seedCache(aliases: unknown[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "qexp-"));
  const dir = join(root, ".claude", ".semantic-memory");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "lexicon-cache.json"), JSON.stringify({ aliases }), "utf-8");
  return root;
}

describe("Tier-1 lexicon query expansion (hook)", () => {
  let root: string;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("appends the canonical target when a phrase appears in the utterance", async () => {
    root = await seedCache([{ canonical: "src/core/indexer.ts", phrases: ["the flaky thing"] }]);
    const expanded = expandQueryViaLexicon(root, "is the flaky thing fixed?");
    expect(expanded).toContain("is the flaky thing fixed?");
    expect(expanded).toContain("src/core/indexer.ts");
  });

  it("is case/whitespace-insensitive on the phrase match", async () => {
    root = await seedCache([{ canonical: "runbooks/deploy.md", phrases: ["the deploy dance"] }]);
    expect(expandQueryViaLexicon(root, "walk me through The  Deploy   Dance please")).toContain("runbooks/deploy.md");
  });

  it("returns the query unchanged when no phrase matches", async () => {
    root = await seedCache([{ canonical: "x.md", phrases: ["something else"] }]);
    expect(expandQueryViaLexicon(root, "how does auth work")).toBe("how does auth work");
  });

  it("returns the query unchanged when there is no lexicon cache", async () => {
    root = await mkdtemp(join(tmpdir(), "qexp-empty-"));
    expect(expandQueryViaLexicon(root, "the flaky thing")).toBe("the flaky thing");
  });
});
