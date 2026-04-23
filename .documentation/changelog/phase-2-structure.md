---
title: Phase 2 — Structure + Capture
tier: reference
domains: [changelog]
audience: [developers]
tags: [phase-2, structure, capture, schema, apply-patch, changelog]
status: active
last_updated: '2026-04-23'
version: '0.2.3'
purpose: Schema, apply_patch, synthesize_note, lint, Stop capture, parsed-doc cache
load_priority: 4
---

# Phase 2 — Structure + Capture

> Turns the vault from "a folder of markdown" into a typed, provenanced, lint-checked artifact. Adds the Karpathy-inspired atomic write primitive (`apply_patch`) and the query-to-artifact loop (`synthesize_note`). Caps the Phase 1 latency carry-over.

## What Phase 2 adds

1. **Schema** — minimal 4-type starter (note / decision / gotcha / source) declared in `vault.schema.yml`. Default ships in `src/core/schema-default.ts` and is served to any vault that hasn't written its own.
2. **Provenance frontmatter** — five fields (`sources`, `derived_from`, `last_verified`, `status`, `confidence`) enforced by the schema. Addresses the "LLM-generated pages lack provenance" critique head-on.
3. **`apply_patch` MCP tool** — atomic multi-note writer with dry-run and rollback. Any failure in mid-patch reverts successful ops in reverse order.
4. **`synthesize_note` MCP tool** — query-answer + sources → filed note with frontmatter, auto-wikilinks, and a Related section. Builds a ChangeSet and routes through `apply_patch`.
5. **Lint suite** — `find_schema_violations`, `find_missing_provenance`, `find_stale`, and `lint_vault` (all). Also exposed as `semantic-sidekick lint` CLI for pre-commit.
6. **Pre-commit template** — `scripts/pre-commit-lint.sh` — drop-in hook for vault repos.
7. **Stop hook capture-on-close** — detects capture-worthy cues (`because`, `decided`, `the fix was`, `gotcha`, `from now on`) in user prompts, queues them in `.claude/.sidekick-capture-pending.json`, and emits a `decision: "block"` Stop-hook response with a synthesis prompt when the session ends.
8. **Parsed-doc cache** (Phase 1 carry-over) — `.semantic-sidekick-index/docs.cache.json` written after reindex, loaded by the search CLI. Drops hook latency from ~6s to ~0.7s.

## Under the hood

### Schema (`src/core/schema.ts`)

- `loadSchema(vaultPath)` — reads `vault.schema.yml` at the vault root; falls back to `DEFAULT_SCHEMA_YAML` shipped in the package.
- `installDefaultSchema(vaultPath, force?)` — bootstraps the default schema file. Skipped if present unless `force=true`. Exposed as CLI `semantic-sidekick install-schema --notes <vault>` and MCP `install_schema`.
- `validateNote(relPath, rawFileContent, schema, {todayIso?})` — returns an array of `LintFinding`s for a single note. Checks:
  - Type present & known.
  - All `required` fields present.
  - `status`, `confidence`, `severity` (if applicable) match their enums.
  - Provenance — if type is in `lint.missing_provenance.applies_to`, at least one of `sources` / `derived_from` must be populated.
  - Staleness — if `last_verified` exists and is older than `lint.stale.max_age_days`, flag.
- Never throws — lint reports, it doesn't block.

### apply_patch (`src/core/patch.ts`)

ChangeSet shape:
```ts
{
  creates?: [{ path, content, frontmatter? }],
  updates?: [{ path, content, mode: "overwrite"|"append"|"prepend"|"patch-by-heading", heading? }],
  deletes?: [{ path }],
  moves?:   [{ from, to }]
}
```

Flow:
1. **Pre-check** — every operation's precondition is verified against the filesystem (creates can't clobber, updates must exist, moves need valid src/dst). Any failure here returns `ok: false` before any op runs.
2. **Validation** — when `validate: true` (default), the proposed post-patch content is simulated in-memory and lint-checked. Any `schema_violations` of severity `error` blocks the patch. If `allowLintWarnings: false`, warnings also block.
3. **Execution** — ops run in order: creates → updates → moves → deletes. Each op is journaled as a `Snapshot` (previous content for updates/deletes, path for creates, prev location for moves).
4. **Rollback** — any execution failure iterates snapshots in reverse:
   - create → delete the written file
   - update → restore previous content
   - delete → recreate with previous content
   - move → rename back to original location
5. **Dry-run** — `dryRun: true` returns the lint report + pre-check results without writing. Ideal for "what would this change?" previews.

### synthesize_note (`src/core/synthesize.ts`)

Input — see the MCP tool signature. Produces a `{ changeset, path, title }` preview. The body:
- Starts with `# {title}` then the answer body.
- Auto-linking: for each `related_notes` entry, replaces the **first** whole-word occurrence of the note's bare name in the body with `[[wikilink]]`. Skips content inside fenced code blocks.
- Appends a `## Related` section listing all `related_notes` as wikilinks.

Frontmatter populated with provenance: `title`, `type` (default `note`), `status`, `last_verified` (today), `confidence`, plus optional `sources`, `derived_from`, `decision_maker`, `decided_on`, `severity`, and any `extra_frontmatter`.

The MCP tool always routes through `apply_patch`, so all patch guarantees (atomic, rollback, validation) apply.

### Lint (`src/core/lint.ts` + CLI + MCP tools)

