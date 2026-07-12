---
title: Operational Index
tier: guide
domains: [operational]
audience: [developers]
tags: [index, operational]
status: active
last_updated: '2026-07-11'
version: '1.5.0'
purpose: Navigation hub for operational domain
load_priority: 6
---

# Operational Index

> Day-to-day operation: modes, sessions, capture, contracts, drift, logs, state migration.

## Documents in this domain

### Foundational

- **[Modes Guide](./modes-guide.md)** — vault-first / research / outage-silence entry signals, behavior, misroute recovery
- **[Capture Workflows](./capture-workflows.md)** — synthesize_note, ingest_source, Stop-hook capture, /mode transitions — golden path
- **[Logs and Events (log.md)](./logs-and-events.md)** — log.md format, auto-kinds, state-delta preload, future-Claude usage

### v1.1+ additions

- **[Sessions Guide](./sessions-guide.md)** — Verification-gated work units. When to open a session, the hard-gate semantics of `session_finish`, when to use the `verified: false` waiver path, what the Stop hook does with open sessions.
- **[AGENTS.md Contract Guide](./contract-guide.md)** — The canonical agent contract artifact. When to generate, what's in the managed block, hand-edit detection, how it relates to CLAUDE.md, what to commit to git.
- **[Drift Detection](./drift-detection.md)** — SessionStart fast-tier auto-check + manual `/healthcheck` deep audit. Per-finding remediation. What `/healthcheck --fix` (v1.2.3) auto-fixes.
- **[Confidence Decay Guide](./decay-guide.md)** — Operating v1.3 confidence decay: read decay state (`decay` block, `decay-trace`), re-verify with `verify_note`, mark `evergreen`, tune half-lives, disable.
- **[Lexicon & Bridge Guide](./lexicon-guide.md)** — Operating the human→LLM bridge (v1.4): learned aliases (manage_lexicon), propose-and-confirm capture, alias_conflicts, verbatim symptom capture, and Tier-1/Tier-2 query expansion.

### v1.2+ additions

- **[State Migration](./state-migration.md)** — `bin/semantic-memory migrate-state` for moving legacy `.claude/.sidekick-*` files under `.claude/.semantic-memory/`. Read-with-fallback semantics, conflict resolution.

### v1.5+ additions — the expert-character layer

- **[Entity Dossiers Guide](./dossiers-guide.md)** — Operating v1.5 entity dossiers: creating them (CLI + `manage_dossier`), the accretion model (Incident log append, Current state replace), two-hop retrieval, aliases feeding the lexicon, seeding from babel-fish.
- **[Usage-Feedback Ranking & Decoys Guide](./usage-feedback-guide.md)** — Operating v1.5 usage-feedback ranking: how citations become a bounded rank boost, composition with decay/path-class, reading the `usage` block, running the `decoys` lint, disabling.
- **[Session Paging & Speaker Profile Guide](./session-paging-guide.md)** — Operating v1.5 session paging (Stop digest-as-proposal, SessionStart curated digest) and the speaker profile (init, sections, correction-cue updates, injection).

## See also

- [`REGISTRY.md`](./REGISTRY.md) — tabular metadata view
- [Root INDEX](../INDEX.md) — navigate all domains
