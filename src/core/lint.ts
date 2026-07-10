import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { glob } from "glob";
import matter from "gray-matter";
import { loadSchema, validateNote, type LintFinding, type VaultSchema } from "./schema.js";
import { deriveProjectRoot } from "./session.js";

export interface LintReport {
  schemaPath: string;
  findings: LintFinding[];
  byRule: {
    schema_violations: LintFinding[];
    missing_provenance: LintFinding[];
    stale: LintFinding[];
    broken_links: LintFinding[];
    code_symbols: LintFinding[];
  };
  counts: {
    errors: number;
    warnings: number;
    filesLinted: number;
  };
}

export async function lintVault(
  notesPath: string,
  opts: {
    pathGlob?: string;
    schemaOverride?: VaultSchema;
    todayIso?: string;
    /**
     * When true, run the code-symbol drift check: flag inline-code file-path
     * references in notes that no longer exist under the project root. Opt-in
     * (off by default) so the standard report and the healthcheck slow tier stay
     * quiet and byte-stable. Fails open when the project root is not a code repo.
     */
    checkCodeSymbols?: boolean;
    /** Override the project root for code-symbol resolution (default: derived from notesPath). */
    projectRoot?: string;
  } = {}
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

  // Code-symbol drift is opt-in and only meaningful against a real code repo.
  const codeRoot = opts.checkCodeSymbols
    ? resolveCodeRoot(opts.projectRoot ?? deriveProjectRoot(notesPath))
    : null;

  for (const [rel, raw] of rawByPath) {
    findings.push(...validateNote(rel, raw, schema, { todayIso: opts.todayIso }));
    findings.push(...findBrokenLinks(rel, raw, knownNames));
    if (codeRoot) findings.push(...findCodeSymbolDrift(rel, raw, codeRoot));
  }

  const byRule = {
    schema_violations: findings.filter((f) => f.rule === "schema_violations"),
    missing_provenance: findings.filter((f) => f.rule === "missing_provenance"),
    stale: findings.filter((f) => f.rule === "stale"),
    broken_links: findings.filter((f) => f.rule === "broken_links"),
    code_symbols: findings.filter((f) => f.rule === "code_symbols"),
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

/** File extensions we treat as "this looks like a source/doc file reference". */
const CODE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rb", "go", "rs", "java", "kt",
  "c", "h", "cpp", "hpp", "cs", "php", "swift", "scala", "sh", "bash", "sql",
  "json", "yaml", "yml", "toml", "css", "scss", "html", "vue", "svelte", "md",
]);

/**
 * Decide whether `root` is a real code repository worth checking paths against.
 * Fails open (returns null) for non-code roots so the check is a silent no-op
 * outside a project — e.g. a standalone vault, or when babel-fish isn't present.
 */
function resolveCodeRoot(root: string): string | null {
  if (!root || !existsSync(root)) return null;
  const markers = ["package.json", ".git", "src", "lib", "pyproject.toml", "go.mod", "Cargo.toml"];
  return markers.some((m) => existsSync(join(root, m))) ? root : null;
}

/**
 * Code-symbol drift: scan a note's inline-code spans for repo-relative file-path
 * references and flag ones whose first path segment IS a real directory in the repo
 * but whose full path no longer exists — i.e. a stale reference to a moved/deleted
 * file. Anchoring on an existing first segment keeps false positives low: paths
 * belonging to other repos (whose top-level dir isn't present here) are skipped.
 *
 * Scope note: this validates *path* references. Fine-grained symbol-name checking
 * (function/class identifiers) needs a real symbol index and is planned for the
 * v1.4 lexicon arc, which will extend this same `code_symbols` rule.
 */
function findCodeSymbolDrift(relPath: string, rawFileContent: string, codeRoot: string): LintFinding[] {
  const { content } = matter(rawFileContent);
  // Inline-code spans only (single backtick). Fenced blocks are illustrative and
  // over-match. Strip fenced blocks first so their backticks don't confuse the span regex.
  const withoutFences = content.replace(/```[\s\S]*?```/g, "");
  const findings: LintFinding[] = [];
  const seen = new Set<string>();
  const re = /`([^`\n]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(withoutFences)) !== null) {
    let token = m[1].trim();
    if (!looksLikeRepoPath(token)) continue;
    token = token.replace(/^\.\//, "");
    if (seen.has(token)) continue;
    seen.add(token);
    const firstSeg = token.split("/")[0];
    // Only judge paths anchored in a directory that actually exists in this repo.
    if (!existsSync(join(codeRoot, firstSeg))) continue;
    if (!existsSync(join(codeRoot, token))) {
      findings.push({
        path: relPath,
        rule: "code_symbols",
        severity: "warn",
        message: `inline code path \`${token}\` does not exist under the project root (stale reference?)`,
      });
    }
  }
  return findings;
}

function looksLikeRepoPath(token: string): boolean {
  if (!token.includes("/")) return false;
  if (/\s/.test(token)) return false; // commands, prose
  if (token.includes("://")) return false; // URLs
  if (/[*?\[\]{}()<>|]/.test(token)) return false; // globs / shell / placeholders
  if (token.startsWith("/") || token.startsWith("~")) return false; // absolute / home
  const normalized = token.replace(/^\.\//, "");
  if (normalized.startsWith("..")) return false; // escapes the repo
  const last = normalized.split("/").pop() ?? "";
  const dot = last.lastIndexOf(".");
  if (dot <= 0) return false; // no extension → likely a dir or a symbol like a/b
  const ext = last.slice(dot + 1).toLowerCase();
  return CODE_EXTENSIONS.has(ext);
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
