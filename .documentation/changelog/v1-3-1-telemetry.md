---
title: v1.3.1 — selection-logging telemetry
tier: reference
domains: [changelog]
audience: [developers, admin]
tags: [v1.3.1, telemetry, selection-log, decay_candidates, observability, privacy]
status: active
last_updated: '2026-07-10'
version: '1.3.1'
purpose: What v1.3.1 added — local, opt-out selection-logging telemetry that observes retrieval and citation, a decay_candidates lint that cross-references it against decay state, and a selection-stats CLI. Precursor to v1.4 usage-feedback ranking.
load_priority: 6
---

# v1.3.1 — selection-logging telemetry

v1.3.1 (2026-07-10) closes the write-only `log_query` loop by adding **selection-logging telemetry**: a local, append-only record of what search surfaced and what got read. It **only observes retrieval — it does not change ranking**. Ranking that consumes this log is v1.4 (usage-feedback). v1.3.1 also carries a small fix: `regenerate_contract` no longer hardcodes the contract version (was frozen at `"1.1.0"`).

## The three surfaces

### 1. Selection log — `.claude/.semantic-memory/selection.jsonl`

Local, append-only JSONL. Gitignored. Never leaves the machine. Two event kinds:

```json
{"ts":"2026-07-10T12:00:00.000Z","kind":"search","tool":"search_hybrid","query":"how does decay work","results":[{"path":"decisions/decay.md","score":0.81,"decay":{"multiplier":0.9}}]}
{"ts":"2026-07-10T12:00:03.000Z","kind":"selection","note_path":"decisions/decay.md","via":"read_note","correlated":true}
```

- **`search`** — logged by `search_semantic` and `search_hybrid` only (not `search_text`/`search_graph`). Reuses the decay multiplier those tools already compute per result — no extra work.
- **`selection`** — logged by `read_note` whenever a note is read. `correlated: true` when that path appeared in a preceding search's results within a best-effort 60-second in-process window.

Logging is awaited (durable), not detached fire-and-forget — but it **never throws**, so a logging failure can never fail the underlying tool call.

**Opt out:** `telemetry.enabled: false` in `vault.schema.yml` (default `true`). See [configuration-reference.md](../reference/configuration-reference.md#telemetry-vaultschemayml).

### 2. `lint_vault({ checks: ["decay_candidates"] })` — new opt-in check

Cross-references the selection log (notes that appeared in search results) against each note's **current** decay multiplier, and flags notes retrieved frequently but decayed to ≤0.5:

```
"retrieved 7× recently but decayed to 0.42 — verify_note or revise"
```

- Index-free — no embedder call, pure log + frontmatter cross-reference.
- **No-op** when there's no selection log yet (fresh vault, or telemetry disabled).
- **Never in the default `lint_vault` report** — opt-in only, same posture as `code_symbols`.
- Findings sorted most-retrieved first.

### 3. `semantic-memory selection-stats --notes <path>` — new CLI

Prints searches count, selections count, most-cited notes, and retrieved-but-never-cited notes. `--json` for raw output. See [cli-reference.md](../reference/cli-reference.md#selection-stats-v131).

## Why it exists

`log_query` has always been able to read structured events back out of `log.md`, but nothing wrote retrieval-shaped events into it — there was no record of what search surfaced or what an agent actually opened. v1.3.1 fills that gap:

- **`decay_candidates`** turns it into an immediate lint signal: notes that keep surfacing but have decayed are a strong "go re-verify this" prompt.
- **v1.4 usage-feedback ranking** (planned) will consume this same log to fold observed selection behavior into ranking — v1.3.1 is the precursor that gets the data flowing before any ranking change lands.

## Privacy stance

- **Local only** — the log lives under the vault's `.claude/.semantic-memory/` directory on the machine running the MCP server.
- **Append-only** — no rewriting, no aggregation-in-place; `decay_candidates` and `selection-stats` read it, nothing mutates it.
- **Gitignored** — never committed, never part of vault content.
- **No network** — nothing in this surface makes an outbound call; it's a local JSONL file plus two readers (a lint check and a CLI command).
- **Config-gated** — `telemetry.enabled: false` stops all writes; existing log content is left in place (readers just see less going forward).

## Also in this release

`regenerate_contract` previously froze the emitted contract version string at `"1.1.0"` regardless of the installed package version. It now reads the running package's version, so `AGENTS.md` no longer lies about which contract generator produced it.

## Where it lives

| Thing | Location |
|---|---|
| Telemetry writer (log format, correlation window, fail-safe wrapper) | `src/core/telemetry.ts` |
| Wired into search tools | `src/mcp/tools/search.ts` (`search_semantic`, `search_hybrid`) |
| Wired into read | `src/mcp/tools/read.ts` (`read_note`) |
| `decay_candidates` lint rule | `src/core/lint.ts` |
| `selection-stats` CLI + `telemetry` config default | `src/cli/index.ts`, `src/core/schema-default.ts` |
| Tests | `test/unit/telemetry.test.ts`, `test/unit/lint-decay-candidates.test.ts` |

## Deliberately deferred

- **Usage-feedback ranking** — folding selection/correlation data into `search_semantic`/`search_hybrid` scoring itself. That's v1.4; v1.3.1 only produces the log it will consume.

## See also

- [Root CHANGELOG.md](../../CHANGELOG.md) — git-tracked release notes
- [v1-3-confidence-decay.md](./v1-3-confidence-decay.md) — the decay engine `decay_candidates` cross-references
- [configuration-reference.md](../reference/configuration-reference.md) — the `telemetry:` block
- [cli-reference.md](../reference/cli-reference.md) — `selection-stats`
- [mcp-tools-reference.md](../reference/mcp-tools-reference.md) — `lint_vault`'s `decay_candidates` check
- [`REGISTRY.md`](./REGISTRY.md) — tabular metadata view
