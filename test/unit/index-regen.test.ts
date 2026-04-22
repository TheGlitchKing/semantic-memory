import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { regenDirectoryIndex, regenIndexesForPaths } from "../../src/core/index-regen.js";
import { createTempVault, cleanupTempDir } from "../setup.js";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function seed(dir: string, rel: string, body: string) {
  await mkdir(join(dir, rel, ".."), { recursive: true });
  await writeFile(join(dir, rel), body, "utf-8");
}

describe("index-regen", () => {
  let tempDir: string;
  beforeEach(async () => {
    tempDir = await createTempVault();
  });
  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("creates INDEX.md listing notes in a directory", async () => {
    await seed(
      tempDir,
      "docs-alpha/alpha.md",
      "---\ntitle: Alpha\npurpose: short description\n---\n# Alpha\n"
    );
    await seed(tempDir, "docs-alpha/beta.md", "---\ntitle: Beta\n---\n# Beta\n\nfirst para of beta.");
    const r = await regenDirectoryIndex(tempDir, "docs-alpha");
    expect(r.entryCount).toBe(2);
    expect(r.wrote).toBe(true);
    const body = await readFile(join(tempDir, "docs-alpha", "INDEX.md"), "utf-8");
    expect(body).toContain("Alpha");
    expect(body).toContain("Beta");
    expect(body).toContain("short description");
    expect(body).toContain("first para of beta.");
  });

  it("is idempotent — second run with unchanged content does not rewrite", async () => {
    await seed(tempDir, "docs-alpha/alpha.md", "---\ntitle: Alpha\n---\n# Alpha\n");
    const r1 = await regenDirectoryIndex(tempDir, "docs-alpha");
    expect(r1.wrote).toBe(true);
    const r2 = await regenDirectoryIndex(tempDir, "docs-alpha");
    expect(r2.wrote).toBe(false);
  });

  it("regenIndexesForPaths dedupes to affected directories", async () => {
    await seed(tempDir, "a/x.md", "---\ntitle: X\n---\nX");
    await seed(tempDir, "a/y.md", "---\ntitle: Y\n---\nY");
    await seed(tempDir, "b/z.md", "---\ntitle: Z\n---\nZ");
    const r = await regenIndexesForPaths(tempDir, ["a/x.md", "a/y.md", "b/z.md"]);
    const dirs = r.map((x) => x.directory).sort();
    expect(dirs).toEqual(["a", "b"]);
  });
});
