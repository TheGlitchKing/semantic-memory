import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const BEGIN_MARKER = "<!-- semantic-memory:begin contract -->";
const END_MARKER = "<!-- semantic-memory:end contract -->";
const LOCAL_NOTES_HEADING = "## Local Notes";

export interface ToolSummary {
  name: string;
  description: string;
  deprecated?: boolean;
}

export interface ModeSummary {
  name: string;
  description: string;
  isDefault?: boolean;
}

export interface RegenerateContractOptions {
  projectRoot: string;
  pluginVersion: string;
  tools: ToolSummary[];
  modes?: ModeSummary[];
  /** When true, overwrite hand-edited managed blocks. Default false → fails loudly on detected hand-edits. */
  force?: boolean;
  /** Override "now" — used by tests for deterministic timestamps. */
  nowIso?: string;
}

export interface RegenerateContractResult {
  path: string;
  written: boolean;
  reason?: string;
  hand_edit_detected?: boolean;
  preserved_local_notes_chars?: number;
}

/**
 * Generate or refresh AGENTS.md at the project root.
 *
 * Behavior:
 *  - If AGENTS.md is absent, write the full contract + an empty Local Notes section.
 *  - If AGENTS.md exists and contains the managed block markers:
 *      * Regenerate the content INSIDE the markers from the current tool/mode inventory.
 *      * Preserve everything OUTSIDE the markers (Local Notes tail, custom sections, frontmatter the
 *        user added).
 *      * If `force` is false and the inside-block content differs from a freshly-generated block AND
 *        the difference is not just a regenerable timestamp/version, fail with hand_edit_detected.
 *  - If AGENTS.md exists without managed-block markers, refuse and report — the user has a custom
 *    AGENTS.md and we should not silently take it over.
 */
export async function regenerateAgentsContract(opts: RegenerateContractOptions): Promise<RegenerateContractResult> {
  const path = join(opts.projectRoot, "AGENTS.md");
  const generatedBlock = buildManagedBlock(opts);
  const generatedFull = buildFullDocument(opts, generatedBlock);

  if (!existsSync(path)) {
    await writeFile(path, generatedFull, "utf-8");
    return { path, written: true };
  }

  const existing = await readFile(path, "utf-8");
  const beginIdx = existing.indexOf(BEGIN_MARKER);
  const endIdx = existing.indexOf(END_MARKER);

  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
    return {
      path,
      written: false,
      reason:
        "AGENTS.md exists but does not contain the semantic-memory managed-block markers. Move your existing content into a Local Notes section outside the managed block, or delete AGENTS.md and re-run to bootstrap from scratch.",
    };
  }

  const existingBlock = existing.slice(beginIdx, endIdx + END_MARKER.length);
  const localTail = extractLocalTail(existing, endIdx + END_MARKER.length);

  if (!opts.force && hasHandEdits(existingBlock, generatedBlock)) {
    return {
      path,
      written: false,
      hand_edit_detected: true,
      reason:
        "Managed-block content has been hand-edited. Move your changes to the Local Notes section (outside the managed block) and re-run, or pass force=true to overwrite.",
    };
  }

  // Refresh the entire pre-block prefix (frontmatter + title) so timestamp/version
  // stamps reflect the current regeneration. Keep the managed block fresh and the
  // Local Notes tail untouched.
  const newPrefix = buildPrefix(opts);
  const newDoc = newPrefix + generatedBlock + localTail;
  await writeFile(path, newDoc, "utf-8");
  return {
    path,
    written: true,
    preserved_local_notes_chars: localTail.length,
  };
}

function buildPrefix(opts: RegenerateContractOptions): string {
  return [
    "---",
    `generated_by: semantic-memory`,
    `version: ${opts.pluginVersion}`,
    `last_generated: ${opts.nowIso ?? new Date().toISOString()}`,
    "---",
    "",
    "# Project Agent Contract",
    "",
  ].join("\n");
}

function buildFullDocument(opts: RegenerateContractOptions, managedBlock: string): string {
  const localNotes = `\n\n${LOCAL_NOTES_HEADING}\n\n_User-authored content lives here. Preserved across \`regenerate_contract\` runs._\n`;
  return buildPrefix(opts) + managedBlock + localNotes;
}

