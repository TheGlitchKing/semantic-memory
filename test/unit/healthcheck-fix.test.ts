import { describe, it, expect } from "vitest";
import { planFixes } from "../../src/core/healthcheck-fix.js";
import type { DriftFinding } from "../../src/core/healthcheck.js";

function f(partial: Partial<DriftFinding> & { check: string }): DriftFinding {
  return { severity: "warn", summary: "x", ...partial };
}

describe("planFixes", () => {
  it("maps the four safe fixable_via actions to planned fixes", () => {
    const plan = planFixes([
      f({ check: "skill_manifest:claude", fixable_via: "skill-link" }),
      f({ check: "mcp_json_entry", fixable_via: "mcp-reconcile" }),
      f({ check: "index_freshness", fixable_via: "reindex" }),
      f({ check: "legacy_state_files", fixable_via: "state-migrate" }),
    ]);
    expect(plan.fixes.map((x) => x.action).sort()).toEqual(
      ["mcp-reconcile", "reindex", "skill-link", "state-migrate"].sort(),
    );
    expect(plan.skipped).toEqual([]);
  });

  it("routes regenerate-contract findings to human review, not an auto-fix", () => {
    const plan = planFixes([f({ check: "agents_contract", fixable_via: "regenerate-contract" })]);
    expect(plan.fixes).toEqual([]);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0].check).toBe("agents_contract");
    expect(plan.skipped[0].reason).toMatch(/AGENTS\.md/);
  });

  it("skips findings with no fixable action, with a per-check reason", () => {
    const plan = planFixes([
      f({ check: "lint_vault", fixable_via: "none" }),
      f({ check: "session_staleness" }), // no fixable_via
    ]);
    expect(plan.fixes).toEqual([]);
    expect(plan.skipped.map((s) => s.check).sort()).toEqual(["lint_vault", "session_staleness"]);
    expect(plan.skipped.find((s) => s.check === "session_staleness")?.reason).toMatch(/session/i);
  });

  it("ignores ok findings entirely", () => {
    const plan = planFixes([
      f({ check: "plugin_version", severity: "ok" }),
      f({ check: "hook_registration", severity: "ok" }),
    ]);
    expect(plan.fixes).toEqual([]);
    expect(plan.skipped).toEqual([]);
  });

  it("falls back to a generic reason for an unknown non-fixable check", () => {
    const plan = planFixes([f({ check: "some_future_check" })]);
    expect(plan.skipped[0].reason).toMatch(/no automatic fix/i);
  });
});
