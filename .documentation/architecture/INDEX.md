---
title: Architecture Index
tier: guide
domains: [architecture]
audience: [developers]
tags: [index, architecture]
status: active
last_updated: '2026-05-09'
version: '1.2.0'
purpose: Navigation hub for architecture domain
load_priority: 6
---

# Architecture Index

> How semantic-memory is built: the original five-layer substrate, what v1.0/1.1/1.2 added on top, MCP server internals, and the complete index/storage map.

## Documents in this domain

### Foundational

- **[Architecture — the Five Layers](./architecture-layers.md)** — The original v0.x substrate. Each of the 5 layers (substrate / structure / workflows / activation / routing) with responsibilities, key files, contracts, gotchas.
- **[Injection Points](./injection-points.md)** — Every place semantic-memory touches Claude's context — symptom→check table.
- **[Schema and Provenance](./schema-and-provenance.md)** — vault.schema.yml, 4 default types, lint rules, provenance frontmatter.

### v1.x additions

- **[v1 Stack Overview](./v1-stack-overview.md)** — The architectural narrative for what v1.0/1.1/1.2 added on top of the substrate. Read this first if you came in at v1.x.
- **[MCP Server Internals](./mcp-internals.md)** — How `src/mcp/server.ts` (now ~100 lines) composes per-domain tool modules under `src/mcp/tools/`. Read this if you're adding a new MCP tool.
- **[Indices and Storage](./indices-and-storage.md)** — Storage-perspective: every file the plugin writes to disk. Vault index, model cache, runtime state. Use for backup planning, gitignore decisions, disk-usage forensics.
- **[What Gets Indexed Where and Why](./what-gets-indexed.md)** — Content-perspective companion: for each kind of content semantic-memory sees, where it ends up and which tools surface the result.

## See also

- [`REGISTRY.md`](./REGISTRY.md) — tabular metadata view
- [Root INDEX](../INDEX.md) — navigate all domains
