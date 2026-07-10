import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintVault } from "../../src/core/lint.js";

/**
 * Seeds a fake repo:  <root>/src/core/exists.ts  +  <root>/.claude/.vault/<notes>
 * so deriveProjectRoot(vault) resolves back to <root>.
 */
async function seedRepo(notes: Record<string, string>): Promise<{ root: string; vault: string }> {
  const root = await mkdtemp(join(tmpdir(), "codesym-"));
  await mkdir(join(root, "src", "core"), { recursive: true });
  await writeFile(join(root, "src", "core", "exists.ts"), "export const x = 1;\n", "utf-8");
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fake" }), "utf-8");
  const vault = join(root, ".claude", ".vault");
  await mkdir(vault, { recursive: true });
  for (const [name, body] of Object.entries(notes)) {
    await writeFile(join(vault, name), body, "utf-8");
  }
  return { root, vault };
}

describe("lint code_symbols", () => {
  let root: string;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("flags an inline-code path anchored in a real dir that no longer exists", async () => {
    const seed = await seedRepo({
      "note.md": "See `src/core/gone.ts` for the impl.\n",
    });
    root = seed.root;
    const report = await lintVault(seed.vault, { checkCodeSymbols: true });
    expect(report.byRule.code_symbols).toHaveLength(1);
    expect(report.byRule.code_symbols[0].message).toContain("src/core/gone.ts");
  });

  it("does not flag a path that exists", async () => {
    const seed = await seedRepo({
      "note.md": "The code lives at `src/core/exists.ts`.\n",
    });
    root = seed.root;
    const report = await lintVault(seed.vault, { checkCodeSymbols: true });
    expect(report.byRule.code_symbols).toEqual([]);
  });

  it("skips paths anchored in a dir that isn't in this repo (other project)", async () => {
    const seed = await seedRepo({
      "note.md": "In the other repo, `app/models/user.rb` handles it.\n",
    });
    root = seed.root;
    const report = await lintVault(seed.vault, { checkCodeSymbols: true });
    expect(report.byRule.code_symbols).toEqual([]);
  });

  it("ignores URLs, globs, and prose that merely contains a slash", async () => {
    const seed = await seedRepo({
      "note.md": "See `https://example.com/app.js`, `src/**/*.ts`, and `and/or logic`.\n",
    });
    root = seed.root;
    const report = await lintVault(seed.vault, { checkCodeSymbols: true });
    expect(report.byRule.code_symbols).toEqual([]);
  });

  it("is a no-op (empty) when checkCodeSymbols is not set — opt-in only", async () => {
    const seed = await seedRepo({
      "note.md": "Stale ref `src/core/gone.ts` here.\n",
    });
    root = seed.root;
    const report = await lintVault(seed.vault);
    expect(report.byRule.code_symbols).toEqual([]);
  });

  it("fails open when the root is not a code repo", async () => {
    // vault with no repo markers around it
    const bare = await mkdtemp(join(tmpdir(), "bare-"));
    root = bare;
    await writeFile(join(bare, "note.md"), "Ref `src/core/gone.ts`.\n", "utf-8");
    const report = await lintVault(bare, { checkCodeSymbols: true });
    expect(report.byRule.code_symbols).toEqual([]);
  });
});
