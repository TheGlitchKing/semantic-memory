# semantic-memory Roadmap

This file tracks the committed near-term direction for `@theglitchking/semantic-memory`. It's a planning surface — not a contract. Items move between sections as the work clarifies; the canonical state lives here in git.

> **Current shipped version:** v1.2.3 on `main` (npm `latest`); v1.3.0 (confidence-decay core) in review on `feat/v1.3-confidence-decay`.
> **Last updated:** 2026-07-10
>
> **v1.2 status:** COMPLETE — state consolidation (1.2.0), `/healthcheck --fix` + `code_symbols` lint + fresh-install CI smoke (1.2.3). The three items that slipped past 1.2.0/1.2.1/1.2.2 landed in 1.2.3.
> **v1.3 status:** core SHIPPED (decay engine, search integration, `decay` surfacing, `verify_note`, `evergreen`, `decay-config`/`decay-trace`). Deferred within the v1.3 line: backlink hotness (flag-off), `decay_candidates` lint, and selection-logging telemetry (dependency for the v1.4 usage-feedback ranking). The `last_modified` split proved unnecessary for decay correctness — `last_verified` is already never bumped on edits.

## Legend

- 🎯 **Committed** — planned for the named version, plan file exists under `.planning/`
- ✅ **Shipped** — already released
- 🤔 **Considering** — likely but not yet planned in detail
- 🌙 **Deferred** — ideas with merit but not on the near-term roadmap
- 🚫 **Won't ship** — actively decided against

## v1.2 — hygiene release (next)

Small-scope cleanup work that closes loose ends from v1.1 before the bigger v1.3 retrieval work lands. Targeted as a single bundled release.

### 🎯 State consolidation under `.claude/.semantic-memory/`
- Move `.claude/.sidekick-mode` → `.claude/.semantic-memory/mode`
- Move `.claude/.sidekick-fingerprints.json` → `.claude/.semantic-memory/fingerprints.json`
- Move `.claude/.sidekick-capture-pending.json` → `.claude/.semantic-memory/capture-pending.json`
- Drop the legacy `.sidekick-*` prefix; rename to drop the redundant leading dot
- New CLI: `bin/semantic-memory migrate-state` (idempotent, opt-in)
- Read-with-fallback: legacy paths still work through all of v1.x
- Healthcheck surfaces a `legacy_state_files` warning when old paths are present
- **Plan:** `.planning/v12-state-consolidation/task_plan.md`
- **Effort:** ~3 days

### 🎯 `/healthcheck --fix` flag
- Auto-apply safe fixes for drift findings: re-link skills, reconcile `.mcp.json`, regenerate AGENTS.md, run `migrate-state`
- Refuses non-safe fixes (stale notes, broken wikilinks, hand-edited managed blocks → human review)
- Documented in `commands/healthcheck.md` since v1.1; implementation deferred
- **Effort:** ~1 week

### 🎯 Fresh-install CI smoke test
- Pre-publish CI job: `npm pack` → install tarball into clean tmpdir → verify hooks register, `.mcp.json` populates, `bin --version` works
- Mechanically prevents the v1.1.0-class packaging bug
- This is the highest-ROI v1.2 item — would have caught v1.1.0 → v1.1.1 hotfix before publish
- **Effort:** ~1 day

### 🎯 Code-symbol drift detection (conditional on babel-fish)
- New `lint_vault({checks: ["code_symbols"]})` rule
- Cross-references vault note inline code mentions against project-map's symbol index
- Flags notes whose referenced symbols no longer exist
- Fails open when babel-fish is not installed
- **Effort:** ~3 days

**v1.2 total estimate:** ~2 weeks active work + ≥1 week dogfood before v1.3 starts.

## v1.3 — confidence-decay (after v1.2 ships clean)

Replaces age-blind retrieval ranking with smooth, type-aware, composable confidence decay. Notes age out of relevance gracefully; explicitly-verified notes reset the clock.

### 🎯 Smooth exponential decay engine
- `multiplier = 0.5^(age_days / half_life)`
- Per-type half-life: `decision: 365d`, `note: 365d`, `gotcha: 180d`, `source: ∞`, `proposal: 14d`
- Configurable via `vault.schema.yml`
- Floor at 0.1 (notes never disappear, just down-weight)

