---
title: Changelog Registry
tier: reference
domains: [changelog]
audience: [developers]
tags: [registry, changelog]
status: active
last_updated: '2026-05-09'
version: '1.2.0'
purpose: Quick reference for changelog documentation
load_priority: 5
---

# Changelog Registry

> Per-version change logs covering v0.x phased build through v1.2.

## At a Glance

| Metric | Value |
|--------|-------|
| Documents | 7 |
| Domain | changelog |

## Documents

### v1.x — semantic-memory era

| File | Tier | Version | Purpose |
|------|------|---------|---------|
| [`v1-0-rebrand.md`](./v1-0-rebrand.md) | reference | 1.0.0 | Public-facing rename to semantic-memory + multi-corpus framing. Storage paths preserved. Internal wiring partly left for v1.1.1. |
| [`v1-1-brain-absorption.md`](./v1-1-brain-absorption.md) | reference | 1.1.1 | AGENTS.md, sessions, skill bundler, drift detection. Tool surface 33 → 40. v1.1.1 hotfix that completed the rebrand wiring. |
| [`v1-2-state-consolidation.md`](./v1-2-state-consolidation.md) | reference | 1.2.0 | Three transient state files moved from .sidekick-* to .semantic-memory/. New migrate-state CLI. |

### v0.x — semantic-sidekick phased build

| File | Tier | Version | Purpose |
|------|------|---------|---------|
| [`phase-1-activation.md`](./phase-1-activation.md) | reference | 0.2.x | Phase 1 activation: hooks, vault-first skill, CLAUDE.md rule |
| [`phase-2-structure.md`](./phase-2-structure.md) | reference | 0.2.x | Phase 2: schema, apply_patch, synthesize_note, lint, Stop capture, parsed-doc cache |
| [`phase-3-ingest.md`](./phase-3-ingest.md) | reference | 0.2.x | Phase 3: ingest_source, structured log.md, hierarchical index auto-regen, broken-link lint |
| [`phase-4-routing.md`](./phase-4-routing.md) | reference | 0.2.x | Phase 4: research/outage-silence skills, /mode, /vault, mode-aware hooks, transition capture |

## Keywords

`changelog` `phases` `history` `release-notes` `v1.x` `rebrand` `brain-absorption` `state-consolidation`
