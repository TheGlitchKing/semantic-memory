---
title: Changelog Index
tier: guide
domains: [changelog]
audience: [developers]
tags: [index, changelog]
status: active
last_updated: '2026-05-09'
version: '1.2.0'
purpose: Navigation hub for changelog domain
load_priority: 6
---

# Changelog Index

> Per-version change logs (v0.x phases through v1.2).

## v1.x — semantic-memory era

- **[v1.0 — Rebrand to semantic-memory](./v1-0-rebrand.md)** — Public-facing rename from `semantic-sidekick`. Multi-corpus framing announced. Internal wiring partly left for v1.1.1 to clean up.
- **[v1.1 — brain-absorption](./v1-1-brain-absorption.md)** — AGENTS.md contract, hard-gated verification sessions, multi-agent skill bundler, drift detection, distill/synthesize unification. Plus the v1.1.1 hotfix for the unfinished v1.0 rebrand.
- **[v1.2 — state consolidation](./v1-2-state-consolidation.md)** — Three transient state files moved from `.claude/.sidekick-*` to `.claude/.semantic-memory/`. New `migrate-state` CLI. New `legacy_state_files` healthcheck finding.

## v0.x — semantic-sidekick phased build

- **[Phase 1 — Activation Layer](./phase-1-activation.md)** — What the Phase 1 activation layer shipped: hooks, vault-first skill, CLAUDE.md rule.
- **[Phase 2 — Structure + Capture](./phase-2-structure.md)** — Schema, apply_patch, synthesize_note, lint, Stop capture, parsed-doc cache.
- **[Phase 3 — Ingest + Maintenance](./phase-3-ingest.md)** — ingest_source, structured log.md, hierarchical index auto-regen, broken-link lint.
- **[Phase 4 — Routing + Transitions](./phase-4-routing.md)** — research-mode + outage-silence skills, /mode, /vault, mode-aware hooks, transition capture.

## See also

- [Root CHANGELOG.md](../../CHANGELOG.md) — git-tracked release notes per npm version
- [ROADMAP.md](../../ROADMAP.md) — committed near-term direction (v1.2 hygiene, v1.3 confidence-decay, v2.0 close-the-window)
- [v1-stack-overview.md](../architecture/v1-stack-overview.md) — architectural narrative for the v1.x changes
- [`REGISTRY.md`](./REGISTRY.md) — tabular metadata view
- [Root INDEX](../INDEX.md) — navigate all domains
