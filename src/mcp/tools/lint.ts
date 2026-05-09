import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { lintVault } from "../../core/lint.js";

export function registerLintTools(server: McpServer, ctx: ServerContext): void {
  server.tool(
    "find_schema_violations",
    "Scan the vault for schema violations — missing required fields, unknown types, enum mismatches. Errors block apply_patch when validate=true.",
    { pathGlob: z.string().optional() },
    async ({ pathGlob }) => {
      const report = await lintVault(ctx.notesPath, { pathGlob });
      return ctx.textResponse(JSON.stringify(report.byRule.schema_violations, null, 2));
    }
  );

  server.tool(
    "find_missing_provenance",
    "Scan the vault for notes of types (note/decision/gotcha by default) that lack both sources and derived_from frontmatter. Warnings by default.",
    { pathGlob: z.string().optional() },
    async ({ pathGlob }) => {
      const report = await lintVault(ctx.notesPath, { pathGlob });
      return ctx.textResponse(JSON.stringify(report.byRule.missing_provenance, null, 2));
    }
  );

  server.tool(
    "find_stale",
    "Scan the vault for notes whose last_verified date is older than the schema's stale.max_age_days (default 180).",
    { pathGlob: z.string().optional() },
    async ({ pathGlob }) => {
      const report = await lintVault(ctx.notesPath, { pathGlob });
      return ctx.textResponse(JSON.stringify(report.byRule.stale, null, 2));
    }
  );

  server.tool(
    "find_broken_links",
    "Scan the vault for [[wikilinks]] that point to non-existent notes. Heavier than the other lints (cross-note check) but still metadata-only.",
    { pathGlob: z.string().optional() },
    async ({ pathGlob }) => {
      const report = await lintVault(ctx.notesPath, { pathGlob });
      return ctx.textResponse(JSON.stringify(report.byRule.broken_links, null, 2));
    }
  );

  server.tool(
    "lint_vault",
    "Run all lint rules at once — returns full LintReport with findings grouped by rule.",
    { pathGlob: z.string().optional() },
    async ({ pathGlob }) => {
      const report = await lintVault(ctx.notesPath, { pathGlob });
      return ctx.textResponse(JSON.stringify(report, null, 2));
    }
  );
}
