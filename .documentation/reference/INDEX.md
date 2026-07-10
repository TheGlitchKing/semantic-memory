---
title: Reference Index
tier: guide
domains: [reference]
audience: [developers]
tags: [index, reference]
status: active
last_updated: '2026-05-09'
version: '1.2.0'
purpose: Navigation hub for reference domain
load_priority: 6
---

# Reference Index

> API/tool/command surfaces: MCP tools, CLI, hooks, configuration, frontmatter.

## Documents in this domain

- **[Frontmatter Spec](./frontmatter-spec.md)** — Authoritative field-by-field spec for note frontmatter. Every field, what type, what defaults, which tools surface it, how lint validates it. (NEW in v1.2 docs.)
- **[CLI Reference](./cli-reference.md)** — Every `semantic-memory` (and legacy `semantic-sidekick`) subcommand + flags + env vars + exit codes. *Note: needs updating for v1.2's `migrate-state` and v1.1's `skills` subcommand tree.*
- **[Configuration Reference](./configuration-reference.md)** — Every config file, env var, schema field, and tunable.
- **[Hooks Reference](./hooks-reference.md)** — SessionStart / UserPromptSubmit / Stop hook contracts + state files.
- **[MCP Tools Reference](./mcp-tools-reference.md)** — All MCP tools by category with args, use-when/skip-when guidance. *v1.x ships 41 tools (write mode), 21 (read-only) — see [v1-stack-overview.md](../architecture/v1-stack-overview.md) for the v1.1 additions (regenerate_contract, inspect_contract, synthesize_promote, session_start/run/finish/status) and v1.3's verify_note.*

## See also

- [`REGISTRY.md`](./REGISTRY.md) — tabular metadata view
- [Root INDEX](../INDEX.md) — navigate all domains
- [What Gets Indexed](../architecture/what-gets-indexed.md) — content-perspective view of frontmatter consumers
