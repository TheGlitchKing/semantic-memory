---
generated_by: semantic-memory
version: 1.1.0
last_generated: 2026-05-09T03:18:14.199Z
---

# Project Agent Contract
<!-- semantic-memory:begin contract -->

## Active Modes

- **vault-first** (default) — Project-scoped prose questions trigger vault consultation with cite-or-deflect.
- **research** — Every source introduced is filed via `ingest_source`; mandatory `synthesize_note` on exit.
- **outage-silence** — No proactive vault search. Terse responses. Postmortem `synthesize_note` on exit.

## Required Workflow

1. For multi-step work that needs verification, open a session: `session_start({task})`.
2. Use mode-aware retrieval: `search_hybrid`, `read_note`, `list_notes`, `backlinks`/`forwardlinks`.
3. Make durable updates via `apply_patch` or `synthesize_note` — never bypass the patch layer for multi-note edits.
4. Run verification commands inside a session: `session_run({cmd})`.
5. Close with `session_finish({summary})` — refused without verification unless explicitly waived.
6. Lint regularly: `lint_vault({checks: ['schema','provenance','stale','broken_links']})`.

## Tool Surface

- `search_semantic` — Vector similarity search.
- `search_hybrid` — Combined semantic + graph search.
- `read_note` — Read a note.
- `list_notes` — List indexed notes with metadata.
- `create_note` — Create a new markdown note.
- `update_note` — Edit note content.
- `apply_patch` — Atomic multi-note patch with rollback.
- `synthesize_note` — Build a provenance-stamped note from an answer.
- `ingest_source` — Ingest a source and extracted notes.
- `lint_vault` — Run lint rules; pass checks to filter.
- `manage_tags` — Add, remove, list, or rename tags.
- `regenerate_contract` — Generate or refresh AGENTS.md.

### Deprecated (removed in v2.0.0)

- `find_stale` — Find stale notes.
- `rename_tag` — Rename a tag vault-wide.

## Memory Policy

- Markdown is canonical. The vault under `.claude/.vault/` (or wherever `--notes` points) is the source of truth.
- Indexes (vector / graph / FTS) are derived state — rebuildable via `reindex` without losing knowledge.
- Provenance frontmatter is required for `note`/`decision`/`gotcha` types — `sources` (external) or `derived_from` (internal).
- Mode router lives at `.claude/.sidekick-mode`; explicit `/mode` is ground truth.

<!-- semantic-memory:end contract -->

## Local Notes

_User-authored content lives here. Preserved across `regenerate_contract` runs._
