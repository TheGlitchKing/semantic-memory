import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { glob } from "glob";
import matter from "gray-matter";
import { loadSchema, validateNote, type LintFinding, type VaultSchema } from "./schema.js";

export interface LintReport {
  schemaPath: string;
  findings: LintFinding[];
  byRule: {
    schema_violations: LintFinding[];
    missing_provenance: LintFinding[];
    stale: LintFinding[];
    broken_links: LintFinding[];
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
  // Build known-note set first, to make broken-link detection O(1) per link.
  const knownNames = new Set<string>();
  const rawByPath = new Map<string, string>();
  for (const rel of files) {
    try {
      const raw = await readFile(join(notesPath, rel), "utf-8");
      rawByPath.set(rel, raw);
      // Wikilink names match on basename-without-ext (obsidian-style)
      knownNames.add(basename(rel).replace(/\.md$/, ""));
    } catch {
      /* skip */
    }
  }

  for (const [rel, raw] of rawByPath) {
    findings.push(...validateNote(rel, raw, schema, { todayIso: opts.todayIso }));
    findings.push(...findBrokenLinks(rel, raw, knownNames));
  }

  const byRule = {
    schema_violations: findings.filter((f) => f.rule === "schema_violations"),
    missing_provenance: findings.filter((f) => f.rule === "missing_provenance"),
    stale: findings.filter((f) => f.rule === "stale"),
    broken_links: findings.filter((f) => f.rule === "broken_links"),
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

function findBrokenLinks(
  relPath: string,
  rawFileContent: string,
  knownNames: Set<string>
): LintFinding[] {
  const { content } = matter(rawFileContent);
  const findings: LintFinding[] = [];
  // Match [[target]] and [[target|alias]] — skip fenced code and inline code.
  const stripped = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "");
  const re = /\[\[([^\]\|]+)(?:\|[^\]]+)?\]\]/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    const target = m[1].trim().split("#")[0].split("/").pop()!.replace(/\.md$/, "");
    if (seen.has(target)) continue;
    seen.add(target);
    if (!knownNames.has(target)) {
      findings.push({
        path: relPath,
        rule: "broken_links",
        severity: "warn",
        message: `wikilink [[${target}]] has no matching note`,
      });
    }
  }
  return findings;
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
