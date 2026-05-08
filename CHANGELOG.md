# Changelog

All notable changes to semantic-memory (formerly semantic-sidekick) will be documented here.

## [1.0.1] - 2026-05-08 — Republish (no functional changes)

### Republish only

`@theglitchking/semantic-memory@1.0.0` was published briefly then unpublished while the publish strategy was being reviewed. npm tombstones unpublished version slots, so the same version cannot be republished. This patch bumps to **1.0.1** with no functional changes — content is byte-identical to what 1.0.0 would have shipped.

If you somehow have `@theglitchking/semantic-memory@1.0.0` installed (cached from the brief publish window), bump to `1.0.1` directly. No migration steps required between 1.0.0 and 1.0.1.

## [1.0.0] - 2026-05-07 — Rebrand to `semantic-memory`

### Renamed (publication identity)

- **npm package**: `@theglitchking/semantic-sidekick` → `@theglitchking/semantic-memory`
- **Claude Code plugin name**: `semantic-sidekick` → `semantic-memory`
- **Marketplace name**: `semantic-sidekick-marketplace` → `semantic-memory-marketplace`
- **MCP server name**: `semantic-sidekick` → `semantic-memory` (announced in initialize handshake)
- **CLI binary**: `bin/semantic-memory` is the new primary; `bin/semantic-sidekick` is preserved as an alias during the transition

### Why

`semantic-sidekick` framed the plugin as a "vault helper" because that's what it was at v0.x. v1.0.0 introduces a multi-corpus architecture: vault, code, plans, docs, research, project-map. The plugin is no longer a sidekick — it's the unified memory layer for Claude Code. The new name reflects the actual scope.

### Preserved (no migration required for existing installs)

- **Internal storage layout** is unchanged: `<project>/.semantic-sidekick-index/` continues to be the index directory, `~/.semantic-sidekick/models/` continues to be the model cache. Existing users do NOT need to re-index or re-download models when they upgrade.
- **All 33 existing MCP tools** remain registered under the same names with the same input schemas and the same output structures. The regression-snapshot suite (`test/regression/`) gates this guarantee — every tool's surface is bit-for-bit preserved.
- **The `--read-only` mode** continues to suppress the same 12 write tools (21-tool surface).
- **All existing slash commands, hooks, skills, and capture flow** are unchanged.
- **`bin/semantic-sidekick` shell command** continues to work as an alias for `bin/semantic-memory`.
- **Configuration files** (`.claude/semantic-sidekick.json`, `.claude/.semantic-sidekick-update-cache.json`) keep their names. The claude-plugin-runtime `pluginName: "semantic-sidekick"` is preserved so update tracking continues without state loss.

### Phase 2.0.0a (this release) — what shipped

This is the **mechanical rebrand** portion of Phase 2.0.0 of the unified memory-layer plan tracked in `~/workspace/the-glitch-kingdom/persistent-planning/.planning/layered-planning-with-mcp-and-hewtd-frontmatter/task_plan.md`. It includes:

- All publication-identity renames listed above
- Preview docs for the planned multi-corpus architecture (`docs/corpora-json.md`, `docs/smart-middle-activation.md`)
- README rebrand framing
- Bin alias for `semantic-memory`

### Phase 2.0.0b (next release) — what's coming

The actual multi-corpus refactor — registry-driven indexer, per-corpus search verbs (`search_vault`, `search_code`, ...), `search_all` cross-corpus verb, smart-middle first-run detection, `corpora.json` schema implementation — ships in a follow-up PR. Until that lands, semantic-memory's runtime behavior is identical to semantic-sidekick 0.2.5.

### Migration for existing users

```bash
# Uninstall the old plugin
/plugin uninstall semantic-sidekick

# Install the new one (same marketplace repo, new plugin name)
/plugin marketplace add https://github.com/TheGlitchKing/semantic-sidekick
/plugin install semantic-memory@semantic-memory-marketplace
```

Or for npm/global installs:

```bash
npm uninstall -g @theglitchking/semantic-sidekick
npm install -g @theglitchking/semantic-memory
```

Or as a project devDependency:

```bash
npm uninstall @theglitchking/semantic-sidekick
npm install --save-dev @theglitchking/semantic-memory
```

Existing on-disk state (the index, model cache, hooks, skills, slash commands) requires no changes. The new package reads from the same paths as the old one.

### Inter-PR dependencies (this release)

- Hard-depends on: nothing (the regression-snapshot baseline already lives on main and gates this release)
- Soft-coupled with: hit-em-with-the-docs#3 (HEWTD 2.2.0 — `tier: "plan"` schema extension); persistent-planning#1 (3.0.0 lg-mode). Neither blocks this release; both ship coordinated for a coherent ecosystem-wide v1.0 launch.

