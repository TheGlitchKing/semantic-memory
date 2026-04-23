---
title: semantic-sidekick Documentation Index
tier: guide
domains: [all]
audience: [developers, admin]
tags: [documentation, navigation, index, hewtd]
status: active
last_updated: '2026-04-23'
version: '0.2.3'
purpose: Root navigation hub for all semantic-sidekick operator documentation
load_priority: 10
---

# semantic-sidekick Documentation

> Operator's manual for the five-layer activation / routing / capture stack on top of the semantic-pages vault MCP. Organized as a hewtd-style hierarchical domain structure — each domain has its own INDEX.md (human navigation) and REGISTRY.md (metadata/registry view).

**Plugin version:** 0.2.3 · **Tool count:** 33 MCP tools · **Test suite:** 186/186

## Quick Navigation

| Domain | Index | Registry | Docs | Purpose |
|---|---|---|---|---|
| **Quickstart** | [quickstart/INDEX.md](./quickstart/INDEX.md) | [REGISTRY](./quickstart/REGISTRY.md) | 2 | Install + overview — read first |
| **Architecture** | [architecture/INDEX.md](./architecture/INDEX.md) | [REGISTRY](./architecture/REGISTRY.md) | 3 | 5 layers, injection points, schema |
| **Reference** | [reference/INDEX.md](./reference/INDEX.md) | [REGISTRY](./reference/REGISTRY.md) | 4 | MCP tools, CLI, hooks, config |
| **Operational** | [operational/INDEX.md](./operational/INDEX.md) | [REGISTRY](./operational/REGISTRY.md) | 3 | Modes, capture workflows, logs |
| **Troubleshooting** | [troubleshooting/INDEX.md](./troubleshooting/INDEX.md) | [REGISTRY](./troubleshooting/REGISTRY.md) | 1 | Symptom / cause / fix |
| **Testing** | [testing/INDEX.md](./testing/INDEX.md) | [REGISTRY](./testing/REGISTRY.md) | 1 | Test suite + validation |
| **Deployment** | [deployment/INDEX.md](./deployment/INDEX.md) | [REGISTRY](./deployment/REGISTRY.md) | 1 | Marketplace + npm publish |
| **Changelog** | [changelog/INDEX.md](./changelog/INDEX.md) | [REGISTRY](./changelog/REGISTRY.md) | 4 | Per-phase change logs |
| **Legacy** | [legacy/INDEX.md](./legacy/INDEX.md) | [REGISTRY](./legacy/REGISTRY.md) | 5 | Substrate docs inherited from semantic-pages |

Total: **24 docs + 9 registries + 9 domain indexes** = 42 markdown files under `.documentation/`.

## Read these first

For someone new to semantic-sidekick, in order:

1. [Quickstart: Overview](./quickstart/sidekick-overview.md) — what it is, why it exists, firing timeline, design principles.
2. [Quickstart: Installation](./quickstart/installation-guide.md) — plugin install + first reindex + verification.
3. [Architecture: Five Layers](./architecture/architecture-layers.md) — the stack at a glance.
4. [Operational: Modes Guide](./operational/modes-guide.md) — how `/mode` routes behavior.

Then depending on what you're doing:
- **Wiring tools:** [Reference / MCP Tools](./reference/mcp-tools-reference.md)
- **Writing notes:** [Operational / Capture Workflows](./operational/capture-workflows.md)
- **Something broken:** [Troubleshooting](./troubleshooting/troubleshooting.md) — golden diagnostic sequence at the bottom.
- **Understanding where Claude sees vault data:** [Architecture / Injection Points](./architecture/injection-points.md).

## Tier conventions (hewtd)

| Tier | Meaning | Typical load_priority |
|---|---|---|
| `guide` | Step-by-step how-to, tutorial, walkthrough | 5–10 |
| `standard` | Conventions, rules, patterns | 5–8 |
| `example` | Worked examples of a pattern | 3–6 |
| `reference` | API / tool / command catalogs | 4–9 |
| `admin` | Operational runbook for maintainers | 5–8 |

## hewtd integration

These docs follow the [hewtd](https://github.com/TheGlitchKing/hit-em-with-the-docs) frontmatter convention. If hewtd is installed in your environment:

```bash
npx hewtd list                         # list all domains
npx hewtd load quickstart              # load quickstart domain
/docs load architecture                # slash-command equivalent
/docs search "injection points"        # search across all docs
/docs stats                            # documentation health report
```

## Project planning

Phased build plan + per-phase rationale lives in [`.planning/semantic-sidekick/`](../.planning/semantic-sidekick/) at the repo root (outside `.documentation/`). That's the design-decision journal; this is the operator's manual.
