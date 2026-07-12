import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { readSelectionLog } from "./telemetry.js";

/**
 * Usage-feedback ranking (v1.5 Phase 9).
 *
 * Consumes the v1.3.1 selection log — which notes actually got cited after being
 * retrieved — and turns repeated citations into a bounded rank boost. Load-bearing
 * knowledge floats up; the cap keeps a feedback runaway (cited → ranks higher →
 * cited more) from ever compounding past 1.5×. Composes multiplicatively with
 * decay + load_priority + path-class at the shared context.ts rank site: a
 * stale-but-cited note still decays, a cited-but-archived note still down-weights.
 *
 * The complementary signal — retrieved-but-NEVER-cited "decoys" — is surfaced by a
 * lint rule (see lint.ts findDecoys), never auto-down-ranked. Ambiguous evidence
 * gets a human's eyes, not a silent reorder (v1.5 decision Q5).
 */

export interface UsageBoostConfig {
  enabled: boolean;
  /** Maximum multiplier a note can earn from citations (feedback-runaway cap). */
  cap: number;
  /** Multiplier increment per citation, before the cap. */
  per_citation: number;
}

export const DEFAULT_USAGE_BOOST_CONFIG: UsageBoostConfig = {
  enabled: true,
  cap: 1.5,
  per_citation: 0.1,
};

/**
 * Load usage-boost config from vault.schema.yml (`usage_boost` block), merged over
 * the shipped defaults. Fails open to defaults when the schema is missing/unreadable.
 */
export function loadUsageBoostConfig(vaultPath: string): UsageBoostConfig {
  try {
    const schemaPath = join(vaultPath, "vault.schema.yml");
    if (!existsSync(schemaPath)) return { ...DEFAULT_USAGE_BOOST_CONFIG };
    const parsed = parseYaml(readFileSync(schemaPath, "utf-8")) as { usage_boost?: Partial<UsageBoostConfig> } | null;
    const u = parsed?.usage_boost;
    if (!u || typeof u !== "object") return { ...DEFAULT_USAGE_BOOST_CONFIG };
    return {
      enabled: typeof u.enabled === "boolean" ? u.enabled : DEFAULT_USAGE_BOOST_CONFIG.enabled,
      cap: typeof u.cap === "number" && u.cap >= 1 ? u.cap : DEFAULT_USAGE_BOOST_CONFIG.cap,
      per_citation: typeof u.per_citation === "number" && u.per_citation >= 0 ? u.per_citation : DEFAULT_USAGE_BOOST_CONFIG.per_citation,
    };
  } catch {
    return { ...DEFAULT_USAGE_BOOST_CONFIG };
  }
}

/**
 * The multiplier a note with `citations` citations earns: 1 + citations·per_citation,
 * clamped to [1, cap]. Zero citations (or a disabled config) → 1.0 (no-op).
 */
export function computeUsageBoost(citations: number, config: UsageBoostConfig): number {
  if (!config.enabled || citations <= 0) return 1;
  return Math.min(config.cap, 1 + citations * config.per_citation);
}

/**
 * Citation counts per note path, derived from the selection log's `selection`
 * events. Returns {} when telemetry is absent/empty — the boost is then a no-op.
 */
export async function loadCitationCounts(vaultPath: string): Promise<Record<string, number>> {
  const events = await readSelectionLog(vaultPath);
  const counts: Record<string, number> = {};
  for (const e of events) {
    if (e.kind === "selection") counts[e.note_path] = (counts[e.note_path] ?? 0) + 1;
  }
  return counts;
}
