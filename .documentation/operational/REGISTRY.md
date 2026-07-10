---
title: Operational Registry
tier: reference
domains: [operational]
audience: [developers]
tags: [registry, operational]
status: active
last_updated: '2026-07-10'
version: '1.3.0'
purpose: Quick reference for operational documentation
load_priority: 5
---

# Operational Registry

> Day-to-day operation: modes, sessions, capture, contracts, drift (+`--fix`), confidence decay, logs, state migration.

## At a Glance

| Metric | Value |
|--------|-------|
| Documents | 8 |
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

## Keywords

`operational` `modes` `capture` `logs` `workflow` `sessions` `agents-md` `contract` `drift` `healthcheck` `migrate-state`
