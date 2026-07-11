---
title: semantic-memory Documentation Index
tier: guide
domains: [all]
audience: [developers, admin]
tags: [documentation, navigation, index, hewtd]
status: active
last_updated: '2026-07-10'
version: '1.3.1'
purpose: Root navigation hub for all semantic-memory operator documentation
load_priority: 10
---

# semantic-memory Documentation

> Operator's manual for `@theglitchking/semantic-memory` — the unified memory-layer plugin for Claude Code. Organized as a hewtd-style hierarchical domain structure: each domain has its own `INDEX.md` (human navigation) and `REGISTRY.md` (metadata/registry view).

**Plugin version:** 1.3.1 · **Tool count:** 41 MCP tools (write mode), 21 (read-only) · **Test suite:** 328/328

## What's covered

This documentation set covers everything from the original five-layer activation/routing/capture stack (v0.x → v1.0 substrate) through the v1.1 brain-absorption (AGENTS.md contract, hard-gated sessions, multi-agent skill bundler, drift detection), v1.2 state consolidation under `.claude/.semantic-memory/`, the v1.2.3 hygiene completion (`/healthcheck --fix`, `code_symbols` lint, fresh-install CI smoke), v1.3 confidence decay (age-aware ranking, `verify_note`, `evergreen`), and v1.3.1 selection-logging telemetry (`selection.jsonl`, `decay_candidates` lint, `selection-stats`).

If you're upgrading from v0.x or v1.0, start with the [v1.0 rebrand changelog](./changelog/v1-0-rebrand.md) and the [v1.1 brain-absorption changelog](./changelog/v1-1-brain-absorption.md).

## Quick Navigation

| Domain | Index | Purpose |
|---|---|---|
| **Quickstart** | [quickstart/INDEX.md](./quickstart/INDEX.md) | Install + overview — read first |
| **Architecture** | [architecture/INDEX.md](./architecture/INDEX.md) | Five layers, injection points, MCP internals, sessions, contract, indices |
| **Reference** | [reference/INDEX.md](./reference/INDEX.md) | All 41 MCP tools, CLI, hooks, frontmatter spec, config |
| **Operational** | [operational/INDEX.md](./operational/INDEX.md) | Modes, sessions, capture workflows, drift detection, logs, migrate-state |
| **Troubleshooting** | [troubleshooting/INDEX.md](./troubleshooting/INDEX.md) | Symptom / cause / fix matrix |
| **Testing** | [testing/INDEX.md](./testing/INDEX.md) | Test suite + validation |
| **Deployment** | [deployment/INDEX.md](./deployment/INDEX.md) | Marketplace + npm publish + offline tarball |
| **Changelog** | [changelog/INDEX.md](./changelog/INDEX.md) | Per-version release notes (v0.x phases + v1.0/1.1/1.2) |
| **Legacy** | [legacy/INDEX.md](./legacy/INDEX.md) | Substrate docs inherited from semantic-pages |

## Read these first

For someone new to semantic-memory, in order:

1. [Quickstart: Overview](./quickstart/sidekick-overview.md) — what it is, why it exists, design principles.
2. [Quickstart: Installation](./quickstart/installation-guide.md) — plugin install + first reindex + verification.
3. [Architecture: Five Layers](./architecture/architecture-layers.md) — the stack at a glance.
4. [Architecture: v1 Stack Overview](./architecture/v1-stack-overview.md) — what v1.0/1.1/1.2 added on top.
5. [Operational: Modes Guide](./operational/modes-guide.md) — how `/mode` routes behavior.
6. [Operational: Sessions Guide](./operational/sessions-guide.md) — verification-gated work units (v1.1+).

Then depending on what you're doing:

- **Wiring tools or writing prompts that call the MCP API:** [Reference / MCP Tools](./reference/mcp-tools-reference.md)
- **Writing notes:** [Operational / Capture Workflows](./operational/capture-workflows.md), [Reference / Frontmatter Spec](./reference/frontmatter-spec.md)
- **Running multi-step work with verification:** [Operational / Sessions Guide](./operational/sessions-guide.md)
- **Setting up project contract:** [Operational / Contract Guide](./operational/contract-guide.md)
- **Drift / install health:** [Operational / Drift Detection](./operational/drift-detection.md)
- **Upgrade-from-legacy state files:** [Operational / State Migration](./operational/state-migration.md)
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

Phased build plans + per-phase rationale live under [`.planning/`](../.planning/) at the repo root (gitignored runtime planning artifacts; durable summary lives in [`/ROADMAP.md`](../ROADMAP.md)). That's the design-decision journal; this is the operator's manual.
