---
title: v1.1 — brain-absorption
tier: reference
domains: [changelog]
audience: [developers, admin]
tags: [v1.1, brain, agents-md, sessions, skill-bundler, drift, hotfix]
status: active
last_updated: '2026-05-09'
version: '1.1.1'
purpose: What v1.1.0 added (brain-absorption — AGENTS.md, sessions, skill bundler, drift detection) and what v1.1.1 fixed (the rebrand wiring v1.0 left half-finished).
load_priority: 5
---

# v1.1 — brain-absorption

v1.1.0 (2026-05-08) absorbed four targeted strengths from `JimmyMcBride/brain` while keeping semantic-memory's existing multi-corpus + MCP + drift framing. v1.1.1 (2026-05-08) hotfixed the v1.0 rebrand wiring that turned out to be the v1.1.0 install regression.

## v1.1.0 — Added

### AGENTS.md contract artifact

A versionable, regenerable agent contract at the project root with managed-block markers and a preserved Local Notes tail. Adapts brain's contract pattern to semantic-memory's tool surface.

- `regenerate_contract` MCP tool — generates or refreshes
- `inspect_contract` MCP tool — read-only inspection
- `/contract` slash command — `refresh` / `inspect` / `force` subcommands
- Hand-edit detection refuses to overwrite hand-edits inside the managed block unless `force: true`
- Local Notes tail (outside the markers) is preserved verbatim across regenerations

See [contract-guide.md](../operational/contract-guide.md).

### Hard-gated verification sessions

Verification-gated work units. Sessions are opt-in; their hard gate prevents "I shipped without testing" outcomes.

- `session_start({task})` — opens a session
- `session_run({cmd, timeout_ms?})` — runs a verification command, captures exit/duration/tail (~4KB)
- `session_finish({summary, verified?, reason?})` — **HARD GATE:** refuses without verifications unless `verified=false` + non-empty `reason`
- `session_status()` — read-only inspection

State at `<project>/.claude/.semantic-memory/session.json`. Stop hook gains a session-aware branch (when a session is open at Stop, the hook prompts for closure).

`apply_patch`, `synthesize_note`, and `synthesize_promote` auto-record touched paths to `session.notes_touched`.

See [sessions-guide.md](../operational/sessions-guide.md).

### Distill ↔ synthesize_note unification

`synthesize_note` gains proposal mode:

- `proposal: true` writes to `<vault>/proposals/<date>-<slug>.md` with `status: proposal` frontmatter
- `proposal_subdir` overrides the subdirectory ("proposals/research", "proposals/outage", etc.)
- `proposed_target` frontmatter records the canonical destination

New `synthesize_promote` MCP tool atomically promotes a reviewed proposal: creates the canonical destination + deletes the proposal in one rollback-capable operation. Strips `status: proposal` and `proposed_target` frontmatter.

Mode-exit hooks (research → synthesis, outage → postmortem) default to the proposal flow.

### Multi-agent skill bundler

Skill bundles for non-Claude agents (codex, copilot, pi). Existing Claude flow via `claude-plugin-runtime` postinstall is unchanged.

- New CLI: `bin/semantic-memory skills install --agent <name> --scope <local|global>`
- `bin/semantic-memory skills targets` previews paths
- `bin/semantic-memory skills uninstall` removes only manifest-tracked bundles
- `bin/semantic-memory skills list` lists shipped skills
- Per-install manifest at `<target>/.semantic-memory-skill-manifest.json` with sha256s for stale detection
- Drift detection refuses to overwrite changed source skills without `--force`

### SessionStart drift detection

Inline JS fast-tier drift checks (no spawn cost) on every SessionStart:

- `mcp_json_entry` — server entry presence in `.mcp.json`
- `hook_registration` — `SessionStart`/`UserPromptSubmit`/`Stop` registration in `settings.json`
- `agents_contract` — managed-block presence in AGENTS.md
- `session_staleness` — open session >24h with no activity

Healthy installs see nothing. Drifted installs see a `<vault-drift>` block with a pointer to `/healthcheck`.

