import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

/**
 * Confidence decay (v1.3).
 *
 * Pure, side-effect-free ranking signal: a note's relevance decays smoothly with
 * the time since it was last *verified* (not merely edited). Load-bearing notes
 * resist decay (longer half-life), source notes never decay, evergreen notes are
 * pinned until their evergreen claim itself expires, and an explicit re-verify
 * resets the clock.
 *
 * The multiplier composes MULTIPLICATIVELY with the existing priority/confidence
 * signals at search time — it never replaces them. Floored so notes down-weight
 * but never disappear.
 */

export interface DecayConfig {
  enabled: boolean;
  default_half_life_days: number;
  /** Per-type half-life in days. `null` means "never decays" (e.g. source notes). */
  per_type: Partial<Record<string, number | null>>;
  floor: number;
  hotness_boost: { enabled: boolean; cap: number };
}

export interface DecayInput {
  type?: string;
  last_verified?: string;
  evergreen?: boolean;
  inbound_link_count?: number;
  config: DecayConfig;
  /** Override "now" — used by tests. */
  nowMs?: number;
}

export interface DecayResult {
  multiplier: number;
  age_days: number;
  effective_half_life: number;
  reason: string;
  evergreen?: boolean;
}

/**
 * Normalize a frontmatter `last_verified` value to an ISO string. YAML parses an
 * unquoted `last_verified: 2019-01-01` into a Date, not a string, so a bare
 * `typeof === "string"` check would silently drop it and disable decay. Accepts
 * string or Date; anything else → undefined (fail open).
 */
export function normalizeVerifiedDate(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  return undefined;
}

/** The default decay config, mirrored in the default vault schema YAML. */
export const DEFAULT_DECAY_CONFIG: DecayConfig = {
  enabled: true,
  default_half_life_days: 365,
  per_type: {
    decision: 365,
    note: 365,
    gotcha: 180,
    source: null, // never decays
    proposal: 14,
  },
  floor: 0.1,
  hotness_boost: { enabled: false, cap: 2.0 },
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EVERGREEN_MAX_AGE_DAYS = 365;

function fresh(reason: string, ageDays = 0, halfLife = 0, evergreen?: boolean): DecayResult {
  return { multiplier: 1.0, age_days: ageDays, effective_half_life: halfLife, reason, evergreen };
}

/**
 * Compute the decay multiplier for one note. Fails open (multiplier 1.0) on any
 * uncertainty — disabled config, missing/invalid/future last_verified — so decay
 * can only ever DOWN-rank a note we're confident is old, never penalize ambiguity.
 */
export function computeDecay(input: DecayInput): DecayResult {
  const { config } = input;
  if (!config.enabled) return fresh("decay disabled");

  // Resolve half-life. A `null` per-type entry means this type never decays.
  let halfLife = config.default_half_life_days;
  if (input.type && Object.prototype.hasOwnProperty.call(config.per_type, input.type)) {
    const perType = config.per_type[input.type];
    if (perType === null) {
      return fresh(`type=${input.type} never decays`, ageDaysOf(input), Infinity);
    }
    if (typeof perType === "number" && perType > 0) halfLife = perType;
  }

  // Age since last verification. Missing/invalid/future → fail open.
  if (!input.last_verified) return fresh("no last_verified (fail open)", 0, halfLife);
  const lastMs = Date.parse(input.last_verified);
  if (Number.isNaN(lastMs)) return fresh("unparseable last_verified (fail open)", 0, halfLife);
  const now = input.nowMs ?? Date.now();
  const ageDays = (now - lastMs) / MS_PER_DAY;
  if (ageDays <= 0) return fresh("last_verified in the future (fail open)", ageDays, halfLife);

  // Evergreen: pinned at 1.0 while its verification is fresh; falls through to
  // normal decay once the evergreen claim is older than a year (forces re-affirmation).
  if (input.evergreen && ageDays < EVERGREEN_MAX_AGE_DAYS) {
    return fresh("evergreen (verified within 365d)", ageDays, halfLife, true);
  }

  // Backlink hotness (Phase 7 — feature-flagged off by default): a heavily-linked
  // note is likely load-bearing, so extend its effective half-life.
  let effHalfLife = halfLife;
  if (config.hotness_boost.enabled && input.inbound_link_count && input.inbound_link_count > 0) {
    const boost = Math.min(input.inbound_link_count / 5, config.hotness_boost.cap - 1);
    effHalfLife = halfLife * (1 + Math.max(boost, 0));
  }

  const raw = Math.pow(0.5, ageDays / effHalfLife);
  const multiplier = Math.max(raw, config.floor);
  return {
    multiplier,
    age_days: ageDays,
    effective_half_life: effHalfLife,
    reason: `type=${input.type ?? "default"}`,
    evergreen: input.evergreen,
  };
}

function ageDaysOf(input: DecayInput): number {
  if (!input.last_verified) return 0;
  const lastMs = Date.parse(input.last_verified);
  if (Number.isNaN(lastMs)) return 0;
  const now = input.nowMs ?? Date.now();
  return Math.max((now - lastMs) / MS_PER_DAY, 0);
}

/**
 * Load the decay config from a vault's `vault.schema.yml` `decay:` block, merged
 * over the shipped defaults. Missing file / block / parse error → defaults.
 * Synchronous + memoization-friendly (callers cache the result).
 */
export function loadDecayConfig(vaultPath: string): DecayConfig {
  try {
    const schemaPath = join(vaultPath, "vault.schema.yml");
    if (!existsSync(schemaPath)) return DEFAULT_DECAY_CONFIG;
    const parsed = parseYaml(readFileSync(schemaPath, "utf-8")) as { decay?: Partial<DecayConfig> } | null;
    const d = parsed?.decay;
    if (!d || typeof d !== "object") return DEFAULT_DECAY_CONFIG;
    return {
      enabled: typeof d.enabled === "boolean" ? d.enabled : DEFAULT_DECAY_CONFIG.enabled,
      default_half_life_days:
        typeof d.default_half_life_days === "number" ? d.default_half_life_days : DEFAULT_DECAY_CONFIG.default_half_life_days,
      per_type: { ...DEFAULT_DECAY_CONFIG.per_type, ...(d.per_type ?? {}) },
      floor: typeof d.floor === "number" ? d.floor : DEFAULT_DECAY_CONFIG.floor,
      hotness_boost: { ...DEFAULT_DECAY_CONFIG.hotness_boost, ...(d.hotness_boost ?? {}) },
    };
  } catch {
    return DEFAULT_DECAY_CONFIG;
  }
}
