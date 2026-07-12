---
title: Reference Registry
tier: reference
domains: [reference]
audience: [developers]
tags: [registry, reference]
status: active
last_updated: '2026-07-11'
version: '1.5.0'
purpose: Quick reference for reference documentation
load_priority: 5
---

# Reference Registry

> API/tool/command surfaces: MCP tools (44 as of v1.5; incl. the v1.5 `decoys` opt-in lint check and `usage` result block), CLI (v1.1 skills + v1.2 migrate-state + v1.2.3 healthcheck --fix + v1.3 decay-config/decay-trace + v1.3.1 selection-stats + v1.4 lexicon + v1.5 dossier/profile), hooks, configuration (incl. the v1.3 decay:, v1.3.1 telemetry:, v1.4 path_class:/tools:, and v1.5 usage_boost: blocks), frontmatter (incl. v1.4 symptoms + alias type, v1.5 entity/aliases + dossier/profile types).

## At a Glance

| Metric | Value |
|--------|-------|
| Documents | 5 |
| Domain | reference |

## Documents

| File | Tier | Version | Purpose |
|------|------|---------|---------|
| [`mcp-tools-reference.md`](./mcp-tools-reference.md) | reference | 1.5.0 | All 44 MCP tools by category with args, use-when/skip-when guidance. Includes v1.1+ contract + session tools, v1.1 deprecation shims, v1.3's `verify_note`, v1.4's `manage_lexicon`, and v1.5's `manage_dossier`/`manage_profile`. |
| [`cli-reference.md`](./cli-reference.md) | reference | 1.5.0 | Every semantic-memory subcommand + flags + env vars + exit codes. Covers v1.1 `skills` tree, v1.2 `migrate-state`, v1.2.3 `healthcheck --fix`, v1.3 `decay-config`/`decay-trace`, v1.3.1 `selection-stats`, v1.4 `lexicon`, and v1.5 `dossier`/`profile`. |
| [`configuration-reference.md`](./configuration-reference.md) | reference | 1.5.0 | Every config file, env var, schema field, tunable. Includes the v1.3 `decay:` block, v1.3.1 `telemetry:` block, v1.4 `path_class:`/`tools:` blocks, v1.5 `usage_boost:` block, and v1.2 .gitignore additions. |
| [`hooks-reference.md`](./hooks-reference.md) | reference | 0.2.3 | SessionStart / UserPromptSubmit / Stop hook contracts + state files. *Note: legacy paths still documented; v1.x state lives at .claude/.semantic-memory/.* |
| [`frontmatter-spec.md`](./frontmatter-spec.md) | reference | 1.5.0 | Authoritative field-by-field spec for note frontmatter. Every field, type, default, lint behavior, which tools surface it. Includes v1.4's `alias` type and v1.5's `dossier`/`profile` types. |

## Keywords

`reference` `api` `mcp` `cli` `hooks` `config` `frontmatter` `tools-catalog` `dossier` `usage-feedback` `speaker-profile`
