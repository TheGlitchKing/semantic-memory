---
title: Changelog Registry
tier: reference
domains: [changelog]
audience: [developers]
tags: [registry, changelog]
status: active
last_updated: '2026-07-11'
version: '1.5.0'
purpose: Quick reference for changelog documentation
load_priority: 5
---

# Changelog Registry

> Per-version change logs covering v0.x phased build through v1.5.0.

## At a Glance

| Metric | Value |
|--------|-------|
| Documents | 12 |
| Domain | changelog |

## Documents

### v1.x — semantic-memory era

| File | Tier | Version | Purpose |
|------|------|---------|---------|
| [`v1-0-rebrand.md`](./v1-0-rebrand.md) | reference | 1.0.0 | Public-facing rename to semantic-memory + multi-corpus framing. Storage paths preserved. Internal wiring partly left for v1.1.1. |
| [`v1-1-brain-absorption.md`](./v1-1-brain-absorption.md) | reference | 1.1.1 | AGENTS.md, sessions, skill bundler, drift detection. Tool surface 33 → 40. v1.1.1 hotfix that completed the rebrand wiring. |
| [`v1-2-state-consolidation.md`](./v1-2-state-consolidation.md) | reference | 1.2.0 | Three transient state files moved from .sidekick-* to .semantic-memory/. New migrate-state CLI. |
| [`v1-2-3-hygiene-completion.md`](./v1-2-3-hygiene-completion.md) | reference | 1.3.0 | v1.2.3: /healthcheck --fix auto-remediation, code_symbols lint, fresh-install CI smoke. |
| [`v1-3-confidence-decay.md`](./v1-3-confidence-decay.md) | reference | 1.3.0 | v1.3.0: age-aware confidence-decay ranking, verify_note, evergreen, decay block, decay-config/decay-trace CLI. |
| [`v1-3-1-telemetry.md`](./v1-3-1-telemetry.md) | reference | 1.3.1 | v1.3.1: local selection-logging telemetry (selection.jsonl), decay_candidates lint, selection-stats CLI, contract version-freeze fix. |
| [`v1-4-0-resident-bridge.md`](./v1-4-0-resident-bridge.md) | reference | 1.4.0 | v1.4.0: resident-expert bridge — lexicon/manage_lexicon, alias capture, symptom-keyed indexing, query expansion, path-class, injection hygiene, section reads, conditional tools, eval harness. |
| [`v1-5-0-expert-character.md`](./v1-5-0-expert-character.md) | reference | 1.5.0 | v1.5.0: expert-character layer — entity dossiers/manage_dossier + two-hop retrieval, usage-feedback ranking/usage_boost + decoys lint, session paging (Stop digest-as-proposal + SessionStart curated digest), speaker profile/manage_profile. Tool surface 42→44. |

### v0.x — semantic-sidekick phased build

| File | Tier | Version | Purpose |
|------|------|---------|---------|
| [`phase-1-activation.md`](./phase-1-activation.md) | reference | 0.2.x | Phase 1 activation: hooks, vault-first skill, CLAUDE.md rule |
| [`phase-2-structure.md`](./phase-2-structure.md) | reference | 0.2.x | Phase 2: schema, apply_patch, synthesize_note, lint, Stop capture, parsed-doc cache |
| [`phase-3-ingest.md`](./phase-3-ingest.md) | reference | 0.2.x | Phase 3: ingest_source, structured log.md, hierarchical index auto-regen, broken-link lint |
| [`phase-4-routing.md`](./phase-4-routing.md) | reference | 0.2.x | Phase 4: research/outage-silence skills, /mode, /vault, mode-aware hooks, transition capture |

## Keywords

`changelog` `phases` `history` `release-notes` `v1.x` `rebrand` `brain-absorption` `state-consolidation` `expert-character` `dossier` `usage-feedback`
