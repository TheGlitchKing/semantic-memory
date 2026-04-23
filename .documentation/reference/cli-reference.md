---
title: CLI Reference
tier: reference
domains: [reference]
audience: [developers]
tags: [cli, commands, flags, reference]
status: active
last_updated: '2026-04-23'
version: '0.2.3'
purpose: Every semantic-sidekick subcommand + flags + env vars + exit codes
load_priority: 9
---

# CLI reference — `semantic-sidekick <subcommand>`

Binary: `node node_modules/@theglitchking/semantic-sidekick/bin/semantic-sidekick` (or `semantic-sidekick` if globally linked). Hooks shell out to this exact binary.

## Subcommand overview

| Command | Category | Purpose |
|---|---|---|
| `serve` (default) | MCP | Start MCP stdio server |
| `search <query>` | Hook backing | Hybrid/text-only search, JSON output |
| `lint` | Maintenance | Run all lints; exit code = errors count |
| `log-event` | Hook backing | Append structured event to log.md |
| `log-query` | Hook backing | Read entries by kind/date/limit |
| `install-schema` | Setup | Write default vault.schema.yml |
| `tools [name]` | Info | List or describe MCP tools |
| `normalize-config` | Maintenance | Rewrite fragile .mcp.json npx forms |
| `healthcheck` | Maintenance | Verify local install starts cleanly |
| `update` / `policy` | Plugin runtime | Inherited from `@theglitchking/claude-plugin-runtime` |

All subcommands accept `--help`.

---

## `serve` — start MCP server (default)

```bash
semantic-sidekick --notes <path> [--reindex] [--stats] [--wait-for-ready] [--read-only]
                                 [--model <name>] [--workers <n>] [--batch-size <n>]
                                 [--no-quantized] [--no-watch]
```

- `--reindex` — force full reindex and exit.
- `--stats` — print note/chunk/wikilink/tag counts and exit.
- `--wait-for-ready` — block until index fully built (default: lazy; search tools return "Indexing in progress" until ready).
- `--read-only` — suppress the 4 write tools + the 3 Phase 3 write tools (apply_patch, synthesize_note, ingest_source, regenerate_index, install_schema, update_frontmatter, manage_tags, rename_tag). Use for shared docs vaults.

**Default mode:** starts stdio MCP server, reads stdin, writes MCP JSON-RPC to stdout. Claude Code attaches via `.mcp.json`.

---

## `search <query>`

Underpins the UserPromptSubmit + SessionStart hook injection.

```bash
semantic-sidekick search "<query>" --notes <path> [--limit N] [--text-only] [--json]
```

- `--limit <n>` — max results (default 8).
- `--text-only` — skip ONNX embedder, use TextSearch only. **Faster cold start** but much noisier for natural-language queries. Currently unused in production hooks (after Phase 1 measured 4/8 positives vs 7/8 for hybrid).
- `--json` — default is also JSON, this is a no-op flag for self-documentation.

**Output:** JSON array of `{ path, title, score, snippet, mtime }`.
**Uses parsed-doc cache** at `.semantic-sidekick-index/docs.cache.json` for ~0.7s latency on cache hit.

---

## `lint`

Runs schema/provenance/stale/broken-links across the vault.

```bash
semantic-sidekick lint --notes <path> [--rule <name>] [--json] [--strict]
```

- `--rule <name>` — limit output to one of `schema_violations`, `missing_provenance`, `stale`, `broken_links`.
- `--json` — emit JSON (full `LintReport` or just `byRule[<rule>]`).
- `--strict` — exit non-zero on warnings too (default: exit non-zero only on errors).

**Exit code:**
- 0 — clean (or errors/warnings below threshold).
- 1 — errors > 0, or (with `--strict`) warnings > 0.

**Intended use:** pre-commit hook. `scripts/pre-commit-lint.sh` is the drop-in template.

---

## `log-event`

Append a structured event to `log.md`. Same shape as MCP `log_event`.

```bash
semantic-sidekick log-event --notes <path> --kind <name> --summary <text> [--payload <json>]
```

- `--kind` — required. Common: `ingest`, `synthesis`, `error`, `mode_change`, `decision`.
- `--summary` — required, one-line.
- `--payload` — optional JSON string. Parsed and attached as the payload field.

**Output:** the parsed entry as JSON (one line).
**Used by:** Phase 4.5 hook auto-logging (mode transitions, crashes).

---

## `log-query`

Read + filter log entries.

```bash
semantic-sidekick log-query --notes <path> [--kind <name>] [--after <iso>] [--before <iso>] [--limit <n>]
```

**Output:** JSON array of `{ ts, kind, summary, payload? }`.
**Used by:** SessionStart state-delta preload (queries last 14 days).

---

## `install-schema`

```bash
semantic-sidekick install-schema --notes <path> [--force]
```

Writes `vault.schema.yml` with the default 4-type schema if not present. `--force` overwrites.

---

## `tools [name]`

```bash
semantic-sidekick tools          # list all 33 MCP tools by category
semantic-sidekick tools <name>   # show args + examples for one tool
```

Info-only. Does not require a vault path.

---

## `normalize-config`

```bash
semantic-sidekick normalize-config [--dry-run]
```

Rewrites `.mcp.json` entries from the fragile `npx --latest` form to stable `node ./node_modules/...` form. Backs up to `.mcp.json.bak` and verifies the binary starts before committing the rewrite. `--dry-run` prints proposed changes without writing.

---

## `healthcheck`

```bash
semantic-sidekick healthcheck
```

Verifies the local install boots cleanly (`node <bin> --version`). Self-heals classic `ERR_MODULE_NOT_FOUND` from corrupted npx caches by clearing and retrying.

---

## Plugin runtime commands

`update`, `policy`, and related commands come from `@theglitchking/claude-plugin-runtime`. See that package's README for the auto-update policy contract. TL;DR: `policy auto` enables silent upgrades; `policy nudge` (default) asks on SessionStart.

---

## Environment variables

| Variable | Effect |
|---|---|
| `SIDEKICK_DEBUG=1` | Hook logs decisions to stderr (visible under `ctrl+o` in Claude Code) |
| `SIDEKICK_VAULT_PATH=<path>` | Overrides vault discovery for hooks (used by test runners) |
| `CLAUDE_STOP_HOOK_ACTIVE=1` | Set by Claude Code when re-entering after a Stop-hook block. Hook respects this as a loop-guard |
| `CLAUDE_PROJECT_DIR` | Set by Claude Code to the project root. Hooks default to this over `process.cwd()` |
| `CLAUDE_PLUGIN_ROOT` | Set by Claude Code to the plugin install dir. Used in `hooks.json` command resolution |