- `lintVault(notesPath, { pathGlob?, todayIso? })` — scans `**/*.md` (configurable), returns `LintReport` with `findings`, `byRule`, and `counts`.
- Exposed four ways:
  - **CLI:** `semantic-sidekick lint --notes <vault> [--rule <name>] [--json] [--strict]` — exits non-zero on errors (or warnings with `--strict`).
  - **MCP tools:** `find_schema_violations`, `find_missing_provenance`, `find_stale` (each returns just that rule's findings), `lint_vault` (full report).
  - **apply_patch pre-flight** — every patch runs validation on its proposed state.
  - **Stop hook** — doesn't invoke lint; pairs with it by prompting for capture.

### Stop hook capture-on-close (`hooks/vault-context.js`)

- `SessionStart` → resets `.claude/.sidekick-capture-pending.json` to `{ items: [] }`.
- `UserPromptSubmit` → after the hybrid search, runs `detectCaptureCue(prompt)` against a fixed regex list. If any cue matches, appends `{ ts, cue, excerpt }` to the pending file.
- `Stop` → reads the pending file. If empty, emits a no-op. If non-empty AND not already mid-block (env `CLAUDE_STOP_HOOK_ACTIVE=1`), emits:
  ```json
  {
    "hookSpecificOutput": { "hookEventName": "Stop", "additionalContext": "<vault-capture-prompt ...>" },
    "decision": "block",
    "reason": "<same text>"
  }
  ```
  …which tells Claude Code to continue the session with the capture prompt injected. After emitting, the pending file is reset so the nudge doesn't loop.

## Invocation surfaces

| Action | Surface |
|---|---|
| Install schema in a vault | `semantic-sidekick install-schema --notes <vault>` or MCP `install_schema` |
| Run lint (CI / pre-commit) | `semantic-sidekick lint --notes <vault> [--rule <name>] [--strict]` |
| Drop-in pre-commit hook | `cp scripts/pre-commit-lint.sh .git/hooks/pre-commit` in your vault repo |
| Preview a multi-note change | MCP `apply_patch` with `dry_run: true` |
| Actually apply a multi-note change | MCP `apply_patch` |
| File an answer as a note | MCP `synthesize_note` |
| Check health programmatically | MCP `find_schema_violations` / `find_missing_provenance` / `find_stale` / `lint_vault` |

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Every create fails with schema violations | Default schema applies; user hasn't supplied provenance | Add `sources` or `derived_from` to the creates, or pass `validate: false` (not recommended — defeats the purpose) |
| apply_patch returns ok=false with empty errors | Lint blocked at warning level while `allowLintWarnings: false` | Fix the warnings, or set `allowLintWarnings: true` |
| Overwrite update drops frontmatter | `crud.update` with `mode: overwrite` rewrites the entire file | Use `patch-by-heading` or include frontmatter in the new content (matter-formatted) |
| Stop hook loops forever | Shouldn't — the `CLAUDE_STOP_HOOK_ACTIVE` check breaks the loop | If observed, delete `.claude/.sidekick-capture-pending.json` and report |
| Capture cue fires on every prompt | Cue regex is permissive; reaches into common words like "because" | Accept the over-firing for Phase 2 — the Stop hook only prompts once at session end, and the user can ignore it. Phase 4 adds routing that suppresses captures during outage mode |
| `vault-first` skill + hooks both inject for the same prompt | Intentional — hook provides the hits, skill tells Claude to use them | This is the design |
| CLI `lint --rule stale` exits non-zero even though shown output is empty | The whole-vault lint still counts errors from other rules; `--rule` only filters the printed output | Filter with `--json` and inspect the specific rule's array, or split into separate commands |

## Known gaps (Phase 2 scope boundary)

- No cross-note contradiction detection (Phase 5 gate — expensive, token-heavy, only worth it once other layers prove).
- No `ingest_source` (Phase 3). `synthesize_note` is the ingest equivalent for "I just finished researching X"; `ingest_source` is for "here's a PDF, produce a patch".
- Mode routing (research/vault-first/outage-silence) is still Phase 4. The Stop hook fires regardless of mode in Phase 2 — including during an outage, where it should be silent. Accepted scope boundary.
- Lint CLI exit code is coarse (1 on any error); no fine-grained error codes per rule.
- `apply_patch` doesn't currently auto-regenerate hierarchical indexes on create/delete — Phase 3's overflow policy handles that. For now, indexes stay as users wrote them.

## Tests

New unit tests (vitest):
- `test/unit/schema.test.ts` — schema load, install, validator (required fields, enums, provenance, stale).
- `test/unit/patch.test.ts` — create/update/delete atomicity, rollback, dry-run, validate=true blocks, validate=false allows.
- `test/unit/synthesize.test.ts` — frontmatter population, auto-wikilinks in body (and skipped inside code blocks), defaults.
- `test/unit/lint.test.ts` — grouped findings by rule, formatting.

Phase 1 regression: the same `test/phase1/run.js` passes 9/10 after the parsed-doc cache change. Hook latency drops to ~0.7s per call (cache hit).

Existing assertions bumped: `21 tools` → `28 tools` in e2e + integration tests to reflect the seven new MCP tools added by Phase 2.

## Commit boundary

Phase 2 ships as a single commit on `feat/sidekick-layers`: `feat(phase-2): structure + capture — schema, apply_patch, synthesize_note, lint, Stop hook, parsed-doc cache`.
