import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintVault } from "../../src/core/lint.js";

/**
 * Seeds <root>/.claude/.vault (notes) + <root>/.claude/.semantic-memory/selection.jsonl
 * (the selection log deriveSessionDir points at).
 */
async function seed(notes: Record<string, string>, searchLog: object[]): Promise<{ root: string; vault: string }> {
  const root = await mkdtemp(join(tmpdir(), "decaycand-"));
  const vault = join(root, ".claude", ".vault");
  await mkdir(vault, { recursive: true });
  for (const [name, body] of Object.entries(notes)) await writeFile(join(vault, name), body, "utf-8");
  const stateDir = join(root, ".claude", ".semantic-memory");
  await mkdir(stateDir, { recursive: true });
  await writeFile(join(stateDir, "selection.jsonl"), searchLog.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf-8");
  return { root, vault };
}

const OLD = "---\ntitle: Old\ntype: gotcha\nlast_verified: 2019-01-01\n---\nbody\n";
const FRESH = `---\ntitle: Fresh\ntype: note\nlast_verified: ${new Date().toISOString().slice(0, 10)}\n---\nbody\n`;

describe("lint decay_candidates", () => {
  let root: string;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("flags a frequently-retrieved but heavily-decayed note", async () => {
    const s = await seed({ "old.md": OLD }, [
      { kind: "search", tool: "search_semantic", query: "q", results: [{ path: "old.md", score: 0.8 }] },
      { kind: "search", tool: "search_semantic", query: "q2", results: [{ path: "old.md", score: 0.7 }] },
    ]);
    root = s.root;
    const report = await lintVault(s.vault, { checkDecayCandidates: true });
    expect(report.byRule.decay_candidates).toHaveLength(1);
    expect(report.byRule.decay_candidates[0].path).toBe("old.md");
    expect(report.byRule.decay_candidates[0].message).toMatch(/retrieved 2×/);
  });

  it("does not flag a fresh note even if frequently retrieved", async () => {
    const s = await seed({ "fresh.md": FRESH }, [
      { kind: "search", tool: "search_semantic", query: "q", results: [{ path: "fresh.md", score: 0.9 }] },
    ]);
    root = s.root;
    const report = await lintVault(s.vault, { checkDecayCandidates: true });
    expect(report.byRule.decay_candidates).toEqual([]);
  });

  it("is a no-op (empty) when checkDecayCandidates is not set — opt-in only", async () => {
    const s = await seed({ "old.md": OLD }, [
      { kind: "search", tool: "search_semantic", query: "q", results: [{ path: "old.md", score: 0.8 }] },
    ]);
    root = s.root;
    const report = await lintVault(s.vault);
    expect(report.byRule.decay_candidates).toEqual([]);
  });

  it("is a no-op when there is no selection log", async () => {
    const root2 = await mkdtemp(join(tmpdir(), "decaycand-nolog-"));
    root = root2;
    const vault = join(root2, ".claude", ".vault");
    await mkdir(vault, { recursive: true });
    await writeFile(join(vault, "old.md"), OLD, "utf-8");
    const report = await lintVault(vault, { checkDecayCandidates: true });
    expect(report.byRule.decay_candidates).toEqual([]);
  });
});
