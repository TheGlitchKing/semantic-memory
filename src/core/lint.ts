import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { glob } from "glob";
import { loadSchema, validateNote, type LintFinding, type VaultSchema } from "./schema.js";

export interface LintReport {
  schemaPath: string;
  findings: LintFinding[];
  byRule: {
    schema_violations: LintFinding[];
    missing_provenance: LintFinding[];
    stale: LintFinding[];
  };
  counts: {
    errors: number;
    warnings: number;
    filesLinted: number;
  };
}

export async function lintVault(
  notesPath: string,
  opts: { pathGlob?: string; schemaOverride?: VaultSchema; todayIso?: string } = {}
): Promise<LintReport> {
  const schema = opts.schemaOverride ?? (await loadSchema(notesPath));
  const files = await glob(opts.pathGlob ?? "**/*.md", {
    cwd: notesPath,
    ignore: ["node_modules/**", ".semantic-sidekick-index/**", "vault.schema.yml"],
  });

  const findings: LintFinding[] = [];
  for (const rel of files) {
    try {
      const raw = await readFile(join(notesPath, rel), "utf-8");
      findings.push(...validateNote(rel, raw, schema, { todayIso: opts.todayIso }));
    } catch {
      // swallow — unreadable file isn't a lint finding (it's an OS problem)
    }
  }

  const byRule = {
    schema_violations: findings.filter((f) => f.rule === "schema_violations"),
    missing_provenance: findings.filter((f) => f.rule === "missing_provenance"),
    stale: findings.filter((f) => f.rule === "stale"),
  };
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warn").length;

  return {
    schemaPath: join(notesPath, "vault.schema.yml"),
    findings,
    byRule,
    counts: { errors, warnings, filesLinted: files.length },
  };
}

export function formatLintReport(report: LintReport, opts: { rule?: keyof LintReport["byRule"] } = {}): string {
  const target = opts.rule ? report.byRule[opts.rule] : report.findings;
  if (target.length === 0) {
    return `clean: 0 findings across ${report.counts.filesLinted} files`;
  }
  const lines = [
    `${target.length} finding${target.length === 1 ? "" : "s"} (errors=${report.counts.errors}, warnings=${report.counts.warnings}, files=${report.counts.filesLinted})`,
    "",
  ];
  for (const f of target) {
    lines.push(`[${f.severity}] ${f.rule}: ${f.path} — ${f.message}`);
  }
  return lines.join("\n");
}
