---
title: v1.0 — Rebrand to semantic-memory
tier: reference
domains: [changelog]
audience: [developers, admin]
tags: [v1, rebrand, semantic-memory, semantic-sidekick, multi-corpus]
status: active
last_updated: '2026-05-09'
version: '1.0.0'
purpose: What v1.0.0 actually changed. Public-facing rename; internal wiring partly left for v1.1.1 to clean up. Storage paths preserved.
load_priority: 5
---

# v1.0 — Rebrand to semantic-memory

v1.0.0 (2026-05-07) renamed the public-facing surface from `semantic-sidekick` to `semantic-memory`. The framing shifted from "vault-helper sidekick" to "unified memory layer."

## What was renamed

| Surface | Old | New |
|---|---|---|
| npm package | `@theglitchking/semantic-sidekick` | `@theglitchking/semantic-memory` |
| Marketplace name | `semantic-sidekick-marketplace` | `semantic-memory-marketplace` |
| Plugin name (Claude Code) | `semantic-sidekick` | `semantic-memory` |
| MCP server name (initialize handshake) | `semantic-sidekick` | `semantic-memory` |
| Primary CLI binary | `bin/semantic-sidekick` | `bin/semantic-memory` |

## What was preserved

The v1.0 storage promise — kept through all of v1.x:

- `<vault>/.semantic-sidekick-index/` — vector index dir, kept for backwards-compat with existing v0.x indices
- `~/.semantic-sidekick/models/` — embedding model cache, kept for backwards-compat

These intentionally retain the legacy name. Renaming would invalidate every existing user's index and force a 90 MB model re-download. v2.0 will move them with transparent atomic migration.

The `bin/semantic-sidekick` binary alias was preserved inside the new package — anyone scripting against it continues to work.

## What v1.0 promised but didn't fully deliver

The README announced multi-corpus architecture: vault, code, plans, docs, research, project-map. Six corpora with conditional tool registration based on which corpora are active.

**Reality at v1.0:** only the **vault** corpus is wired. The other 5 are conceptual placeholders. The MCP server registers vault tools unconditionally; there's no `--corpus` flag, no separate index per corpus, no cross-corpus graph.

This is acknowledged in the v1.x roadmap as multi-quarter work. v1.4+ candidate.

## What v1.0 left half-finished (the v1.1.1 hotfix bait)

The rebrand only changed the public-facing names. Multiple internal references stayed hardcoded to `@theglitchking/semantic-sidekick`:

- `scripts/link-skills.js` — postinstall passed `packageName: "@theglitchking/semantic-sidekick"`
- `hooks/reconcile.js` — `PKG = "@theglitchking/semantic-sidekick"`, `findLocalBin` looked at the wrong path
- `hooks/session-start.js` — runtime delegate passed the legacy name
- `hooks/vault-context.js` — `findVaultPath` only matched `semantic-vault` and `semantic-sidekick` server entries
- All 7 slash commands (`/healthcheck`, `/status`, `/normalize-config`, `/policy`, `/mode`, `/update`, `/relink`) hardcoded `@theglitchking/semantic-sidekick`
- `src/cli/index.ts` — `PKG_NAME`, `findLocalBin`, `runRelink`, `isLocalForm`, `isNpxForm` all looked at the legacy path

**Consequence:** fresh `npm install @theglitchking/semantic-memory@1.0.x` failed to register hooks correctly, and the 7 slash commands invoked the OLD `@theglitchking/semantic-sidekick` package (still on npm at 0.2.x) — running ancient pre-rebrand code.

This was the bug v1.1.1 hotfixed (see [v1-1-brain-absorption.md](./v1-1-brain-absorption.md) for the v1.1.1 details).

## v1.0.0 vs v1.0.1

v1.0.0 was published briefly then unpublished while the publish strategy was being reviewed. npm tombstones unpublished version slots, so the same version cannot be republished. v1.0.1 bumped to a fresh slot with byte-identical content.

If you have v1.0.0 installed (cached from the brief publish window), bump to v1.0.1 directly. No migration steps required between them.

## Migration from v0.x

Update your dependency:

```bash
npm uninstall @theglitchking/semantic-sidekick
npm install --save @theglitchking/semantic-memory@1.0.1
```

Or just install the new package alongside (both can coexist temporarily; the legacy reconcile.js falls back to either path):

```bash
npm install --save @theglitchking/semantic-memory@1.0.1
# leave @theglitchking/semantic-sidekick installed for a while
```

## See also

- [v1-1-brain-absorption.md](./v1-1-brain-absorption.md) — what came next, and the v1.1.1 hotfix that completed the rebrand wiring
- [v1-2-state-consolidation.md](./v1-2-state-consolidation.md) — storage cleanup
- [v1-stack-overview.md](../architecture/v1-stack-overview.md) — architectural narrative
