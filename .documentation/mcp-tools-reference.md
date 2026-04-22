# MCP tools reference

> 33 tools served by the `semantic-sidekick` MCP server over stdio. When the plugin is installed and `.mcp.json` is wired, they appear in Claude's tool list as `mcp__semantic-vault__<name>`.

Tools fall into 10 categories. Write tools are gated by the `--read-only` flag on the server; read tools are always available.

---

## Search (4)

### `search_semantic`
Vector similarity search over chunk embeddings.
**Args:** `{ query, limit?=10, modifiedAfter?, modifiedBefore?, status?, tier?, domain? }`
**Use when:** conceptual/semantic queries ("authentication flows").
**Skip when:** looking for exact strings — prefer `search_text`.

### `search_text`
BM25-ish keyword search over full note content.
**Args:** `{ pattern, regex?=false, caseSensitive?=false, pathGlob?, tagFilter?, limit?=20, modifiedAfter?, modifiedBefore?, status?, tier?, domain? }`
**Use when:** exact strings, regex patterns, or identifier searches.

### `search_graph`
Wikilink + `related_docs` traversal around a concept.
**Args:** `{ concept, maxDepth?=2, limit?=20 }`
**Use when:** "what's connected to this?" questions; end-to-end topic mapping.

### `search_hybrid` ⭐
Semantic + graph rerank. **The default for most queries.**
**Args:** `{ query, limit?=10, [date/status/tier/domain filters] }`
**Notes:** Phase 1 activation hooks call this.

## Read (3)

### `read_note`
**Args:** `{ path }`. Returns full markdown content.

### `read_multiple_notes`
**Args:** `{ paths: string[] }`. Batch fetch — use when reading 2+ notes that `search_hybrid` surfaced.

### `list_notes`
**Args:** `{ modifiedAfter?, modifiedBefore?, status?, tier?, domain? }`. Returns path + title + metadata + link counts.

## Write (4) — read-only disables these

### `create_note`
**Args:** `{ path, content, frontmatter? }`. Single-note creation with auto-stamps.

### `update_note`
**Args:** `{ path, content, mode: "overwrite"|"append"|"prepend"|"patch-by-heading", heading? }`. **Gotcha:** `overwrite` discards existing frontmatter.

### `delete_note`
**Args:** `{ path, confirm }`. `confirm: true` required to actually delete.

### `move_note`
**Args:** `{ from, to }`. Updates wikilinks across the vault.

## Patch / Synthesis (4) — Phase 2/3

### `apply_patch` ⭐
Atomic multi-note ChangeSet with rollback.
**Args:**
```ts
{
  creates?: [{ path, content, frontmatter? }],
  updates?: [{ path, content, mode, heading? }],
  deletes?: [{ path }],
  moves?:   [{ from, to }],
  dry_run?=false,
  validate?=true,
  allow_lint_warnings?=true
}
```
**Returns:** `{ ok, applied, rolledBack, lint, errors, indexes_regenerated }`.
**Side effect:** auto-regens `INDEX.md` in affected directories unless `regenIndexes: false`. Auto-logs `kind=error` on failure.

### `synthesize_note` ⭐
Turn an answer + sources into a filed note with provenance.
**Args:** `{ topic, answer, suggested_path, type?="note", sources?, derived_from?, related_notes?, status?="active", confidence?="medium", decision_maker?, decided_on?, severity?, dry_run?=false }`
**Side effect:** `kind=synthesis` entry on success, `kind=error` on failure.

### `ingest_source`
Source + extracted units → atomic ingest.
**Args:** `{ source: {source_uri, source_title, source_type?, source_path?, source_summary?, source_tags?}, units: [{ path, content, title?, type?, extra_derived_from?, extra_frontmatter?, confidence? }], dry_run?=false, auto_apply?=true }`
**Side effect:** `kind=ingest` entry on success.

### `install_schema`
Writes default `vault.schema.yml` to the vault root.
**Args:** `{ force?=false }`.

## Lint (5) — always available

### `find_schema_violations`
Missing required fields, unknown types, enum mismatches. **Severity: error (blocks apply_patch).**

### `find_missing_provenance`
Notes of type note/decision/gotcha with no `sources` and no `derived_from`. **Severity: warn.**

### `find_stale`
`last_verified` older than `schema.lint.stale.max_age_days` (default 180). **Severity: warn.**

### `find_broken_links`
`[[wikilinks]]` that don't match any note basename. Skips fenced + inline code. **Severity: warn.**

### `lint_vault`
Full report — all rules combined. Returns `{ findings, byRule, counts, schemaPath }`.

All lint tools accept `{ pathGlob? }` to scope to a subset.

## Metadata (4)

### `get_frontmatter` — `{ path }` — returns parsed YAML as JSON.
### `update_frontmatter` — `{ path, fields }` — set fields; `null` value deletes.
### `manage_tags` — `{ path, action: "add"|"remove"|"list", tags? }`.
### `rename_tag` — `{ oldTag, newTag }` — vault-wide rename across frontmatter + inline.

## Graph (4)

### `backlinks` — `{ path }` — notes that link TO this one.
### `forwardlinks` — `{ path }` — notes this one links to.
### `graph_path` — `{ from, to }` — shortest path via wikilinks.
### `graph_statistics` — `{}` — most-connected nodes, orphans, density.

## Log / Maintenance (3)

### `log_event`
Append to `log.md`.
**Args:** `{ kind, summary, payload? }`.
**Common kinds:** `ingest`, `synthesis`, `error`, `mode_change`, `decision`, `incident`.

### `log_query`
Read + filter entries.
**Args:** `{ kind?, after?, before?, limit? }`.

### `regenerate_index`
Force `INDEX.md` regen.
**Args:** either `{ directory }` (single dir) or `{ paths: string[] }` (dedupe to affected dirs).

## System (2)

### `get_stats`
Vault + index stats: note count, chunks, embedding dims, graph density, model, indexedAt, state (ready/stale/indexing/empty).

### `reindex`
Force full reindex. Blocks until ready.

---

## Idiom: read before you write

Every tool that writes (create/update/delete/move/apply_patch/synthesize/ingest) has a corresponding read or dry-run path. The canonical pattern:

1. **Read** — `search_hybrid` + `read_note` to verify what's there.
2. **Dry-run** — `apply_patch({..., dry_run: true})` or `synthesize_note({..., dry_run: true})` to preview. Returns the proposed lint findings without writing.
3. **Apply** — same call with `dry_run: false`.
4. **Verify** — `log_query({ kind: "error", limit: 5 })` to confirm nothing failed quietly.

## Idiom: cite what you read

Every tool that returns notes also returns `path`. Always include the paths in your response to the user. The `vault-first` skill enforces this as a hard contract.