### 🎯 `last_verified` semantically split from `last_modified`
- `last_modified`: auto-stamped on every edit
- `last_verified`: only updated by note creation OR explicit `verify_note` tool
- Idempotent migration helper: `bin/semantic-memory migrate-schema`

### 🎯 New tool: `verify_note(path)`
- Updates `last_verified` only — no content change
- Logs a `kind: verify` event to `log.md`
- Resets the decay clock for one note

### 🎯 Surface decay in search output
- `search_semantic` and `search_hybrid` results gain an optional `decay: { multiplier, age_days, effective_half_life, reason }` block
- Block omitted on healthy (multiplier 1.0) results
- Agents see staleness and can proactively offer to re-verify

### 🎯 `evergreen` frontmatter opt-out
- `evergreen: true` → decay multiplier locked at 1.0
- BUT requires `last_verified` within 365 days — evergreen claim itself expires periodically

### 🎯 Backlink hotness boost (feature-flagged off by default)
- Notes with high inbound link count get extended effective half-life
- Capped at 2× extension
- Earn it via Phase 10 telemetry rather than ship it on by default

### 🎯 `decay_candidates` lint rule
- `lint_vault({checks: ["decay_candidates"]})` surfaces stale-but-frequently-relevant notes
- Wires into `/healthcheck` slow tier

### 🎯 CLI introspection
- `bin/semantic-memory decay-config` — print active decay parameters
- `bin/semantic-memory decay-trace <path>` — debug one note's decay calculation

### 🎯 Selection logging (local JSONL telemetry)
- `.claude/.semantic-memory/decay-telemetry.log` (gitignored)
- Tracks query → results → which result agent actually used
- Local only, opt-out via `decay.telemetry.enabled: false`
- Two weeks of passive collection informs the next round of half-life tuning

**Plan:** `.planning/v13-confidence-decay/task_plan.md`
**v1.3 total estimate:** ~2.5 weeks active + ≥2 weeks dogfood (longer than v1.1 — ranking changes need more soak).

## v2.0 — close the migration window

The release where every legacy fallback collected during v1.x finally goes away. Coordinates the deprecation-shim removal with the rest of the layout cleanup so users do their migration once.

### 🎯 Remove deprecation shims (committed in v1.1 CHANGELOG)
- `find_schema_violations` → `lint_vault({checks: ["schema"]})`
- `find_missing_provenance` → `lint_vault({checks: ["provenance"]})`
- `find_stale` → `lint_vault({checks: ["stale"]})`
- `find_broken_links` → `lint_vault({checks: ["broken_links"]})`
- `read_multiple_notes` → `read_note` in a loop or batched MCP calls
- `rename_tag` → `manage_tags({action: "rename", from, to})`

### 🎯 Move the vector index out of the vault
- `<vault>/.semantic-sidekick-index/` → `.claude/.semantic-memory/index/`
- Atomic move-with-verify migration on first run after upgrade
- Cleaner separation: derived state stops living inside user content
- Honors the v1.0 storage promise's spirit (no re-index, no model re-download) by transparent move

### 🎯 Move the global model cache
- `~/.semantic-sidekick/models/` → `~/.semantic-memory/models/`
- One-shot rename (or atomic move) on first v2.0 run
- Higher cost than the index move (cross-device, multiple repos may share); document carefully

### 🎯 Remove legacy-state read fallback
- v1.2 introduced "read new path first, fall back to old"
- v2.0 drops the fallback — old paths are no longer respected
- `bin/semantic-memory migrate-state` becomes a hard prerequisite (run during upgrade or lose state)

### 🎯 Remove `bin/semantic-sidekick` alias
- The legacy CLI name kept since the v1.0.0 rebrand goes away
- Anyone still scripting against `semantic-sidekick` updates to `semantic-memory`

### 🎯 Remove legacy `@theglitchking/semantic-sidekick` package fallback paths
- All four fallback sites in `reconcile.js`, `link-skills.js`, `vault-context.js`, `src/cli/index.ts` collapse to single new-path lookups
- The legacy npm package (still on the registry at 0.2.x) gets a final deprecation `README` pointer to the new package

