import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { minimatch } from "minimatch";

/**
 * Path-class ranking multiplier (v1.4 Phase 2).
 *
 * Down-weights whole regions of the vault by path glob — the direct fix for the
 * observed failure where `archive/` and `archive/pre-restructure/` copies of a
 * retired doc dominated the top hits. Composes multiplicatively with decay and
 * load_priority at the same `context.ts` rank site; it never removes notes, only
 * ranks them lower. First matching rule wins.
 */

export interface PathClassRule {
  glob: string;
  multiplier: number;
}

export interface PathClassConfig {
  enabled: boolean;
  rules: PathClassRule[];
}

export const DEFAULT_PATH_CLASS_CONFIG: PathClassConfig = {
  enabled: true,
  rules: [{ glob: "archive/**", multiplier: 0.3 }],
};

/** The multiplier for a note path — first matching rule, else 1.0 (no effect). */
export function pathClassMultiplier(path: string, config: PathClassConfig): number {
  if (!config.enabled) return 1;
  for (const rule of config.rules) {
    if (typeof rule.multiplier !== "number") continue;
    if (minimatch(path, rule.glob)) return rule.multiplier;
  }
  return 1;
}

/**
 * Load `path_class` from vault.schema.yml, merged over the default. Missing file /
 * block / parse error → default. Synchronous + memoization-friendly.
 */
export function loadPathClassConfig(vaultPath: string): PathClassConfig {
  try {
    const schemaPath = join(vaultPath, "vault.schema.yml");
    if (!existsSync(schemaPath)) return DEFAULT_PATH_CLASS_CONFIG;
    const parsed = parseYaml(readFileSync(schemaPath, "utf-8")) as { path_class?: Partial<PathClassConfig> } | null;
    const p = parsed?.path_class;
    if (!p || typeof p !== "object") return DEFAULT_PATH_CLASS_CONFIG;
    return {
      enabled: typeof p.enabled === "boolean" ? p.enabled : DEFAULT_PATH_CLASS_CONFIG.enabled,
      rules: Array.isArray(p.rules)
        ? p.rules.filter((r): r is PathClassRule => !!r && typeof r.glob === "string" && typeof r.multiplier === "number")
        : DEFAULT_PATH_CLASS_CONFIG.rules,
    };
  } catch {
    return DEFAULT_PATH_CLASS_CONFIG;
  }
}
