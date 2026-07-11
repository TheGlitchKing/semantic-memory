import { describe, it, expect } from "vitest";
import { runEval, parseGolden, formatReport, type SearchFn, type EvalCase } from "./eval.js";

/** Fake search: returns a fixed ranking per query, keyed exactly. */
function fakeSearch(rankings: Record<string, string[]>): SearchFn {
  return async (query, limit) => (rankings[query] ?? []).slice(0, limit);
}

describe("eval metrics engine", () => {
  it("computes recall@k and MRR with per-class breakdown", async () => {
    const cases: EvalCase[] = [
      { utterance: "q-hit1", expected: ["a.md"], class: "conceptual" }, // rank 1
      { utterance: "q-hit3", expected: ["c.md"], class: "conceptual" }, // rank 3
      { utterance: "q-miss", expected: ["z.md"], class: "terse" }, // not retrieved
    ];
    const search = fakeSearch({
      "q-hit1": ["a.md", "b.md", "x.md", "y.md", "w.md"],
      "q-hit3": ["x.md", "y.md", "c.md", "z.md", "w.md"],
      "q-miss": ["x.md", "y.md", "w.md"],
    });
    const m = await runEval(cases, search, [1, 3, 5]);

    expect(m.n).toBe(3);
    // recall@1: only q-hit1 hits → 1/3
    expect(m.recallAtK[1]).toBeCloseTo(1 / 3, 5);
    // recall@3: q-hit1 + q-hit3 → 2/3
    expect(m.recallAtK[3]).toBeCloseTo(2 / 3, 5);
    expect(m.recallAtK[5]).toBeCloseTo(2 / 3, 5);
    // MRR: (1/1 + 1/3 + 0) / 3
    expect(m.mrr).toBeCloseTo((1 + 1 / 3 + 0) / 3, 5);

    // per-class
    expect(m.byClass.conceptual.n).toBe(2);
    expect(m.byClass.conceptual.recallAtK[3]).toBeCloseTo(1, 5);
    expect(m.byClass.terse.n).toBe(1);
    expect(m.byClass.terse.recallAtK[5]).toBe(0);
  });

  it("records complete misses (rankOfFirstExpected null, RR 0)", async () => {
    const m = await runEval(
      [{ utterance: "q", expected: ["never.md"] }],
      fakeSearch({ q: ["a.md", "b.md"] })
    );
    expect(m.cases[0].rankOfFirstExpected).toBeNull();
    expect(m.cases[0].reciprocalRank).toBe(0);
    expect(formatReport(m)).toMatch(/complete misses \(1\)/);
  });

  it("parseGolden skips comments and blank lines", () => {
    const text = `// header comment\n\n{"utterance":"a","expected":["x.md"]}\n# another comment\n{"utterance":"b","expected":["y.md"],"class":"terse"}\n`;
    const cases = parseGolden(text);
    expect(cases).toHaveLength(2);
    expect(cases[1].class).toBe("terse");
  });
});
