import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { lintVault } from "../../core/lint.js";

type LintCheck = "schema" | "provenance" | "stale" | "broken_links";
const ALL_CHECKS: LintCheck[] = ["schema", "provenance", "stale", "broken_links"];

const RULE_KEY_FOR_CHECK: Record<LintCheck, "schema_violations" | "missing_provenance" | "stale" | "broken_links"> = {
  schema: "schema_violations",
  provenance: "missing_provenance",
  stale: "stale",
  broken_links: "broken_links",
};

export function registerLintTools(server: McpServer, ctx: ServerContext): void {
  server.tool(
    "find_schema_violations",
    "[DEPRECATED — removed in v2.0.0; use lint_vault({checks:['schema']})] Scan the vault for schema violations — missing required fields, unknown types, enum mismatches. Errors block apply_patch when validate=true.",
    { pathGlob: z.string().optional() },
    async ({ pathGlob }) => {
      const report = await lintVault(ctx.notesPath, { pathGlob });
      return ctx.textResponse(JSON.stringify(report.byRule.schema_violations, null, 2));
    }
  );

  server.tool(
    "find_missing_provenance",
    "[DEPRECATED — removed in v2.0.0; use lint_vault({checks:['provenance']})] Scan the vault for notes of types (note/decision/gotcha by default) that lack both sources and derived_from frontmatter. Warnings by default.",
    { pathGlob: z.string().optional() },
    async ({ pathGlob }) => {
      const report = await lintVault(ctx.notesPath, { pathGlob });
      return ctx.textResponse(JSON.stringify(report.byRule.missing_provenance, null, 2));
    }
  );

  server.tool(
    "find_stale",
    "[DEPRECATED — removed in v2.0.0; use lint_vault({checks:['stale']})] Scan the vault for notes whose last_verified date is older than the schema's stale.max_age_days (default 180).",
    { pathGlob: z.string().optional() },
    async ({ pathGlob }) => {
      const report = await lintVault(ctx.notesPath, { pathGlob });
      return ctx.textResponse(JSON.stringify(report.byRule.stale, null, 2));
    }
  );

  server.tool(
    "find_broken_links",
    "[DEPRECATED — removed in v2.0.0; use lint_vault({checks:['broken_links']})] Scan the vault for [[wikilinks]] that point to non-existent notes. Heavier than the other lints (cross-note check) but still metadata-only.",
    { pathGlob: z.string().optional() },
    async ({ pathGlob }) => {
      const report = await lintVault(ctx.notesPath, { pathGlob });
      return ctx.textResponse(JSON.stringify(report.byRule.broken_links, null, 2));
    }
  );

  server.tool(
    "lint_vault",
    "Run lint rules across the vault. Default returns the full LintReport with all findings grouped by rule. Pass `checks` to filter to specific rules (schema, provenance, stale, broken_links) — when filtered, byRule contains only the requested rules.",
    {
      pathGlob: z.string().optional(),
      checks: z
        .array(z.enum(["schema", "provenance", "stale", "broken_links"]))
        .optional()
        .describe("Filter to specific lint rules. Omit for full report."),
    },
    async ({ pathGlob, checks }) => {
      const report = await lintVault(ctx.notesPath, { pathGlob });
      if (!checks || checks.length === 0) {
        return ctx.textResponse(JSON.stringify(report, null, 2));
      }
      const requested = new Set<LintCheck>(checks.length > 0 ? checks : ALL_CHECKS);
      const filteredByRule: Record<string, unknown[]> = {};
      for (const check of requested) {
        const ruleKey = RULE_KEY_FOR_CHECK[check];
        filteredByRule[ruleKey] = report.byRule[ruleKey] ?? [];
      }
      const filteredFindings = report.findings.filter((f) => {
        const matchedCheck = (Object.entries(RULE_KEY_FOR_CHECK) as [LintCheck, string][])
          .find(([, ruleKey]) => ruleKey === f.rule);
        return matchedCheck ? requested.has(matchedCheck[0]) : false;
      });
      return ctx.textResponse(
        JSON.stringify(
          {
            ...report,
            findings: filteredFindings,
            byRule: filteredByRule,
          },
          null,
          2
        )
      );
    }
  );
}