### 🎯 Rename `reindex` and `regenerate_index`
- `reindex` → `rebuild_search_index`
- `regenerate_index` → `regenerate_index_notes`
- The confusable pair finally becomes unambiguous

### 🤔 Tighten default decay constants
- Based on telemetry from v1.3 dogfood, ship more aggressive defaults
- Conservative-then-tighten was the right v1.3 strategy; v2.0 is when we use the data

**v2.0 total estimate:** ~2 weeks active + ≥2 weeks dogfood. The bulk is migration helpers + writing migration documentation, not new features.

## v1.3+ — multi-corpus completion (separate effort)

The README at v1.0.0 promised "multi-corpus architecture: vault, code, plans, docs, research, project-map." Today only the **vault** corpus is fully wired. The other 5 corpora exist as conceptual placeholders, not as separate indices, separate tool registrations, or separate retrieval tuning.

This is **multi-quarter work**, not one release. Suggested first step: pick ONE additional corpus (probably `code`) and wire it end-to-end. Decide whether multi-corpus is the future or whether to consolidate back to vault-only based on what that integration teaches.

🤔 **Considering for a v1.4 or v1.5:**
- Code corpus wiring (separate index, separate tools, separate retrieval)
- Cross-corpus graph queries (the unified knowledge graph actually unifies)
- Per-corpus retrieval tuning (chunking strategy varies by content type)

Don't pre-build adapters for the other 4 corpora; let real demand surface them.

## 🤔 Considering (no committed slot yet)

Stuff with merit but no version commitment.

- **Confidence-multiplier composition** — `confidence: low|medium|high` already in the schema; v1.3 wires it as a multiplicative boost, but per-vault tuning could be useful
- **Per-agent skill format transforms** — codex/copilot/pi may need format adapters once we see real usage
- **Stale-session auto-cleanup** — sessions open >7 days with no activity could auto-close with `verified: false, reason: "auto-stale"`. Decide based on dogfood feedback.
- **Mode-state in JSON instead of plain text** — only if we ever need metadata (last_changed, prior_mode). Today's plain text is fine.

## 🌙 Deferred wishlist (would be cool, no plan)

These are real ideas, not committed work. Order roughly by expected value-per-effort:

### Authoring & retrieval
- Auto-suggest `derived_from` candidates when synthesizing
- Duplicate-content detection (cluster chunk vectors, surface 0.92+ similar pairs)
- `bin/semantic-memory ingest <url>` — fetch + readability + write as `source` note

### Visualization
- Read-only local web UI (`bin/semantic-memory ui`)
- Provenance heatmap — which notes are most-cited
- Drift trend chart over time

### Cross-tool integration
- GitHub Action: `lint_vault` as a CI step
- VS Code extension for `read_note` / `synthesize_note` / `search_hybrid`

### Session evolution
- Session diff at finish — auto-emit a structured what-changed report
- Named/concurrent sessions (probably not worth it; the constraint is also a feature)

### Wild
- Adversarial vault auditor — generate "trick questions," flag where vault is silently wrong
- Vault-against-PR drift (requires multi-corpus first)
- LLM-summarized SessionStart context (vs. raw top-N hits)

## 🚫 Won't ship

Decided against. Documented to prevent rediscovery.

- **Skills marketplace** — scope creep, not the project's concern
- **Custom embedding model fine-tuning per project** — costly, niche, fragile
- **Hosted analytics / centralized telemetry** — breaks the local-first promise
- **Premium tier of any kind** — same
- **Account requirement** — same
- **Hosted MCP-as-a-service mode** — would change the project's character

These all break the "local-first, no surveillance, no central server" promise that's quietly the most attractive thing about both this project and `JimmyMcBride/brain`. We resist scope creep that erodes that.

## How this file is maintained

- **Source of truth:** the .planning/ artifacts under `.planning/v1*-*` are the detailed task plans. This file summarizes them.
- **Update cadence:** at every release, move shipped items from "committed" to "shipped" with a link to the release tag. Add new committed items as plans graduate from "considering."
- **`/.planning/` is gitignored** — those are runtime planning artifacts. This ROADMAP.md is the durable, public-facing summary.
- **Don't promise dates.** Effort estimates only. Dates are a forecasting trap.
- **Honest scope:** if something turns out to be larger than estimated, move it to a later version rather than scope-creep the current one.
