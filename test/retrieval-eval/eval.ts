/**
 * Golden retrieval eval harness (v1.4 Phase 1).
 *
 * The foundation the rest of the resident-expert arc is measured against: every
 * ranking or query-expansion change must show its delta here, not a vibe.
 *
 * This module is the pure metrics engine — it takes a set of (utterance →
 * expected paths) cases and a `search` function returning ranked paths, and
 * computes recall@k and MRR (overall and per case-class). It is decoupled from
 * the search stack so it can be unit-tested with a fake search and driven by the
 * real MCP server in the integration eval.
 */

export interface EvalCase {
  /** What the human typed. */
  utterance: string;
  /** Paths that SHOULD appear in the results (a hit = any one of them ranks in top-k). */
  expected: string[];
  /** Optional case-class for per-class breakdown (e.g. "terse", "conceptual"). */
  class?: string;
}

export interface CaseResult {
  utterance: string;
  klass: string;
  /** 1-based rank of the first expected path in the results, or null if none retrieved. */
  rankOfFirstExpected: number | null;
  hitAtK: Record<number, boolean>;
  reciprocalRank: number;
}

export interface ClassMetrics {
  n: number;
  recallAtK: Record<number, number>;
  mrr: number;
}

export interface EvalMetrics extends ClassMetrics {
  ks: number[];
  byClass: Record<string, ClassMetrics>;
  cases: CaseResult[];
}

/** Returns the ranked list of note paths for a query (best first). */
export type SearchFn = (query: string, limit: number) => Promise<string[]>;

export function parseGolden(text: string): EvalCase[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//") && !l.startsWith("#"))
    .map((l) => JSON.parse(l) as EvalCase);
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export async function runEval(cases: EvalCase[], search: SearchFn, ks: number[] = [1, 3, 5]): Promise<EvalMetrics> {
  const maxK = Math.max(...ks);
  const results: CaseResult[] = [];

  for (const c of cases) {
    const ranked = await search(c.utterance, maxK);
    const expected = new Set(c.expected);
    let rank: number | null = null;
    for (let i = 0; i < ranked.length; i++) {
      if (expected.has(ranked[i])) {
        rank = i + 1;
        break;
      }
    }
    const hitAtK: Record<number, boolean> = {};
    for (const k of ks) hitAtK[k] = rank !== null && rank <= k;
    results.push({
      utterance: c.utterance,
      klass: c.class ?? "default",
      rankOfFirstExpected: rank,
      hitAtK,
      reciprocalRank: rank ? 1 / rank : 0,
    });
  }

  const aggregate = (rs: CaseResult[]): ClassMetrics => ({
    n: rs.length,
    recallAtK: Object.fromEntries(ks.map((k) => [k, mean(rs.map((r) => (r.hitAtK[k] ? 1 : 0)))])),
    mrr: mean(rs.map((r) => r.reciprocalRank)),
  });

  const byClass: Record<string, ClassMetrics> = {};
  for (const klass of new Set(results.map((r) => r.klass))) {
    byClass[klass] = aggregate(results.filter((r) => r.klass === klass));
  }

  return { ks, ...aggregate(results), byClass, cases: results };
}

export function formatReport(m: EvalMetrics): string {
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const lines: string[] = [];
  lines.push(`Retrieval eval — ${m.n} cases`);
  lines.push(`  overall:  ${m.ks.map((k) => `recall@${k}=${pct(m.recallAtK[k])}`).join("  ")}  MRR=${m.mrr.toFixed(3)}`);
  for (const [klass, cm] of Object.entries(m.byClass).sort()) {
    lines.push(`  ${klass.padEnd(12)} (${cm.n}): ${m.ks.map((k) => `recall@${k}=${pct(cm.recallAtK[k])}`).join("  ")}  MRR=${cm.mrr.toFixed(3)}`);
  }
  const misses = m.cases.filter((c) => c.rankOfFirstExpected === null);
  if (misses.length) {
    lines.push(`  complete misses (${misses.length}):`);
    for (const c of misses) lines.push(`    ✗ [${c.klass}] "${c.utterance}"`);
  }
  return lines.join("\n");
}