Manual `/healthcheck` adds the slow tier (full `lint_vault`).

See [drift-detection.md](../operational/drift-detection.md).

## v1.1.0 — Refactored (no behavioral change)

`src/mcp/server.ts` (1039 lines, 33 tools registered inline) split into per-domain modules under `src/mcp/tools/*.ts`. server.ts shrank to ~100 lines. Tool surface bit-for-bit unchanged; regression snapshot suite gated the change.

- 11 tool modules: search, read, write, patch, lint, log, metadata, graph, system, contract, session
- 1 inventory const (`tools/inventory.ts`) — canonical list used by AGENTS.md generator

See [mcp-internals.md](../architecture/mcp-internals.md).

## v1.1.0 — Deprecated (shimmed, removed in v2.0)

Six redundant tools became deprecation shims. All callable through v1.x with `[DEPRECATED]` prefix in description:

- `find_schema_violations` → `lint_vault({checks: ["schema"]})`
- `find_missing_provenance` → `lint_vault({checks: ["provenance"]})`
- `find_stale` → `lint_vault({checks: ["stale"]})`
- `find_broken_links` → `lint_vault({checks: ["broken_links"]})`
- `read_multiple_notes` → `read_note` in a loop
- `rename_tag` → `manage_tags({action: "rename", from, to})`

## Tool surface delta

```
v1.0.x: 33 tools
+regenerate_contract +inspect_contract  (Phase 3)
+synthesize_promote                     (Phase 4)
+session_start +session_run
+session_finish +session_status         (Phase 5)
v1.1.0: 40 tools (write mode), 21 (read-only mode)
```

## Backwards-compatibility contract

Four statements that remain true after v1.1.0:

1. Every existing MCP tool name remains callable. Eliminated tools become deprecation shims.
2. All hook output shapes are unchanged when no session is active and no drift exists.
3. AGENTS.md generation is opt-in. Existing repos see no new files until they ask.
4. Drift detection is silent on healthy installs. Auto-check adds <100ms latency.

Storage layout (`.semantic-sidekick-index/`, `~/.semantic-sidekick/models/`) preserved per the v1.0 promise. No re-index, no model re-download required when upgrading from v1.0.x.

## v1.1.1 — Hotfix: complete the rebrand wiring

v1.1.0 published with the v1.0 rebrand half-finished. Internal package-name lookups still pointed at the legacy `@theglitchking/semantic-sidekick`. Fresh installs failed to register hooks correctly; slash commands invoked the OLD legacy package on npm (still at 0.2.x) — running ancient pre-rebrand code.

v1.1.1 fixed:

- `scripts/link-skills.js` — `packageName`/`pluginName`/`hookCommand` → new package name
- `hooks/reconcile.js` — `findLocalBin` checks new path first, legacy fallback
- `hooks/session-start.js` — runtime delegate uses new name
- `hooks/vault-context.js` — `findVaultPath` matches `semantic-memory` server entries
- All 7 slash commands updated
- `src/cli/index.ts` — `PKG_NAME`, `findLocalBin`, `runRelink`, `isLocalForm`, `isNpxForm` updated; `LEGACY_PKG_NAME` kept for fallback

### Phase 9 lesson

The bug only fired at fresh-install time and slash-command-invocation time, both on the manual-smoke-deferred list. Manual smoke against existing v1.0.x installs needs to happen BEFORE publish, not after. The v1.2 ROADMAP captures this as a fresh-install CI smoke test item.

## How to upgrade from v1.0.x

```bash
npm install --save @theglitchking/semantic-memory@1.1.1
```

No re-index. No model re-download. Slash commands now work correctly. New tools auto-appear after restarting Claude Code.

## See also

- [v1-stack-overview.md](../architecture/v1-stack-overview.md) — architectural narrative
- [v1-0-rebrand.md](./v1-0-rebrand.md) — what v1.0 attempted
- [v1-2-state-consolidation.md](./v1-2-state-consolidation.md) — what came next
