import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintVault } from "../../src/core/lint.js";

/** Seed a vault + a selection log with the given events. */
async function seed(events: unknown[], notes: Record<string, string> = {}): Promise<{ root: string; vault: string }> {
  const root = await mkdtemp(join(tmpdir(), "decoys-"));
  const vault = join(root, ".claude", ".vault");
  // deriveSessionDir(vault) resolves to <root>/.claude/.semantic-memory (project root).
  const sessionDir = join(root, ".claude", ".semantic-memory");
  await mkdir(vault, { recursive: true });
  await mkdir(sessionDir, { recursive: true });
  for (const [name, body] of Object.entries(notes)) {
    await writeFile(join(vault, name), body, "utf-8");
  }
  const log = events.map((e) => JSON.stringify(e)).join("\n");
  await writeFile(join(sessionDir, "selection.jsonl"), log + "\n", "utf-8");
  return { root, vault };
}

function searchOf(path: string) {
  return { kind: "search", tool: "search_semantic", query: "q", results: [{ path, score: 0.9 }] };
}

describe("lint decoys", () => {
  let root: string;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("flags a note retrieved 3+ times but never cited", async () => {
    const note = "---\ntitle: Decoy\nstatus: active\n---\nbody\n";
    const s = await seed([searchOf("decoy.md"), searchOf("decoy.md"), searchOf("decoy.md")], { "decoy.md": note });
    root = s.root;
    const report = await lintVault(s.vault, { checkDecoys: true });
    expect(report.byRule.decoys).toHaveLength(1);
    expect(report.byRule.decoys[0].path).toBe("decoy.md");
    expect(report.byRule.decoys[0].message).toContain("retrieved 3");
    expect(report.byRule.decoys[0].message).toContain("never cited");
  });

  it("does NOT flag a note that was cited", async () => {
    const note = "---\ntitle: Used\nstatus: active\n---\nbody\n";
    const s = await seed(
      [searchOf("used.md"), searchOf("used.md"), searchOf("used.md"), { kind: "selection", note_path: "used.md", via: "read_note" }],
      { "used.md": note }
    );
    root = s.root;
    const report = await lintVault(s.vault, { checkDecoys: true });
    expect(report.byRule.decoys).toEqual([]);
  });

  it("does NOT flag a note retrieved fewer than 3 times (below the signal floor)", async () => {
    const note = "---\ntitle: Rare\nstatus: active\n---\nbody\n";
    const s = await seed([searchOf("rare.md"), searchOf("rare.md")], { "rare.md": note });
    root = s.root;
    const report = await lintVault(s.vault, { checkDecoys: true });
    expect(report.byRule.decoys).toEqual([]);
  });

  it("is a no-op when checkDecoys is not set (opt-in only)", async () => {
    const note = "---\ntitle: Decoy\nstatus: active\n---\nbody\n";
    const s = await seed([searchOf("decoy.md"), searchOf("decoy.md"), searchOf("decoy.md")], { "decoy.md": note });
    root = s.root;
    const report = await lintVault(s.vault);
    expect(report.byRule.decoys).toEqual([]);
  });
});
