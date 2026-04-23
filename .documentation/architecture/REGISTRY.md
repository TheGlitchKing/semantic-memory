---
title: Architecture Registry
tier: reference
domains: [architecture]
audience: [developers]
tags: [registry, architecture]
status: active
last_updated: '2026-04-23'
version: '0.2.3'
purpose: Quick reference for architecture documentation
load_priority: 5
---

# Architecture Registry

> How semantic-sidekick is built: the 5 layers, injection points, schema.

## At a Glance

| Metric | Value |
|--------|-------|
| Documents | 3 |
| Domain | architecture |

## Documents

| File | Tier | Purpose |
|------|------|---------|
| [`architecture-layers.md`](./architecture-layers.md) | reference | Each of the 5 layers with responsibilities, key files, contracts, gotchas |
| [`injection-points.md`](./injection-points.md) | reference | Every place semantic-sidekick touches Claude's context — symptom→check table |
| [`schema-and-provenance.md`](./schema-and-provenance.md) | reference | vault.schema.yml, 4 types, lint rules, provenance frontmatter |


## Keywords

`architecture` `layers` `design` `injection` `schema` `provenance`
