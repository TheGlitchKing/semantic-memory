---
title: Reference Index
tier: guide
domains: [reference]
audience: [developers]
tags: [index, reference]
status: active
last_updated: '2026-07-11'
version: '1.5.0'
purpose: Navigation hub for reference domain
load_priority: 6
---

# Reference Index

> API/tool/command surfaces: MCP tools, CLI, hooks, configuration, frontmatter.

## Documents in this domain

- **[Frontmatter Spec](./frontmatter-spec.md)** — Authoritative field-by-field spec for note frontmatter. Every field, what type, what defaults, which tools surface it, how lint validates it. Includes the v1.4 `alias` type and the v1.5 `dossier`/`profile` types.
- **[CLI Reference](./cli-reference.md)** — Every `semantic-memory` (and legacy `semantic-sidekick`) subcommand + flags + env vars + exit codes. Covers v1.1's `skills` tree, v1.2's `migrate-state`, v1.3's `decay-config`/`decay-trace`, v1.3.1's `selection-stats`, v1.4's `lexicon`, and v1.5's `dossier`/`profile` subcommand groups.
- **[Configuration Reference](./configuration-reference.md)** — Every config file, env var, schema field, and tunable. Includes the v1.5 `usage_boost` schema block and `dossier-cache.json` state file.
- **[Hooks Reference](./hooks-reference.md)** — SessionStart / UserPromptSubmit / Stop hook contracts + state files.
- **[MCP Tools Reference](./mcp-tools-reference.md)** — All 44 MCP tools by category with args, use-when/skip-when guidance — see [v1-stack-overview.md](../architecture/v1-stack-overview.md) for the v1.1 additions (regenerate_contract, inspect_contract, synthesize_promote, session_start/run/finish/status), v1.3's `verify_note`, v1.4's `manage_lexicon`, and v1.5's `manage_dossier`/`manage_profile`.

## See also

- [`REGISTRY.md`](./REGISTRY.md) — tabular metadata view
- [Root INDEX](../INDEX.md) — navigate all domains
- [What Gets Indexed](../architecture/what-gets-indexed.md) — content-perspective view of frontmatter consumers
