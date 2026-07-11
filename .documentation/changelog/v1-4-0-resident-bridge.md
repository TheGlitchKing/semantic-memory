---
title: v1.4.0 — resident-expert bridge (lexicon, symptom capture, query expansion)
tier: reference
domains: [changelog]
audience: [developers, admin]
tags: [v1.4.0, lexicon, alias, symptoms, path-class, query-expansion, manage_lexicon, injection-hygiene, eval-harness]
status: active
last_updated: '2026-07-10'
version: '1.4.0'
purpose: What v1.4.0 added — a golden eval harness, archive path-class down-weighting, injection hygiene for the vault-context block, a learned human-to-artifact lexicon with propose-and-confirm capture, verbatim symptom capture, two-tier query expansion, and a token-frugal tool surface. Tool count 41→42 (manage_lexicon).
load_priority: 7
---

# v1.4.0 — resident-expert bridge

v1.4.0 (2026-07-10) ships across seven phases, all shipped and tested. The throughline: the plugin should learn how *this* human talks about *this* system, map that phrasing onto concrete artifacts, and pay down its own token overhead doing it. Tool surface grows 41→42 with `manage_lexicon`.

## The problem this solves

Retrieval quality was already good (v1.1–v1.3 got hybrid search, decay, and telemetry in place), but two gaps remained:

- **The human↔LLM vocabulary gap.** People say "the flaky thing" or "that indexer bug" — not the canonical note title. Terse, indexical utterances ("still broken?", "same as before") don't embed well and miss the note that would answer them. v1.3.1 telemetry could *observe* this miss; v1.4.0 is the first arc that *closes* it.
- **Token overhead.** Every session pays a fixed injection tax (`<vault-context>` block) and carries a growing tool surface, whether or not the turn actually needs it. Left unchecked this scales badly as the vault and tool count grow.

v1.4.0 addresses both without touching ranking math from v1.3 (decay) or v1.3.1 (telemetry) — it composes with them.

## What's new

### 1. Golden eval harness

`test/retrieval-eval/`, run via `npm run eval`. Computes recall@k and MRR per case-class against the real search stack (not a mock), so ranking changes have a regression gate instead of vibes. Baseline captured at ship time: **recall@1 = 86%, MRR = 0.929**. Future ranking work (path-class, decay tuning, v1.5 usage-feedback) should not regress these without a documented reason.

### 2. Path-class ranking

Notes under `archive/**` are down-weighted 0.3× at search time. Configurable via a `path_class` block in `vault.schema.yml` — not hardcoded to the `archive/` glob, other path classes can be added. Composes multiplicatively with the existing v1.3 decay multiplier and the `load_priority` boost; none of the three signals replace each other.

### 3. Injection hygiene

The `<vault-context>` block (injected by the `UserPromptSubmit`/`SessionStart` hooks) got three tightenings so it stops being a token sink on weak or noisy prompts:

- **Score-gating** — a candidate below `SEMANTIC_MEMORY_INJECT_MIN_SCORE` (default `0.35`) is dropped rather than injected just because it was the top hit.
- **Archive-twin dedup** — when an archived note and its live counterpart share a basename, only one is injected.
- **Hard cap + compact instructions** — top-3 results max, with a compact ~45-word instruction preamble (down from a longer one).

### 4. Lexicon — learned human→artifact aliases

A new `alias` note type lives under `<vault>/lexicon/`. Each entry has `canonical`, `phrases[]`, `confidence`, `evidence_count`, and `source` (`learned` or `authored`). Repeat adds for the same phrase bump `evidence_count` and `confidence` rather than duplicating.

A derived, fast-lookup cache is compiled to `.claude/.semantic-memory/lexicon-cache.json`.

Surface:
- MCP tool `manage_lexicon` — actions `add | lookup | list | remove | compile`.
- CLI `semantic-memory lexicon list | compile | add`.

### 5. Alias capture — propose-and-confirm

The `vault-first` skill can *offer* a `manage_lexicon add` when it resolves a user's vague phrasing to a concrete artifact mid-conversation — it never auto-adds. This mirrors the existing capture-cue pattern (offer, don't force) used elsewhere in the plugin.

A new lint check, `lint_vault({ checks: ["alias_conflicts"] })`, flags any phrase that maps to more than one canonical, so conflicting learned aliases surface instead of silently shadowing each other.

### 6. Verbatim symptom capture

`synthesize_note` gained a `symptoms` param, written to `symptoms:` frontmatter. At index time, each symptom phrase is added as its own chunk pointing back at the note. This fixes an asymmetric-retrieval failure mode: a terse symptom query ("connection refused on port 9200") can now match even when the note's prose never uses those exact words, because the literal phrase itself is indexed, not just the surrounding narrative.

### 7. Query expansion (two tier)

- **Tier 1 — hook, deterministic.** `expandQueryViaLexicon` appends matching lexicon canonicals to the user's utterance before it's embedded for search. Cheap, no LLM round-trip, runs on every query.
- **Tier 2 — LLM-side.** A `vault-first` skill instruction: when an utterance is terse/indexical (e.g. relies on conversational context to mean anything), rewrite it using that context and re-search once before giving up.

### 8. Token-frugal tool surface

- `read_note` gained a `section` param — return just one heading's section instead of the whole note body.
- Conditional tool registration: a new `tools.conditional` block in `vault.schema.yml`, **default off**. When enabled, `outage-silence` mode registers only the core search/read surface, trimming the tool list the model has to reason over during an incident.

## Deliberately deferred (documented, not dropped)

- **Index-time near-dup collapse** — archive-twin dedup (item 3) is a search-time band-aid; collapsing near-duplicates at index time is the real fix and needs a similarity-clustering pass.
- **Rolling-topic expansion (`topic.json`)** — a session-level rolling topic model to inform Tier 2 expansion beyond single-turn context.
- **Compact-search-as-default** — making the trimmed, cap-3 result shape (item 3) the default return shape for `search_hybrid`/`search_semantic` themselves, not just the injected context block.

These, plus **usage-feedback ranking** (consuming the v1.3.1 selection log), **session paging**, and a **speaker profile**, are staged for **v1.5.0**.

## Where it lives

| Thing | Location |
|---|---|
| Path-class scoring | `src/core/path-class.ts` |
| Lexicon engine (load, match, compile, confidence/evidence bump) | `src/core/lexicon.ts` |
| `read_note` section extraction | `src/core/section.ts` |
| Conditional tool registration | `src/core/tools-config.ts` |
| Injection hygiene (score-gate, dedup, cap, compact instructions) + Tier-1 expansion | `hooks/vault-context.js` (`formatContextBlock`, `expandQueryViaLexicon`) |
| Symptom chunk indexing | `src/core/indexer.ts` |
| `manage_lexicon` MCP tool | `src/mcp/tools/patch.ts` |
| Tier-2 expansion + propose-and-confirm alias capture instructions | `skills/vault-first/SKILL.md` |
| Golden eval harness | `test/retrieval-eval/` |

## See also

- [Root CHANGELOG.md](../../CHANGELOG.md) — git-tracked release notes
- [lexicon-guide.md](../operational/lexicon-guide.md) — operating the human→LLM bridge day to day
- [v1.3 changelog](./v1-3-confidence-decay.md) — the decay multiplier this composes with
- [v1.3.1 changelog](./v1-3-1-telemetry.md) — the selection log v1.5 usage-feedback ranking will consume
- [`REGISTRY.md`](./REGISTRY.md) — tabular metadata view
</content>