function buildManagedBlock(opts: RegenerateContractOptions): string {
  const lines: string[] = [BEGIN_MARKER, ""];

  lines.push("## Active Modes", "");
  const modes = opts.modes ?? defaultModes();
  for (const m of modes) {
    const tag = m.isDefault ? " (default)" : "";
    lines.push(`- **${m.name}**${tag} — ${m.description}`);
  }
  lines.push("");

  lines.push("## Required Workflow", "");
  lines.push("1. For multi-step work that needs verification, open a session: `session_start({task})`.");
  lines.push("2. Use mode-aware retrieval: `search_hybrid`, `read_note`, `list_notes`, `backlinks`/`forwardlinks`.");
  lines.push("3. Make durable updates via `apply_patch` or `synthesize_note` — never bypass the patch layer for multi-note edits.");
  lines.push("4. Run verification commands inside a session: `session_run({cmd})`.");
  lines.push("5. Close with `session_finish({summary})` — refused without verification unless explicitly waived.");
  lines.push("6. Lint regularly: `lint_vault({checks: ['schema','provenance','stale','broken_links']})`.");
  lines.push("");

  lines.push("## Tool Surface", "");
  const live = opts.tools.filter((t) => !t.deprecated);
  const deprecated = opts.tools.filter((t) => t.deprecated);
  for (const t of live) {
    lines.push(`- \`${t.name}\` — ${stripDeprecationPrefix(t.description)}`);
  }
  if (deprecated.length > 0) {
    lines.push("");
    lines.push("### Deprecated (removed in v2.0.0)", "");
    for (const t of deprecated) {
      lines.push(`- \`${t.name}\` — ${stripDeprecationPrefix(t.description)}`);
    }
  }
  lines.push("");

  lines.push("## Memory Policy", "");
  lines.push("- Markdown is canonical. The vault under `.claude/.vault/` (or wherever `--notes` points) is the source of truth.");
  lines.push("- Indexes (vector / graph / FTS) are derived state — rebuildable via `reindex` without losing knowledge.");
  lines.push("- Provenance frontmatter is required for `note`/`decision`/`gotcha` types — `sources` (external) or `derived_from` (internal).");
  lines.push("- Mode router lives at `.claude/.semantic-memory/mode` (legacy `.claude/.sidekick-mode` still readable through v1.x); explicit `/mode` is ground truth.");
  lines.push("");

  lines.push(END_MARKER);
  return lines.join("\n");
}

function defaultModes(): ModeSummary[] {
  return [
    { name: "vault-first", description: "Project-scoped prose questions trigger vault consultation with cite-or-deflect.", isDefault: true },
    { name: "research", description: "Every source introduced is filed via `ingest_source`; mandatory `synthesize_note` on exit." },
    { name: "outage-silence", description: "No proactive vault search. Terse responses. Postmortem `synthesize_note` on exit." },
  ];
}

function stripDeprecationPrefix(description: string): string {
  return description.replace(/^\[DEPRECATED[^\]]*\]\s*/, "(deprecated) ");
}

function extractLocalTail(existing: string, afterEndIdx: number): string {
  const tail = existing.slice(afterEndIdx);
  // Trim a single leading blank-line-then-newline if present so we don't double-space across regenerations.
  return tail;
}

/**
 * Detect hand-edits by comparing semantic content of the managed block, ignoring lines that are
 * regenerable (currently no per-block timestamps live inside the block — they're in frontmatter).
 * Returns true if the existing block diverges from what we'd generate now.
 */
function hasHandEdits(existingBlock: string, generatedBlock: string): boolean {
  return existingBlock.trim() !== generatedBlock.trim();
}

/**
 * Inspect AGENTS.md without modifying it. Returns whether the file exists, whether it has managed
 * markers, and how many characters of Local Notes tail are preserved.
 */
export async function inspectAgentsContract(projectRoot: string): Promise<{
  path: string;
  exists: boolean;
  has_managed_block: boolean;
  local_notes_chars: number;
}> {
  const path = join(projectRoot, "AGENTS.md");
  if (!existsSync(path)) {
    return { path, exists: false, has_managed_block: false, local_notes_chars: 0 };
  }
  const raw = await readFile(path, "utf-8");
  const beginIdx = raw.indexOf(BEGIN_MARKER);
  const endIdx = raw.indexOf(END_MARKER);
  if (beginIdx === -1 || endIdx === -1) {
    return { path, exists: true, has_managed_block: false, local_notes_chars: 0 };
  }
  const localTail = raw.slice(endIdx + END_MARKER.length).trim();
  return { path, exists: true, has_managed_block: true, local_notes_chars: localTail.length };
}
