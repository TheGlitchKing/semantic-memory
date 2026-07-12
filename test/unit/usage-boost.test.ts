import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeUsageBoost,
  loadUsageBoostConfig,
  loadCitationCounts,
  DEFAULT_USAGE_BOOST_CONFIG,
} from "../../src/core/usage-boost.js";

const CFG = DEFAULT_USAGE_BOOST_CONFIG;

describe("computeUsageBoost", () => {
  it("is a no-op (1.0) with zero citations or when disabled", () => {
    expect(computeUsageBoost(0, CFG)).toBe(1);
    expect(computeUsageBoost(5, { ...CFG, enabled: false })).toBe(1);
  });

  it("grows linearly per citation below the cap", () => {
    expect(computeUsageBoost(1, CFG)).toBeCloseTo(1.1);
    expect(computeUsageBoost(3, CFG)).toBeCloseTo(1.3);
  });

  it("clamps at the cap to prevent a feedback runaway", () => {
    expect(computeUsageBoost(100, CFG)).toBe(1.5);
    expect(computeUsageBoost(6, CFG)).toBe(1.5); // 1 + 6*0.1 = 1.6 → capped
  });
});

describe("loadUsageBoostConfig", () => {
  let root: string;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("returns defaults when no schema exists", async () => {
    root = await mkdtemp(join(tmpdir(), "ub-"));
    expect(loadUsageBoostConfig(root)).toEqual(DEFAULT_USAGE_BOOST_CONFIG);
  });

  it("reads overrides from the usage_boost block", async () => {
    root = await mkdtemp(join(tmpdir(), "ub-"));
    await writeFile(join(root, "vault.schema.yml"), "usage_boost:\n  enabled: false\n  cap: 2.0\n  per_citation: 0.25\n", "utf-8");
    expect(loadUsageBoostConfig(root)).toEqual({ enabled: false, cap: 2.0, per_citation: 0.25 });
  });

  it("ignores nonsense values and falls back per-field", async () => {
    root = await mkdtemp(join(tmpdir(), "ub-"));
    await writeFile(join(root, "vault.schema.yml"), "usage_boost:\n  cap: 0.2\n", "utf-8"); // cap < 1 invalid
    expect(loadUsageBoostConfig(root).cap).toBe(DEFAULT_USAGE_BOOST_CONFIG.cap);
  });
});

describe("loadCitationCounts", () => {
  let root: string;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("counts selection events per note path", async () => {
    root = await mkdtemp(join(tmpdir(), "ub-cite-"));
    const dir = join(root, ".claude", ".semantic-memory");
    await mkdir(dir, { recursive: true });
    const lines = [
      { kind: "search", tool: "search_semantic", query: "q", results: [{ path: "a.md", score: 1 }] },
      { kind: "selection", note_path: "a.md", via: "read_note" },
      { kind: "selection", note_path: "a.md", via: "read_note" },
      { kind: "selection", note_path: "b.md", via: "read_note" },
    ].map((e) => JSON.stringify(e)).join("\n");
    await writeFile(join(dir, "selection.jsonl"), lines + "\n", "utf-8");
    const counts = await loadCitationCounts(root);
    expect(counts["a.md"]).toBe(2);
    expect(counts["b.md"]).toBe(1);
  });

  it("returns {} when there is no selection log", async () => {
    root = await mkdtemp(join(tmpdir(), "ub-empty-"));
    expect(await loadCitationCounts(root)).toEqual({});
  });
});
