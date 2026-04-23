---
title: Configuration Reference
tier: reference
domains: [reference]
audience: [developers]
tags: [config, settings, env-vars, tunables]
status: active
last_updated: '2026-04-23'
version: '0.2.3'
purpose: Every config file, env var, schema field, and tunable
load_priority: 7
---

# Configuration reference

## Files

### `.claude-plugin/plugin.json`
Plugin manifest. Name, description, version, keywords.

### `.claude-plugin/marketplace.json`
Marketplace descriptor — lets `/plugin marketplace add` register this repo.

### `.mcp.json` (per-project)
MCP server registration. Written by the Phase 0 reconcile hook. Expected shape:
```json
{
  "mcpServers": {
    "semantic-vault": {
      "type": "stdio",
      "command": "node",
      "args": ["./node_modules/@theglitchking/semantic-sidekick/bin/semantic-sidekick",
               "--notes", "./path/to/vault"]
    }
  }
}
```
Gitignored by default. Regenerated on SessionStart by `hooks/reconcile.js`.

### `.claude/settings.json` (per-project)
Project-level Claude Code settings. Hooks auto-merge from plugin's `hooks/hooks.json`. Can override:
- `permissions.allow[]` / `permissions.deny[]`
- `env.<VAR>` — environment variables for hook/tool invocations
- `statusLine` — custom status bar command
- `hooks.<event>[]` — additional hooks beyond the plugin

### `.claude/CLAUDE.md` (per-project)
System-prompt-level instructions. Semantic-sidekick contributes two rule blocks:
- Vault-first rule (Phase 1)
- Routing / mode indicator rule (Phase 4)

### `<vault>/vault.schema.yml`
Per-vault schema override. If absent, the default from `src/core/schema-default.ts` applies. Install with `semantic-sidekick install-schema --notes <path>`.

### `<vault>/.semantic-sidekick-index/` — index artifacts (gitignored)
- `hnsw.bin`, `hnsw-meta.json` — HNSW vector index.
- `embeddings.json` — per-chunk vectors, keyed by `<path>:<chunkIndex>`.
- `graph.json` — built graph.
- `meta.json` — model, dimensions, totalChunks, indexedAt.
- `docs.cache.json` — Phase 2 parsed-doc cache (drops hook latency 9x).

### `<vault>/log.md` — the durable state log (tracked with vault content)
Append-only. Format per entry:
```
- <iso-ts> — <kind>: <summary>
```yaml event
ts: <iso-ts>
kind: <kind>
summary: "<summary>"
payload:
  key: value
```
```

---

## Per-project runtime state (`.claude/`)

| File | Written by | Read by | Reset on |
|---|---|---|---|
| `.claude/.sidekick-mode` | `/mode` command + SessionStart hook | UserPromptSubmit + Stop hooks | SessionStart (resets to `vault-first`) |
| `.claude/.sidekick-fingerprints.json` | UserPromptSubmit hook | UserPromptSubmit hook | Manual `rm`; not auto-reset |
| `.claude/.sidekick-capture-pending.json` | UserPromptSubmit hook | Stop hook | SessionStart; Stop after emit |
| `.claude/.semantic-sidekick-update-cache.json` | Plugin runtime | SessionStart hook | TTL-based (runtime) |
| `.claude/.sidekick-update-cache.json` | (legacy — may exist from prior installs) | — | Safe to delete |

All are gitignored by default.

---

## Environment variables

### Read by hooks / CLI
| Variable | Source | Effect |
|---|---|---|
| `SIDEKICK_DEBUG` | User-set | `=1` enables stderr debug log in vault-context.js |
| `SIDEKICK_VAULT_PATH` | User-set (test) | Overrides `.mcp.json`-derived vault discovery |
| `CLAUDE_STOP_HOOK_ACTIVE` | Claude Code | `=1` during Stop-block reentry; hook loop guard |
| `CLAUDE_PROJECT_DIR` | Claude Code | Project root (preferred over `cwd` from stdin) |
| `CLAUDE_PLUGIN_ROOT` | Claude Code | Plugin install dir (used in hooks.json commands) |

### Read by Node runtime
| Variable | Effect |
|---|---|
| `NODE_OPTIONS=--max-old-space-size=4096` | Raise heap if reindex fails OOM on large vaults |

---

## Schema (`vault.schema.yml`) fields

Defaults — see `src/core/schema-default.ts` for the ground truth.

### `version` (number)
Schema format version. Current: 1.

### `provenance_fields` (string[])
Field names that constitute provenance. Default: `[sources, derived_from, last_verified, status, confidence]`.

### `status_enum` (string[])
Allowed values for `status` frontmatter. Default: `[draft, active, stale, deprecated, archived]`.

### `confidence_enum` (string[])
Default: `[high, medium, low]`.

### `severity_enum` (string[])
For `gotcha` type. Default: `[low, medium, high, critical]`.

### `types` (map)
```yaml
types:
  <type-name>:
    description: str  # optional
    required: [<field>, ...]  # list of required frontmatter keys
```
Default types: `note`, `decision`, `gotcha`, `source`.

### `lint` (map)
```yaml
lint:
  missing_provenance:
    applies_to: [note, decision, gotcha]  # list of types to check
    severity: warn                         # warn | error
  stale:
    max_age_days: 180                      # 0 = disabled
    severity: warn
  schema_violations:
    severity: error                        # blocks apply_patch when validate=true
```

---

## Hook tuning (edit source, no config)

| Setting | Location | Default | Meaning |
|---|---|---|---|
| UserPromptSubmit limit | `hooks/vault-context.js:handlePrompt` | 8 | Top-K hits injected per prompt |
| SessionStart limit | `hooks/vault-context.js:handleSessionStart` | 6 | Top-K hits in sessionstart preload |
| Fingerprint ring size | `hooks/vault-context.js:handlePrompt` | 10 | How many recent prompts to dedup against |
| State-delta window | `hooks/vault-context.js:handleSessionStart` | 14 days | Log entries surfaced in `<vault-state-since>` |
| Search timeout | same file | 30s | Max time to wait for search CLI |
| Prompt min length | `handlePrompt` | 8 chars | Below this, no search fired |
| Capture cue regexes | `hooks/vault-context.js:CAPTURE_CUES` | 5 patterns | Trigger words for capture-pending append |

These are code constants, not config — edit the file + rebuild if you need different values. Intentional: keeps the config surface small.

---

## Plugin auto-update policy (`semantic-sidekick.json`)

Written by the plugin runtime to `.claude/semantic-sidekick.json`:
```json
{ "updatePolicy": "nudge" }
```

Values:
- `nudge` (default) — SessionStart shows a one-line upgrade reminder when a newer version is on npm.
- `auto` — auto-runs `npm update` on SessionStart if a newer version exists.
- `off` — no upgrade checks.

Change via `/semantic-sidekick:policy <value>` or edit the file directly.
