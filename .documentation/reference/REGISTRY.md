---
title: Reference Registry
tier: reference
domains: [reference]
audience: [developers]
tags: [registry, reference]
status: active
last_updated: '2026-07-10'
version: '1.3.1'
purpose: Quick reference for reference documentation
load_priority: 5
---

# Reference Registry

> API/tool/command surfaces: MCP tools (41 as of v1.3; incl. the v1.3.1 `decay_candidates` opt-in lint check), CLI (v1.1 skills + v1.2 migrate-state + v1.2.3 healthcheck --fix + v1.3 decay-config/decay-trace + v1.3.1 selection-stats), hooks, configuration (incl. the v1.3 decay: and v1.3.1 telemetry: blocks), frontmatter.

## At a Glance

| Metric | Value |
|--------|-------|
| Documents | 5 |
| Domain | reference |

## Documents

| File | Tier | Version | Purpose |
|------|------|---------|---------|
| [`mcp-tools-reference.md`](./mcp-tools-reference.md) | reference | 1.3.0 | All 41 MCP tools by category with args, use-when/skip-when guidance. Includes v1.1+ contract + session tools, v1.1 deprecation shims, and the v1.3 `verify_note` tool. |
| [`cli-reference.md`](./cli-reference.md) | reference | 1.3.0 | Every semantic-memory subcommand + flags + env vars + exit codes. Covers v1.1 `skills` tree, v1.2 `migrate-state`, v1.2.3 `healthcheck --fix`, and v1.3 `decay-config`/`decay-trace`. |
| [`configuration-reference.md`](./configuration-reference.md) | reference | 1.3.0 | Every config file, env var, schema field, tunable. Includes the v1.3 `decay:` block, v1.2 .gitignore additions, and v1.1+ runtime state files. |
| [`hooks-reference.md`](./hooks-reference.md) | reference | 0.2.3 | SessionStart / UserPromptSubmit / Stop hook contracts + state files. *Note: legacy paths still documented; v1.x state lives at .claude/.semantic-memory/.* |
| [`frontmatter-spec.md`](./frontmatter-spec.md) | reference | 1.2.0 | Authoritative field-by-field spec for note frontmatter. Every field, type, default, lint behavior, which tools surface it. |

## Keywords

`reference` `api` `mcp` `cli` `hooks` `config` `frontmatter` `tools-catalog`
