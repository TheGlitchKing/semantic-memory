import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildIngestChangeSet } from "../../src/core/ingest.js";
import { applyPatch } from "../../src/core/patch.js";
import { createTempVault, cleanupTempDir } from "../setup.js";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("buildIngestChangeSet", () => {
  it("creates source note + one note per unit, with derived_from wiring", () => {
    const r = buildIngestChangeSet({
      source: {
        source_uri: "https://example.com/rfc-1",
        source_title: "RFC-1",
      },
      units: [
        { path: "notes/foo.md", content: "Foo body." },
        { path: "notes/bar.md", content: "Bar body.", type: "gotcha" },
      ],
    });
    expect(r.changeset.creates).toHaveLength(3);
    expect(r.sourcePath).toBe("sources/rfc-1.md");
    const [src, foo, bar] = r.changeset.creates!;
    expect(src.frontmatter!.type).toBe("source");
    expect((foo.frontmatter!.derived_from as string[])[0]).toBe(r.sourcePath);
    expect((bar.frontmatter!.derived_from as string[])[0]).toBe(r.sourcePath);
    expect(bar.frontmatter!.type).toBe("gotcha");
  });
});

describe("ingest + applyPatch integration", () => {
  let tempDir: string;
  beforeEach(async () => {
    tempDir = await createTempVault();
  });
  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("writes source + units atomically", async () => {
    const preview = buildIngestChangeSet({
      source: { source_uri: "x://y", source_title: "Source Title" },
      units: [
        { path: "notes/unit-one.md", content: "body one" },
        { path: "notes/unit-two.md", content: "body two" },
      ],
    });
    const r = await applyPatch(tempDir, preview.changeset, { regenIndexes: false });
    expect(r.ok).toBe(true);
    expect(existsSync(join(tempDir, preview.sourcePath))).toBe(true);
    for (const p of preview.unitPaths) {
      expect(existsSync(join(tempDir, p))).toBe(true);
      const body = await readFile(join(tempDir, p), "utf-8");
      expect(body).toContain("derived_from");
      expect(body).toContain(preview.sourcePath);
    }
  });
});