## [0.2.5] - 2026-04-28

### Fixed
- **`<vault-context>` hook injected an unconditional cite-or-deflect imperative
  on every prompt.** The injected block ended with `Instructions: Read the top
  hits ... cite filenames in your response. If none of these actually answer
  the question, say "not in vault" and name the nearest misses.` That string is
  more specific and immediate than the CLAUDE.md rule that says "ignore on
  non-lookup prompts," so models in consumer projects (e.g. RE-InvestorHub)
  obeyed the inline string and blurted citations like
  `Vault citation: keycloak-custom-image.md unrelated — not in vault for this`
  on debugging, status, and directive prompts.

  Fix: rewrote the Instructions string in `hooks/vault-context.js` to be
  conditional and aligned with the CLAUDE.md cite-or-deflect rule — apply only
  on project prose lookups; ignore silently on meta/tool/debugging/status/
  directive/conversational prompts; explicitly forbid the "X unrelated"
  narration. Also gated `main()` on script invocation so the hook can be
  imported by tests, and added a regression test asserting the new shape.
  Suite: 189/189.

## [0.2.4] - 2026-04-26

### Fixed
- **Stop hook emitted invalid output shape on early-exit paths.** The `183aa30`
  fix patched `emitStop()` and the catch block to write `{}` instead of the
  SessionStart-shaped `{hookSpecificOutput: {hookEventName: "Stop"}}` envelope
  (Stop's schema rejects `hookSpecificOutput`). But two earlier short-circuits
  in `main()` — when `findVaultPath` or `findCliBin` returns null — were still
  routing through the generic `emit()` helper, which wrote the broken envelope
  unconditionally. This surfaced in projects where Claude opened in a subdir
  without a local `.mcp.json` or local `node_modules/@theglitchking/...`,
  producing `Stop hook error: Hook JSON output validation failed — (root):
  Invalid input` on every response.

  Fix: introduced `emitNoop(eventName)` helper that branches on Stop and writes
  `{}` for it. Wired into both early-exits and the catch block. Two regression
  assertions added to `test/phase4/mode-hook.test.ts` covering the no-vault
  and no-CLI-bin paths. Suite: 188/188.

## [0.2.3] - 2026-04-22

### Fixed
- **`vault-first` skill + CLAUDE.md rule over-triggered "not in vault"
  deflection.** The rule was written as "cite or deflect on every answer";
  in practice the UserPromptSubmit hook injects `<vault-context>` on *every*
  prompt (including meta-questions, debugging, yes/no, directives, and
  conversational turns), so Claude was opening every response with "not in
  vault" regardless of whether the prompt was actually a vault-eligible
  project lookup.

  Fix: the cite-or-deflect rule now explicitly applies only when the *user's
  question shape* is a project/operational lookup. Meta/tool/debug/status/
  directive prompts → silently ignore the injected block. The filter is the
  user's intent, not the hook's output. Updated in both `skills/vault-first/SKILL.md`
  and the CLAUDE.md rule block.

## [0.2.2] - 2026-04-22

### Fixed
- **Docs MCP (`semantic-sidekick`) was silently removed by reconcile on every
  SessionStart when `hit-em-with-the-docs` was enabled per-project but not
  globally.** `reconcile.js:hewtdEnabled()` only checked `~/.claude/settings.json`;
  per-project enablement (project `.claude/settings.json` or `.claude/settings.local.json`)
  was ignored. Since isOurEntry recognized the docs entry as ours, the reconcile
  removal path deleted it on every boot.
- Fix: `hewtdEnabled(projectRoot)` now checks all three scopes (user, project,
  project-local) and returns true if hewtd is enabled in any of them. The docs
  MCP now persists correctly for project-scope installs.

## [0.2.1] - 2026-04-22

### Fixed (critical)
- **SessionStart hook no longer crashes with `ERR_MODULE_NOT_FOUND` when
  installed via `/plugin install`.** Claude Code's plugin extractor unpacks
  the npm tarball but does not run `npm install` — so `hooks/session-start.js`'s
  static `import { runSessionStart } from "@theglitchking/claude-plugin-runtime"`
  failed at load time, producing the reported errors:

      SessionStart:resume hook error
      Failed with non-blocking status code: node:internal/modules/cjs/loader:1386
      Failed with non-blocking status code: node:internal/modules/package_json_reader:314

  Fix: rewrite `session-start.js` so the critical path (reconcile .mcp.json,
  ensure .claude/.vault) uses zero external deps — `reconcile.js` is pure
  node built-ins. The `claude-plugin-runtime` integration (auto-update policy)
  is now a best-effort dynamic import — skipped silently when not resolvable.
  The hook always emits a valid SessionStart response and never blocks the
  session, even if every optional component is missing.

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
