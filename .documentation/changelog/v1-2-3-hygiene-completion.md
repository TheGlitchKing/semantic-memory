---
title: v1.2.3 — hygiene line completed (--fix, code_symbols, CI smoke)
tier: reference
domains: [changelog]
audience: [developers, admin]
tags: [v1.2.3, healthcheck, fix, code_symbols, lint, ci, smoke-test]
status: active
last_updated: '2026-07-10'
version: '1.3.0'
purpose: What v1.2.3 added — the three v1.2 roadmap items that slipped past 1.2.0/1.2.1/1.2.2 (healthcheck --fix, code_symbols lint, fresh-install CI smoke).
load_priority: 5
---

# v1.2.3 — hygiene line completed

v1.2.3 (2026-07-10) ships the three v1.2 roadmap items that slipped when 1.2.1 and 1.2.2 were preempted by defect fixes. All three are additive — no tool is removed, and default behavior is unchanged unless a flag is passed.

## What's new

### 1. `healthcheck --fix` — safe auto-remediation

`/healthcheck --fix` (and `semantic-memory healthcheck --fix` on the CLI) runs drift detection, applies **safe** fixes for fixable findings, then re-runs detection so the printed findings reflect the post-fix state.

"Safe" means idempotent, non-destructive, and derivable from the install itself. The four auto-fix actions map to a finding's `fixable_via`:

| `fixable_via` | Action | Fixes finding |
|---|---|---|
| `skill-link` | re-link skills/hooks | `hook_registration`, `skill_manifest:*` |
| `mcp-reconcile` | reconcile `.mcp.json` | `mcp_json_entry` |
| `reindex` | rebuild the vector index | `index_freshness` |
| `state-migrate` | run `migrate-state` | `legacy_state_files` |

Findings that touch **user-authored content** are never auto-changed — they are reported for human review:

- `agents_contract` (hand-edited / custom `AGENTS.md`) → run `/contract` or move content to a Local Notes section.
- `session_staleness` → resume or remove the session file.
- `lint_vault` (stale notes, broken wikilinks, schema violations) → `lint_vault` for the full report.

The decision logic lives in a pure, unit-tested planner (`src/core/healthcheck-fix.ts`); the CLI executes the plan. `legacy_state_files`'s `fixable_via` changed from `none` to `state-migrate`.

**Latent bug fixed in the same change:** the `healthcheck` CLI command called `process.exit(0)` immediately after the install smoke-test succeeded, so the drift-detection step (added in v1.1) never ran on a *healthy* install — it only surfaced when the smoke-test failed. The command is now one coherent action: smoke-test → drift → optional `--fix` → emit, exiting once at the end.

### 2. `lint_vault({checks:["code_symbols"]})` — code-path drift

A new **opt-in** lint rule. It scans note inline-code spans for repo-relative file-path references and flags ones whose first path segment IS a real directory in the repo but whose full path no longer exists — a stale reference to a moved or deleted file.

- Anchoring on an existing first segment keeps false positives low: paths belonging to other repos (whose top-level dir isn't present) are skipped, as are URLs, globs, and prose that merely contains a slash.
- **Fails open** (silent no-op) outside a code repo.
- **Never in the default report** or the healthcheck slow tier — you must request it explicitly. This keeps existing `lint_vault` behavior byte-stable.

Scope note: this validates *path* references. Fine-grained symbol-name checking (function/class identifiers) needs a real symbol index and is deferred to the v1.4 lexicon arc, which will extend this same `code_symbols` rule.

### 3. Fresh-install CI smoke test

`scripts/smoke-install.sh` + a `smoke` job in `.github/workflows/ci.yml`. It packs the tarball, installs it into a throwaway consumer project, and asserts:

1. `bin --version` reports the current version (not a stale cached one);
2. the CLI loads all subcommands (catches `ERR_MODULE_NOT_FOUND` / broken dist);
3. every runtime file the plugin depends on is actually IN the tarball;
4. the SessionStart `reconcile` wiring populates `.mcp.json` on a fresh install.

This mechanically prevents the v1.1.0-class packaging bug (the highest-ROI item on the v1.2 roadmap). Run it locally with `bash scripts/smoke-install.sh`.

## Where it lives

| Thing | Location |
|---|---|
| `--fix` planner (pure) | `src/core/healthcheck-fix.ts` |
| `--fix` executor + healthcheck action | `src/cli/index.ts` (`executeFixes`, `healthcheck` command) |
| `code_symbols` detector | `src/core/lint.ts` (`findCodeSymbolDrift`, `looksLikeRepoPath`) |
| `code_symbols` MCP wiring | `src/mcp/tools/lint.ts` |
| CI smoke | `scripts/smoke-install.sh`, `.github/workflows/ci.yml` |
| Tests | `test/unit/healthcheck-fix.test.ts`, `test/unit/lint-code-symbols.test.ts` |

## See also

- [Root CHANGELOG.md](../../CHANGELOG.md) — git-tracked release notes
- [drift-detection.md](../operational/drift-detection.md) — how healthcheck drift + `--fix` work operationally
- [cli-reference.md](../reference/cli-reference.md) — `healthcheck --fix` flags
- [`REGISTRY.md`](./REGISTRY.md) — tabular metadata view
