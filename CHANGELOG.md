# Changelog

All notable changes to semantic-sidekick will be documented here.

## [0.2.0] - 2026-04-22

### Phase 1 — Activation layer
- `vault-first` skill at `skills/vault-first/SKILL.md` with cite-or-deflect contract.
- SessionStart + UserPromptSubmit hooks backed by `hooks/vault-context.js`. Seeded search on session start; fingerprinted per-prompt injection with suppression of recent duplicates.
- CLAUDE.md vault-first rule block enforcing cite-or-deflect at system-prompt level.
- New `semantic-sidekick search` CLI subcommand (hybrid / text-only / JSON output) — hooks shell out instead of running an MCP client.
- 10-prompt conversational test suite at `test/phase1/run.js`. Pass criterion ≥7/10; current ≥9/10.

### Phase 2 — Structure + capture
- Minimal default schema (`src/core/schema-default.ts`) with four types (note, decision, gotcha, source) + provenance fields + lint policy. Bootstrappable via `install_schema` MCP tool or `semantic-sidekick install-schema` CLI.
- `apply_patch` MCP tool — atomic multi-note ChangeSet with pre-check, schema validation, reverse-order rollback, dry-run.
- `synthesize_note` MCP tool — answer + sources → filed note with auto-wikilinks, routed through apply_patch.
- Lint suite: `find_schema_violations`, `find_missing_provenance`, `find_stale`, `lint_vault` (full report). MCP tools + `semantic-sidekick lint` CLI + `scripts/pre-commit-lint.sh` template.
- Stop hook with capture-cue detection (`\bbecause\b`, `\bthe fix was\b`, etc.) → `decision: "block"` prompt at session close.
- Parsed-doc cache (`.semantic-sidekick-index/docs.cache.json`) — hook latency dropped ~6s → ~0.7s (9x).

### Phase 3 — Ingest + maintenance
- `ingest_source` MCP tool — source + extracted units → atomic ChangeSet with derived_from wiring. Auto-logs `kind=ingest` on success.
- Structured `log.md` at vault root: human bullet line + machine-readable `yaml event` blocks per entry. `log_event` + `log_query` MCP tools.
- Hierarchical INDEX.md auto-regen on apply_patch (creates/deletes/moves). Overflow signal at 100 entries.
- `find_broken_links` lint — cross-note wikilink validation, skips code blocks.
- `regenerate_index` MCP tool for manual regen.

### Phase 4 — Routing + transitions
- `research-mode` skill — aggressive vault behavior for sustained investigation; every source filed; synthesis mandatory on exit.
- `outage-silence` skill — incident mode; suppresses auto-vault; forces postmortem on exit.
- `/mode` slash command — explicit mode setter (ground truth). Writes `.claude/.sidekick-mode`.
- `/vault <query>` slash command — explicit vault search, works in any mode including outage-silence.
- CLAUDE.md routing rule — visible `[research]` / `[outage]` prefix, transition-capture contract.
- Mode-aware hooks: UserPromptSubmit suppresses in outage-silence; Stop branches per mode (research-synthesis / outage-postmortem / vault-first generic).
- SessionStart resets mode to `vault-first` (relevance-decay at session boundary).

### Phase 4.5 — Auto-logging + state-delta preload
- `apply_patch` / `synthesize_note` / `ingest_source` auto-log `kind=error` on failure, `kind=synthesis` / `kind=ingest` on success.
- Hook crashes auto-log `kind=error` with stack excerpt (no longer stderr-only and lost).
- SessionStart injects `<vault-state-since date="…">` block — 14-day log.md summary + 6 most recent entries. Future-Claude boots with "what past-me did this week."
- Mode drift (session ended in non-default mode) auto-logs `kind=mode_change` at next SessionStart.
- New CLI subcommands `log-event` + `log-query` so hooks and CI scripts write/read log.md without importing core.

### Plugin packaging
- `.claude-plugin/plugin.json` + `marketplace.json` updated for Phase 1–4.5 scope (category: knowledge).
- `hooks/hooks.json` declares SessionStart + UserPromptSubmit + Stop hooks against `${CLAUDE_PLUGIN_ROOT}/hooks/vault-context.js`.
- `package.json` `files[]` now ships `skills/{vault-first,research-mode,outage-silence}` and `scripts/pre-commit-lint.sh`.

### Fixes
- Stop hook output shape corrected — uses top-level `decision` / `reason` instead of `hookSpecificOutput` (which Claude Code rejects for Stop).
- CLI `lint --json` stdout flush fixed — large JSON payloads were truncating mid-array when `process.exit` ran before flush.
- `src/core/index.ts` exports all Phase 2/3 public APIs (applyPatch, buildSynthesizeChangeSet, buildIngestChangeSet, lintVault, logEvent/logQuery, schema helpers).

### Tests
- 186/186 tests passing (from 139 at 0.1.0).
- 47 new tests across schema, patch, synthesize, lint, ingest, log, index-regen, mode-hook, state-delta, auto-logging.

### Docs
- Full operator's manual in `.documentation/`: INDEX + 14 topic docs + 4 per-phase change logs. See `.documentation/INDEX.md`.

## [0.1.0] - 2026-04-21

### Forked from semantic-pages 0.10.0
Initial fork. Package renamed, bin renamed (`semantic-sidekick`), MCP server identifier changed, index directory changed (`.semantic-sidekick-index`). All retrieval functionality inherited unchanged from semantic-pages.

### Planned (per `.planning/semantic-sidekick/task_plan.md`)
- **Phase 1**: Activation layer — SessionStart + UserPromptSubmit hooks, `vault-first` skill with conversational cue detection, CLAUDE.md rule. Hypothesis test: does the vault get used without explicit invocation?
- **Phase 2**: Structure — `vault.schema.yml`, provenance frontmatter, `apply_patch` MCP tool, `synthesize_note`, cheap lint.
- **Phase 3**: Ingest + maintenance — `ingest_source`, structured log, hierarchical indexes.
- **Phase 4**: Routing — mode skills (research / default / outage), signal weighting, transition capture.
- **Phase 5**: Advanced — contradiction detection, situation snapshots, calibration loop.

### Heritage
Upstream substrate tracked at `git@github-glitch:TheGlitchKing/semantic-pages.git` (remote `upstream`, push disabled). Substrate fixes are cherry-picked from upstream; semantic-sidekick does not push back.
