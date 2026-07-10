---
title: v1.3 — confidence decay (age-aware retrieval ranking)
tier: reference
domains: [changelog]
audience: [developers, admin]
tags: [v1.3, decay, confidence, ranking, verify_note, evergreen, last_verified]
status: active
last_updated: '2026-07-10'
version: '1.3.0'
purpose: What v1.3.0 added — smooth, type-aware confidence decay that down-weights stale notes in search ranking, verify_note to reset the clock, evergreen opt-out, and decay CLI introspection.
load_priority: 6
---

# v1.3 — confidence decay

v1.3.0 (2026-07-10) replaces age-blind retrieval ranking with **smooth, type-aware confidence decay**. Notes age out of relevance gracefully; an explicit re-verification resets the clock; agents see decay state in results and can act on it. Opt out with one config line.

## The model

A note's decay multiplier is:

```
multiplier = 0.5 ^ (age_days / half_life)
```

where `age_days` is the time since the note's `last_verified` date. At one half-life the multiplier is 0.5; it halves again each further half-life, floored so notes down-weight but never disappear.

- **Per-type half-life:** `decision` 365d, `note` 365d, `gotcha` 180d, `source` never decays, `proposal` 14d.
- **Floor:** 0.1 (configurable).
- **Fails open** (multiplier 1.0) on any uncertainty — decay disabled, or `last_verified` missing / unparseable / in the future. Decay can only ever down-rank a note we're confident is old; it never penalizes ambiguity.

## What's new

### Decay applied at search time

`search_semantic` and `search_hybrid` multiply the decay factor into each result's score **after** the existing `load_priority` boost — it composes with existing signals, never replaces them:

```
finalScore = baseScore × load_priority_boost × decay_multiplier
```

`search_text` (exact-match intent) and `search_graph` (graph distance is the ranking signal) are deliberately unaffected.

### The `decay` block in results

A result that was actually down-weighted (multiplier < 1) carries a `decay` block so the agent can see staleness and offer to re-verify:

```json
{
  "path": "decisions/old-rabbitmq.md",
  "score": 0.31,
  "decay": {
    "multiplier": 0.42,
    "age_days": 312,
    "effective_half_life": 180,
    "reason": "type=gotcha"
  }
}
```

Fresh results (multiplier 1.0) stay clean — no block.

### `verify_note` — reset the clock

New MCP tool (write-gated). Stamps `last_verified` to today **without changing content or any other frontmatter field**, logs a `verify` event to `log.md`, and returns the note's new decay multiplier:

```
verify_note({ path: "decisions/auth.md" })
  → { "path": "decisions/auth.md", "last_verified": "2026-07-10", "decay_multiplier": 1 }
```

This is the intended way to say "I re-checked this; it's still true" and pull a note back up the rankings.

### `evergreen` frontmatter

`evergreen: true` pins a note at multiplier 1.0 **while** its `last_verified` is within 365 days. Past that, the evergreen claim itself is considered expired and the note decays normally — so evergreen status must be periodically re-affirmed (via `verify_note`), it doesn't grant permanent immunity.

### CLI introspection

- `semantic-memory decay-config --notes <path>` — prints the active config and whether it comes from defaults or a `vault.schema.yml` override.
- `semantic-memory decay-trace <note> --notes <path>` — prints the full decay calculation for one note (type, last_verified, age, half-life, evergreen, multiplier). The fastest way to answer "why does this note rank here?"

### Config

A documented `decay:` block ships in the default vault schema. `decay.enabled: false` restores byte-identical pre-v1.3 ranking. See [configuration-reference.md](../reference/configuration-reference.md).

## Semantics: decay keys on `last_verified`, not edits

`last_verified` is stamped only at note creation (`synthesize_note`, `ingest_source`) and by `verify_note` — **no edit path bumps it**. So ordinary edits do *not* reset the decay clock, which is the intended correctness property. (The separate `last_modified` field from the original plan was therefore unnecessary for decay and is not part of v1.3.)

## Gotcha fixed during development

YAML parses an unquoted `last_verified: 2019-01-01` into a **Date**, not a string. An early `typeof === "string"` guard silently dropped those values, so hand-authored notes with unquoted dates read as "no last_verified (fail open)" and never decayed. `normalizeVerifiedDate()` now coerces string **or** Date at every read site (search, `verify_note`, `decay-trace`). This was caught by the `decay-trace` smoke test — a good argument for the introspection commands.

## Deliberately deferred (documented, not dropped)

- **Backlink hotness boost** — the engine supports it (`hotness_boost` config), but it ships **flag-off**; hub notes (index.md) distort the signal, so it must be earned via telemetry before defaulting on.
- **`decay_candidates` lint** and **selection-logging telemetry** — both need query-log / selection history to be meaningful; telemetry is also the dependency for the v1.4 usage-feedback ranking. Staged as a v1.3.x follow-up.

## Where it lives

| Thing | Location |
|---|---|
| Decay engine (pure) + config loader + date normalizer | `src/core/decay.ts` |
| Search-time application | `src/mcp/context.ts` (`applyDecay`, `getDecayConfig`) |
| Wired into search tools | `src/mcp/tools/search.ts` (`search_semantic`, `search_hybrid`) |
| `verify_note` tool | `src/mcp/tools/patch.ts` |
| Default `decay:` config | `src/core/schema-default.ts` |
| CLI introspection | `src/cli/index.ts` (`decay-config`, `decay-trace`) |
| Tests | `test/unit/decay.test.ts`, `test/integration/mcp-server.test.ts` |

## See also

- [Root CHANGELOG.md](../../CHANGELOG.md) — git-tracked release notes
- [decay-guide.md](../operational/decay-guide.md) — operating decay day to day
- [configuration-reference.md](../reference/configuration-reference.md) — the `decay:` block
- [mcp-tools-reference.md](../reference/mcp-tools-reference.md) — `verify_note`
- [`REGISTRY.md`](./REGISTRY.md) — tabular metadata view
