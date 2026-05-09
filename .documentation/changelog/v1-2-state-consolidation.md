---
title: v1.2 — state consolidation under .claude/.semantic-memory/
tier: reference
domains: [changelog]
audience: [developers, admin]
tags: [v1.2, state, sidekick, semantic-memory, migrate-state]
status: active
last_updated: '2026-05-09'
version: '1.2.0'
purpose: What v1.2.0 changed — three transient state files moved from .claude/.sidekick-* to .claude/.semantic-memory/. Read-with-fallback through v1.x.
load_priority: 5
---

# v1.2 — state consolidation under .claude/.semantic-memory/

v1.2.0 (2026-05-09) consolidates every transient state file under one namespace: `.claude/.semantic-memory/`. Renames the legacy `.sidekick-*` files to drop the obsolete prefix. All legacy paths remain readable through v1.x via fallback; v2.0 will remove the fallback.

## What's new

### State file paths

Three transient state files in `hooks/vault-context.js` move:

| Old path | New path |
|---|---|
| `.claude/.sidekick-mode` | `.claude/.semantic-memory/mode` |
| `.claude/.sidekick-fingerprints.json` | `.claude/.semantic-memory/fingerprints.json` |
| `.claude/.sidekick-capture-pending.json` | `.claude/.semantic-memory/capture-pending.json` |

`session.json` and `healthcheck-cache.json` were already correctly placed under `.claude/.semantic-memory/` since v1.1.

### Read-with-fallback semantics

Reads check the new path first; if absent, fall back to the old path. Writes always go to the new path. `bin/semantic-memory migrate-state` does the explicit move for users who want the legacy files cleaned up immediately.

```
new path exists?  → read new
new path absent?  → read old (legacy fallback)
write any state   → always to new path
```

This means: as soon as ANY write happens for a given state file, the new path takes over and the old path becomes a relic. Users who never run `migrate-state` see no behavioral change.

### `bin/semantic-memory migrate-state`

One-shot CLI command. Idempotent atomic move from legacy → new paths.

```bash
node ./node_modules/@theglitchking/semantic-memory/bin/semantic-memory migrate-state
```

Options:

- `--dry-run` — preview without changing anything
- `--force` — when both old and new paths exist, prefer the new path and delete the old
- `--project <path>` — override the project root

Returns structured `{migrated, skipped, conflicts}`.

See [state-migration.md](../operational/state-migration.md).

### `legacy_state_files` healthcheck finding

New fast-tier check in `runHealthcheck`. Detects legacy `.claude/.sidekick-*` files and surfaces a `warn` with a pointer to `migrate-state`. Read-only detection; never auto-migrates. Healthy installs see "no legacy state files" (severity: ok).

See [drift-detection.md](../operational/drift-detection.md).

## Backwards compatibility

Three statements that remain true after v1.2.0:

1. **All legacy paths continue to be readable through v1.x.** Users who never run `migrate-state` see no behavioral change.
2. **No state files are silently moved or deleted.** Migration is opt-in via `bin/semantic-memory migrate-state`; healthcheck only warns.
3. **v2.0 will remove the legacy-path read fallback** — committed in this CHANGELOG entry. Users have all of v1.x to migrate. Storage paths (`.semantic-sidekick-index/`, `~/.semantic-sidekick/models/`) are NOT affected by this change; those are preserved through v1.x per the v1.0 promise.

## Bug fixed during dogfood

`src/cli/migrate-state.ts` originally used `require("node:fs")` inside the function for `mkdirSync`. ESM bundling rejects dynamic require with `Error: Dynamic require of "fs" is not supported`. Switched to a static import. Caught only because we ran `migrate-state` against this very repo as a manual smoke test — unit tests used `--dry-run` paths that bypassed the `mkdir` call.

This is the second time in the v1.x absorption arc that real-environment manual smoke caught a bug that snapshot tests missed. Strong evidence for the v1.2 ROADMAP item "fresh-install CI smoke test" — that should land soon.

## Tests added

- `test/unit/migrate-state.test.ts` — 8 new tests covering: clean project, partial-state, full-state, idempotency, conflict refusal, `--force` resolution, `--dry-run` preview, `--dry-run` + `--force` preview
- `test/unit/healthcheck.test.ts` — 2 new tests for the `legacy_state_files` check
- `test/phase4/mode-hook.test.ts` — 2 updated tests verifying writes land at the new path

Total v1.2.0: 32 test files, 287 tests passing (+10 new since v1.1.1).

## How to upgrade from v1.1.x

```bash
# Update the package
npm install --save @theglitchking/semantic-memory@1.2.0

# Optional but recommended: migrate legacy state files
node ./node_modules/@theglitchking/semantic-memory/bin/semantic-memory migrate-state

# Verify
node ./node_modules/@theglitchking/semantic-memory/bin/semantic-memory --version  # → 1.2.0
node ./node_modules/@theglitchking/semantic-memory/bin/semantic-memory healthcheck --fast
```

`migrate-state` is idempotent — running it on an already-migrated install is harmless (`skipped-already-migrated`).

## What v1.2.0 does NOT change

- The vector index (`<vault>/.semantic-sidekick-index/`) — deferred to v2.0
- The model cache (`~/.semantic-sidekick/models/`) — deferred to v2.0
- The vault content (`.claude/.vault/`) — never moves; user-owned
- The MCP tool surface — exactly the same 40 tools as v1.1.x
- Existing Claude flow via `claude-plugin-runtime` postinstall

## See also

- [v1-stack-overview.md](../architecture/v1-stack-overview.md) — architectural narrative
- [state-migration.md](../operational/state-migration.md) — the operational guide
- [indices-and-storage.md](../architecture/indices-and-storage.md) — every file the plugin writes to disk after v1.2
- [v1-1-brain-absorption.md](./v1-1-brain-absorption.md) — what v1.1 added
- [v1-0-rebrand.md](./v1-0-rebrand.md) — what v1.0 attempted
