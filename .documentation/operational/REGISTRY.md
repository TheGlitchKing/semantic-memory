---
title: Operational Registry
tier: reference
domains: [operational]
audience: [developers]
tags: [registry, operational]
status: active
last_updated: '2026-07-11'
version: '1.5.0'
purpose: Quick reference for operational documentation
load_priority: 5
---

# Operational Registry

> Day-to-day operation: modes, sessions, capture, contracts, drift (+`--fix`), confidence decay, lexicon/bridge, logs, state migration, dossiers, usage-feedback ranking, session paging + speaker profile.

## At a Glance

| Metric | Value |
|--------|-------|
| Documents | 12 |
| Domain | operational |

## Documents

| File | Tier | Version | Purpose |
|------|------|---------|---------|
| [`modes-guide.md`](./modes-guide.md) | guide | 0.2.3 | vault-first / research / outage-silence entry signals, behavior, misroute recovery |
| [`capture-workflows.md`](./capture-workflows.md) | guide | 0.2.3 | synthesize_note, ingest_source, Stop-hook capture, /mode transitions — golden path |
| [`logs-and-events.md`](./logs-and-events.md) | reference | 0.2.3 | log.md format, auto-kinds, state-delta preload, future-Claude usage |
| [`sessions-guide.md`](./sessions-guide.md) | guide | 1.2.0 | v1.1+ verification-gated sessions. Hard-gate semantics, waiver path, Stop hook integration. |
| [`contract-guide.md`](./contract-guide.md) | guide | 1.2.0 | v1.1+ AGENTS.md contract artifact. Managed-block markers, hand-edit detection, CLAUDE.md relationship. |
| [`drift-detection.md`](./drift-detection.md) | guide | 1.3.0 | v1.1+ SessionStart auto-check + manual /healthcheck. Per-finding remediation. v1.2.3 `--fix` auto-remediation. |
| [`state-migration.md`](./state-migration.md) | guide | 1.2.0 | v1.2+ migrate-state CLI for moving legacy .sidekick-* files under .semantic-memory/. |
| [`decay-guide.md`](./decay-guide.md) | guide | 1.3.0 | v1.3+ operating confidence decay: decay block, verify_note, evergreen, decay-config/decay-trace, tuning, disabling. |
| [`lexicon-guide.md`](./lexicon-guide.md) | guide | 1.4.0 | v1.4+ human→LLM bridge: lexicon/manage_lexicon, alias capture, alias_conflicts, symptom capture, query expansion. |
| [`dossiers-guide.md`](./dossiers-guide.md) | guide | 1.5.0 | v1.5+ entity dossiers: manage_dossier, accretion model, two-hop retrieval, alias fold-in to lexicon, babel-fish seeding. |
| [`usage-feedback-guide.md`](./usage-feedback-guide.md) | guide | 1.5.0 | v1.5+ usage-feedback ranking: usage_boost, composition with decay/path-class, usage block, decoys lint, disabling. |
| [`session-paging-guide.md`](./session-paging-guide.md) | guide | 1.5.0 | v1.5+ session paging + speaker profile: Stop digest-as-proposal, SessionStart curated digest, manage_profile, correction-cue capture. |

## Keywords

`operational` `modes` `capture` `logs` `workflow` `sessions` `agents-md` `contract` `drift` `healthcheck` `migrate-state` `dossier` `usage-feedback` `session-paging` `speaker-profile`
