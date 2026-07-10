import type { DriftFinding } from "./healthcheck.js";

/**
 * The `--fix` planner. Pure, side-effect-free: it maps drift findings onto safe
 * auto-fix actions, or explains why a finding needs a human. The CLI executes the
 * plan; keeping the decision logic here makes it unit-testable without spawning.
 *
 * "Safe" means: idempotent, non-destructive, and derivable from the install itself
 * (re-link skills, reconcile .mcp.json, rebuild the derived index, migrate state).
 * Anything that touches user-authored content (stale notes, broken wikilinks,
 * hand-edited AGENTS.md) is deliberately NOT auto-fixed — it drops to `skipped`
 * with a pointer to the manual remedy.
 */

export type FixAction = "skill-link" | "mcp-reconcile" | "reindex" | "state-migrate";

export interface PlannedFix {
  check: string;
  action: FixAction;
  summary: string;
}

export interface SkippedFinding {
  check: string;
  reason: string;
}

export interface FixPlan {
  fixes: PlannedFix[];
  skipped: SkippedFinding[];
}

/** Human-readable reason a finding is not auto-fixable. */
const MANUAL_REASON: Record<string, string> = {
  "regenerate-contract":
    "AGENTS.md needs a human decision — run `/contract` (regenerate_contract), or move custom content into a Local Notes section outside the managed block.",
  lint_vault:
    "Vault lint findings (stale notes, broken wikilinks, schema violations) require human review — run `lint_vault` for the full report.",
  session_staleness:
    "Resume the session (session_run / session_finish) or remove .claude/.semantic-memory/session.json to abandon it.",
};

/**
 * Build the fix plan from a set of drift findings. Only findings with
 * severity !== "ok" are considered.
 */
export function planFixes(findings: DriftFinding[]): FixPlan {
  const fixes: PlannedFix[] = [];
  const skipped: SkippedFinding[] = [];

  for (const f of findings) {
    if (f.severity === "ok") continue;

    switch (f.fixable_via) {
      case "skill-link":
        fixes.push({ check: f.check, action: "skill-link", summary: f.summary });
        break;
      case "mcp-reconcile":
        fixes.push({ check: f.check, action: "mcp-reconcile", summary: f.summary });
        break;
      case "reindex":
        fixes.push({ check: f.check, action: "reindex", summary: f.summary });
        break;
      case "state-migrate":
        fixes.push({ check: f.check, action: "state-migrate", summary: f.summary });
        break;
      case "regenerate-contract":
        // The only case this fires is a custom AGENTS.md without managed markers,
        // where regeneration would refuse anyway. Treat as human-review.
        skipped.push({ check: f.check, reason: MANUAL_REASON["regenerate-contract"] });
        break;
      default:
        skipped.push({
          check: f.check,
          reason: MANUAL_REASON[f.check] ?? "No automatic fix available — needs human review.",
        });
    }
  }

  return { fixes, skipped };
}
