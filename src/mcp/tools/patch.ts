import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { applyPatch, type ChangeSet } from "../../core/patch.js";
import { buildSynthesizeChangeSet } from "../../core/synthesize.js";
import { buildIngestChangeSet } from "../../core/ingest.js";
import { installDefaultSchema } from "../../core/schema.js";
import { logEvent } from "../../core/log.js";

export function registerPatchTools(server: McpServer, ctx: ServerContext): void {
  if (ctx.options.readOnly) return;

  server.tool(
    "apply_patch",
    "Atomic multi-note patch with rollback — apply a ChangeSet of creates/updates/deletes/moves. If any op fails, earlier ops are reverted. In dry-run, nothing is written; result describes the proposed state + schema findings.",
    {
      creates: z
        .array(
          z.object({
            path: z.string(),
            content: z.string(),
            frontmatter: z.record(z.unknown()).optional(),
          })
        )
        .optional(),
      updates: z
        .array(
          z.object({
            path: z.string(),
            content: z.string(),
            mode: z.enum(["overwrite", "append", "prepend", "patch-by-heading"]),
            heading: z.string().optional(),
          })
        )
        .optional(),
      deletes: z.array(z.object({ path: z.string() })).optional(),
      moves: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
      dry_run: z.boolean().optional().default(false),
      validate: z.boolean().optional().default(true),
      allow_lint_warnings: z.boolean().optional().default(true),
    },
    async (args) => {
      const cs: ChangeSet = {
        creates: args.creates,
        updates: args.updates,
        deletes: args.deletes,
        moves: args.moves,
      };
      const result = await applyPatch(ctx.notesPath, cs, {
        dryRun: args.dry_run,
        validate: args.validate,
        allowLintWarnings: args.allow_lint_warnings,
      });
      if (!result.ok && !args.dry_run) {
        await logEvent(ctx.notesPath, {
          kind: "error",
          summary: `apply_patch failed: ${result.errors[0] ?? "unknown"}`,
          payload: { tool: "apply_patch", errors: result.errors, rolled_back: result.rolledBack.length },
        }).catch(() => { /* never let logging failure mask the real error */ });
      }
      return ctx.textResponse(JSON.stringify(result, null, 2));
    }
  );

  server.tool(
    "synthesize_note",
    "Turn a researched answer + sources into a new filed note with provenance frontmatter and auto-wikilinks. Builds a ChangeSet and applies it (dry-run supported). The primary path from query-answer to durable vault artifact.",
    {
      topic: z.string(),
      answer: z.string(),
      suggested_path: z.string().describe("Target path relative to vault root, e.g. 'decisions/auth-migration.md'"),
      type: z.string().optional().default("note").describe("One of the schema types: note, decision, gotcha, source"),
      sources: z.array(z.string()).optional().describe("External URLs or paths — populate provenance.sources"),
      derived_from: z.array(z.string()).optional().describe("Wikilinks to other vault notes — populate provenance.derived_from"),
      related_notes: z.array(z.string()).optional().describe("Note names or paths to auto-link in the body + list under Related"),
      status: z.string().optional().default("active"),
      confidence: z.string().optional().default("medium"),
      decision_maker: z.string().optional(),
      decided_on: z.string().optional(),
      severity: z.string().optional(),
      dry_run: z.boolean().optional().default(false),
    },
    async (args) => {
      const preview = buildSynthesizeChangeSet({
        topic: args.topic,
        answer: args.answer,
        suggested_path: args.suggested_path,
        type: args.type,
        sources: args.sources,
        derived_from: args.derived_from,
        related_notes: args.related_notes,
        status: args.status,
        confidence: args.confidence,
        decision_maker: args.decision_maker,
        decided_on: args.decided_on,
        severity: args.severity,
      });
      const result = await applyPatch(ctx.notesPath, preview.changeset, {
        dryRun: args.dry_run,
      });
      if (result.ok && !args.dry_run) {
        await logEvent(ctx.notesPath, {
          kind: "synthesis",
          summary: `synthesized ${preview.title}`,
          payload: { path: preview.path, type: args.type, sources: args.sources ?? [], derived_from: args.derived_from ?? [] },
        }).catch(() => {});
      } else if (!result.ok && !args.dry_run) {
        await logEvent(ctx.notesPath, {
          kind: "error",
          summary: `synthesize_note failed: ${result.errors[0] ?? "unknown"}`,
          payload: { tool: "synthesize_note", path: preview.path, errors: result.errors },
        }).catch(() => {});
      }
      return ctx.textResponse(
        JSON.stringify(
          {
            preview: { path: preview.path, title: preview.title },
            result,
          },
          null,
          2
        )
      );
    }
  );

  server.tool(
    "ingest_source",
    "Build + apply a ChangeSet that ingests a source (paper, doc, URL) and the notes extracted from it. Produces one sources/<slug>.md note (type=source) plus one create per extracted unit, each stamped with derived_from pointing at the source. Routes through apply_patch — atomic, validated, rollback-capable, dry-run supported.",
    {
      source: z.object({
        source_uri: z.string(),
        source_title: z.string(),
        source_type: z.string().optional(),
        source_path: z.string().optional(),
        source_summary: z.string().optional(),
        source_tags: z.array(z.string()).optional(),
      }),
      units: z.array(
        z.object({
          path: z.string(),
          title: z.string().optional(),
          content: z.string(),
          type: z.string().optional(),
          extra_derived_from: z.array(z.string()).optional(),
          extra_frontmatter: z.record(z.unknown()).optional(),
          confidence: z.string().optional(),
        })
      ),
      dry_run: z.boolean().optional().default(false),
      auto_apply: z.boolean().optional().default(true).describe("If false, force dry-run regardless of dry_run flag — use for review-first workflows"),
    },
    async (args) => {
      const preview = buildIngestChangeSet({
        source: args.source,
        units: args.units,
      });
      const dry = args.dry_run || args.auto_apply === false;
      const result = await applyPatch(ctx.notesPath, preview.changeset, { dryRun: dry });
      if (result.ok && !dry) {
        await logEvent(ctx.notesPath, {
          kind: "ingest",
          summary: `ingested ${preview.unitPaths.length} note(s) from ${args.source.source_title}`,
          payload: {
            source_path: preview.sourcePath,
            unit_paths: preview.unitPaths,
            source_uri: args.source.source_uri,
          },
        }).catch(() => {});
      } else if (!result.ok && !dry) {
        await logEvent(ctx.notesPath, {
          kind: "error",
          summary: `ingest_source failed: ${result.errors[0] ?? "unknown"}`,
          payload: {
            tool: "ingest_source",
            source_uri: args.source.source_uri,
            source_title: args.source.source_title,
            errors: result.errors,
          },
        }).catch(() => {});
      }
      return ctx.textResponse(
        JSON.stringify(
          {
            preview: {
              source_path: preview.sourcePath,
              unit_paths: preview.unitPaths,
            },
            result,
            dry_run: dry,
          },
          null,
          2
        )
      );
    }
  );

  server.tool(
    "install_schema",
    "Bootstrap vault.schema.yml in the vault root with the default schema (note/decision/gotcha/source types + provenance fields). Skipped if present unless force=true.",
    { force: z.boolean().optional().default(false) },
    async ({ force }) => {
      const r = await installDefaultSchema(ctx.notesPath, force);
      return ctx.textResponse(
        r.written ? `Installed default schema: ${r.path}` : `Schema already exists: ${r.path} (pass force=true to overwrite)`
      );
    }
  );
}
