---
title: Architecture Registry
tier: reference
domains: [architecture]
audience: [developers]
tags: [registry, architecture]
status: active
last_updated: '2026-05-09'
version: '1.2.0'
purpose: Quick reference for architecture documentation
load_priority: 5
---

# Architecture Registry

> How semantic-memory is built: the v0.x five-layer substrate, what v1.x added on top, MCP internals, indices, and what gets indexed where.

## At a Glance

| Metric | Value |
|--------|-------|
| Documents | 7 |
| Domain | architecture |

## Documents

| File | Tier | Version | Purpose |
|------|------|---------|---------|
| [`architecture-layers.md`](./architecture-layers.md) | reference | 0.2.3 | Each of the 5 layers with responsibilities, key files, contracts, gotchas |
| [`injection-points.md`](./injection-points.md) | reference | 0.2.3 | Every place semantic-memory touches Claude's context — symptom→check table |
| [`schema-and-provenance.md`](./schema-and-provenance.md) | reference | 0.2.3 | vault.schema.yml, 4 types, lint rules, provenance frontmatter |
| [`v1-stack-overview.md`](./v1-stack-overview.md) | reference | 1.2.0 | What v1.0/1.1/1.2 added on top of the v0.x substrate. Architectural narrative. |
| [`mcp-internals.md`](./mcp-internals.md) | reference | 1.2.0 | server.ts composition + per-domain tool modules. Required reading for adding a new MCP tool. |
| [`indices-and-storage.md`](./indices-and-storage.md) | reference | 1.2.0 | Every file the plugin writes to disk: per-vault index, model cache, runtime state. |
| [`what-gets-indexed.md`](./what-gets-indexed.md) | reference | 1.2.0 | Content-perspective: for each kind of content, where it ends up and which tools query it. |

## Keywords

`architecture` `layers` `design` `injection` `schema` `provenance` `mcp` `indices` `storage` `v1.x`
