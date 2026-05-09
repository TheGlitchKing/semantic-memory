---
title: Reference Registry
tier: reference
domains: [reference]
audience: [developers]
tags: [registry, reference]
status: active
last_updated: '2026-05-09'
version: '1.2.0'
purpose: Quick reference for reference documentation
load_priority: 5
---

# Reference Registry

> API/tool/command surfaces: MCP tools (40 in v1.2), CLI (with v1.1 skills + v1.2 migrate-state), hooks, configuration, frontmatter.

## At a Glance

| Metric | Value |
|--------|-------|
| Documents | 5 |
| Domain | reference |

## Documents

| File | Tier | Version | Purpose |
|------|------|---------|---------|
| [`mcp-tools-reference.md`](./mcp-tools-reference.md) | reference | 1.2.0 | All 40 MCP tools by category with args, use-when/skip-when guidance. Includes v1.1+ contract + session tools and v1.1 deprecation shims. |
| [`cli-reference.md`](./cli-reference.md) | reference | 1.2.0 | Every semantic-memory subcommand + flags + env vars + exit codes. Covers v1.1 `skills` tree and v1.2 `migrate-state`. |
| [`configuration-reference.md`](./configuration-reference.md) | reference | 1.2.0 | Every config file, env var, schema field, tunable. Includes v1.2 .gitignore additions and v1.1+ runtime state files. |
| [`hooks-reference.md`](./hooks-reference.md) | reference | 0.2.3 | SessionStart / UserPromptSubmit / Stop hook contracts + state files. *Note: legacy paths still documented; v1.x state lives at .claude/.semantic-memory/.* |
| [`frontmatter-spec.md`](./frontmatter-spec.md) | reference | 1.2.0 | Authoritative field-by-field spec for note frontmatter. Every field, type, default, lint behavior, which tools surface it. |

## Keywords

`reference` `api` `mcp` `cli` `hooks` `config` `frontmatter` `tools-catalog`
