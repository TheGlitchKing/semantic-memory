---
title: Logs and Events (log.md)
tier: reference
domains: [operational]
audience: [developers]
tags: [logs, events, state-delta, observability]
status: active
last_updated: '2026-04-23'
version: '0.2.3'
purpose: log.md format, auto-kinds, state-delta preload, future-Claude usage
load_priority: 7
---

# Logs and events

> `log.md` at the vault root is the **durable state-of-record** across sessions. It's where future-Claude reads "what has been happening here?" before deciding what to do.

## Why a vault-resident log

Three alternatives were considered and rejected:

- **Sidecar log file** (e.g., `.sidekick.log`) — ignored by MCP search, invisible to future-Claude, easy to forget.
- **External log system** (OpenTelemetry, Sentry) — heavy, adds infrastructure, not inspectable via the vault's MCP tools.
- **In-session-only memory** — evaporates at session end; the whole problem we're solving.

log.md wins because:
- Lives in the vault → MCP-addressable via `log_query` without special tooling.
- Plain markdown → human-readable by eye, version-controlled alongside the rest of the vault.
- Embedded YAML blocks → machine-parseable without an external schema definition.
- Append-only → no truncation mid-flight, no coordination problems with the watcher.

## File format

```markdown
# Vault Log

> Append-only session and ingest log. Machine-readable YAML blocks follow each line.

- 2026-04-22T00:00:00Z — ingest: added 3 notes from RFC-1234
```yaml event
ts: 2026-04-22T00:00:00Z
kind: ingest
summary: "added 3 notes from RFC-1234"
payload:
  source_path: sources/rfc-1234.md
  unit_paths: ["notes/a.md", "notes/b.md", "notes/c.md"]
  source_uri: "https://example.com/rfc-1234"
```

- 2026-04-22T00:05:14Z — synthesis: synthesized Phase 2 Validation Run
```yaml event
ts: 2026-04-22T00:05:14Z
kind: synthesis
summary: "synthesized Phase 2 Validation Run"
payload:
  path: validation/phase-2-live-run.md
  type: note
  sources: ["session:live-validation-2026-04-22"]
  derived_from: []
```
```

Each entry: one bullet line + one fenced `yaml event` block. Both live together. The line is for humans scrolling; the YAML is for `log_query`.

## The parser

The read-path parser (`parseEntries` in `src/core/log.ts`) is intentionally minimal — it only matches the exact shape our writer produces:

- Top-level keys: `ts`, `kind`, `summary`, optional `payload`.
- `payload` is a flat map: one level of `key: value`, no nesting beyond scalar/array/string/bool/null.

Anything more complex than the writer emits is not guaranteed to parse. If you need richer nesting, use `synthesize_note` to file a proper note and reference it from the log entry's summary.

## Kinds written automatically

| Kind | Source | Payload fields |
|---|---|---|
| `ingest` | `ingest_source` MCP tool | `source_path`, `unit_paths[]`, `source_uri` |
| `synthesis` | `synthesize_note` MCP tool | `path`, `type`, `sources[]`, `derived_from[]` |
| `error` | `apply_patch` / `synthesize_note` / `ingest_source` failures; `vault-context.js` crashes | `tool`, `errors[]`, `path?`, `stack?`, `event?` |
| `mode_change` | SessionStart hook (when prior mode was non-default); `/mode` command could also log this | `from`, `to` |

## Kinds Claude can add manually

Via `mcp__semantic-vault__log_event({ kind, summary, payload? })`. Conventional kinds (not enforced — use whatever makes sense for your vault):

- `decision` — short log of a decision that also got filed as a decision note. Useful to reconcile "what did we decide this week?"
- `incident` — incident marker (entered outage, resolved, etc.).
- `review` — weekly/monthly vault review markers.
- `milestone` — external event worth tagging (released 0.2.0, etc.).

## Querying

### MCP
```ts
mcp__semantic-vault__log_query({ kind: "error", limit: 10 })
mcp__semantic-vault__log_query({ after: "2026-04-15T00:00:00Z" })
mcp__semantic-vault__log_query({ kind: "synthesis", after: lastWeek, before: today })
```

### CLI
```bash
semantic-sidekick log-query --notes <vault> --kind error --limit 10
semantic-sidekick log-query --notes <vault> --after 2026-04-15T00:00:00Z
```

Both return JSON: `[{ ts, kind, summary, payload? }, ...]`.

## SessionStart state-delta preload

Every session starts with a `<vault-state-since>` block injected by the SessionStart hook. Shape:

```xml
<vault-state-since date="2026-04-08T00:00:00Z">
Totals: ingest=4, synthesis=3, error=1, mode_change=2

Most recent 6:
- 2026-04-19T14:22:03Z · synthesis: synthesized Keycloak PKCE migration
- 2026-04-20T09:11:47Z · ingest: added 3 notes from RFC-1234
- 2026-04-20T11:03:22Z · mode_change: research → vault-first
- 2026-04-21T16:45:12Z · error: apply_patch failed: missing title
- 2026-04-22T00:00:00Z · synthesis: synthesized Phase 2 Validation Run
- 2026-04-22T00:01:00Z · mode_change: outage-silence → vault-first
</vault-state-since>
```

Claude reads this at session boot. The *totals* line gives you a glance summary; the *most recent* list surfaces anything anomalous.

Window default: 14 days. Configurable via code constant in `hooks/vault-context.js` (`handleSessionStart`).

## How future-Claude uses the log

Scenario 1 — "what did past-me do this week?"
```
log_query({ after: sevenDaysAgo })  →  cluster by kind, answer from summaries
```

Scenario 2 — "did anything error recently?"
```
log_query({ kind: "error", limit: 20 })  →  check for patterns (same tool failing, same path)
```

Scenario 3 — "did I leave a research session without synthesizing?"
```
log_query({ kind: "mode_change" })  →  look for "research → vault-first" with no adjacent "synthesis" entry
```

Scenario 4 — "how active has this vault been?"
```
log_query({ after: thirtyDaysAgo })  →  count by kind, gauge velocity
```

## Rotation / retention

None currently. `log.md` grows unbounded. Acceptable tradeoff for Phase 3 because:
- A year of active use is ~1000-10000 entries, still a modest markdown file.
- Future-Claude's 14-day preload window bounds what's surfaced, not what's stored.
- Phase 4's `outage-silence` mode could eventually wire rotation into its mode-exit handler, but no rotation policy exists today.

If you want to rotate manually:
```bash
mv <vault>/log.md <vault>/log-2026-04.md
# log_query will miss the rotated entries; keep the moved file for historical read.
```

## Logging failures never mask real errors

Every log write in the codebase is wrapped in `.catch(() => {})` — if writing to log.md fails (disk full, permissions, race), the operation's real success/failure return value is unchanged. The log is best-effort. If you see suspicious silence, check filesystem state first.

## Debug layering

When something goes wrong, check in this order:

1. **Claude Code's hook line + ctrl+o expansion** — real-time hook stderr + schema errors.
2. **`SIDEKICK_DEBUG=1 claude` stderr** — per-event decisions from the hook.
3. **`log_query({ kind: "error" })`** — persisted errors across sessions.
4. **MCP tool response bodies in the conversation** — `result.errors[]` from the last apply_patch/synthesize/ingest.
5. **`semantic-sidekick lint --notes <vault>`** — state of the vault itself.

Different layers catch different failures. The log catches *persistent* ones. The hook stderr catches *transient* ones. Neither is a substitute for the other.
