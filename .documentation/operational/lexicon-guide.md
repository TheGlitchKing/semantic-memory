---
title: Lexicon & Query Expansion — Operating Guide
tier: guide
domains: [operational]
audience: [developers, admin]
tags: [lexicon, alias, symptoms, query-expansion, manage_lexicon, synthesize_note]
status: active
last_updated: '2026-07-10'
version: '1.4.0'
purpose: How to operate the v1.4.0 human-to-LLM bridge day to day — add and inspect lexicon aliases, resolve alias_conflicts, capture verbatim symptoms, and understand Tier-1/Tier-2 query expansion.
load_priority: 6
---

# Lexicon & Query Expansion — Operating Guide

The lexicon (v1.4+) is a learned map from *how this human talks about the system* to *the canonical artifact they mean*. It exists because terse, indexical phrasing ("the flaky thing", "that timeout bug again") embeds poorly and misses notes that would otherwise answer the query. This guide covers day-to-day operation; for the model and rationale see the [v1.4.0 changelog](../changelog/v1-4-0-resident-bridge.md).

## The one thing to know

The lexicon only ever grows through **propose-and-confirm** — the assistant offers to add an alias when it resolves your vague phrasing to a concrete artifact; it never adds one silently. If you want an alias added and it wasn't offered, add it yourself.

## How the lexicon works

Each entry is an `alias` note under `<vault>/lexicon/` with:

| Field | Meaning |
|---|---|
| `canonical` | The artifact's real name/path the phrase resolves to |
| `phrases[]` | The human phrasings that mean this canonical |
| `confidence` | How trusted this mapping is |
| `evidence_count` | How many times this mapping has been confirmed |
| `source` | `learned` (came from a conversation) or `authored` (you wrote it directly) |

Adding the same phrase again doesn't duplicate the entry — it bumps `evidence_count` and `confidence` on the existing one.

A compiled, fast-lookup cache lives at `.claude/.semantic-memory/lexicon-cache.json`. This is derived — don't hand-edit it; run `compile` after changing entries directly in the vault.

## Adding an alias

**Via MCP tool:**

```
manage_lexicon({ action: "add", canonical: "gotchas/flaky-indexer.md", phrases: ["the flaky thing", "that indexer bug"] })
```

**Via CLI:**

```bash
semantic-memory lexicon add --canonical "gotchas/flaky-indexer.md" --phrase "the flaky thing"
```

**Looking things up:**

```bash
semantic-memory lexicon list
```

or, from the assistant side, `manage_lexicon({ action: "list" })` / `manage_lexicon({ action: "lookup", phrase: "..." })`.

**Removing a bad mapping:**

```
manage_lexicon({ action: "remove", canonical: "...", phrase: "..." })
```

**Recompiling the cache after direct vault edits:**

```bash
semantic-memory lexicon compile
```

(The `manage_lexicon` tool's `add`/`remove` actions recompile automatically; `compile` is for when you've hand-edited alias notes directly.)

## The propose-and-confirm capture flow

During a normal conversation, if you use vague or indexical phrasing and the assistant resolves it to a specific note or artifact (via context, search, or you telling it directly), `vault-first` may offer:

> "Should I remember that 'the flaky thing' means `gotchas/flaky-indexer.md`?"

Say yes and it calls `manage_lexicon add`. Say no (or ignore it) and nothing is written. This is deliberately never automatic — a wrong learned alias is worse than a missed one, because it actively misdirects future query expansion.

## Resolving alias_conflicts

Two phrasings can drift into mapping the same string to different canonicals (e.g. learned in different sessions). Check for this with:

```
lint_vault({ checks: ["alias_conflicts"] })
```

This flags any phrase that resolves to more than one canonical. Fix it by removing the stale mapping:

```
manage_lexicon({ action: "remove", canonical: "<the wrong one>", phrase: "<the conflicting phrase>" })
```

Run this lint periodically, or after a research-mode session that involved a lot of learned aliases — that's the highest-density place for drift to accumulate.

## Verbatim symptom capture

Some notes (especially `gotcha`-type ones) are found by a query that quotes an error verbatim, not by prose that describes it. To make that path work, `synthesize_note` accepts a `symptoms` param:

```
synthesize_note({
  ...,
  symptoms: ["connection refused on port 9200", "ECONNREFUSED :9200"]
})
```

This writes a `symptoms:` frontmatter list, and at index time each symptom phrase is chunked and indexed **on its own**, pointing back at the note — separately from the note's prose chunks. Use it whenever you're capturing a note about a failure that has a distinctive literal error string, log line, or terse trigger phrase — anything a future terse query might paste verbatim rather than describe.

## Query expansion — what happens automatically

You don't invoke this directly; it's always running, in two tiers:

- **Tier 1 (hook, deterministic, every query).** `expandQueryViaLexicon` checks your utterance against the lexicon cache and appends any matching canonicals before the query is embedded. Fast, no LLM round-trip, silent.
- **Tier 2 (LLM-side, only for terse/indexical utterances).** If your utterance leans on conversational context to mean anything ("still broken?", "same one as last time"), `vault-first` rewrites it using that context and re-searches once before giving up. This is a skill instruction, not a hook — it only fires when the assistant judges the utterance actually needs it.

If a query that should have expanded didn't, check `semantic-memory lexicon lookup` for the phrase first — Tier 1 can only expand phrases that are already in the lexicon.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| A phrase I use constantly never gets learned | Propose-and-confirm never fired, or you declined it | Add it directly: `manage_lexicon({ action: "add", ... })` or the CLI equivalent |
| Same phrase seems to resolve to different notes on different days | `alias_conflicts` — two canonicals mapped to one phrase | `lint_vault({ checks: ["alias_conflicts"] })`, then remove the stale mapping |
| Added an alias but search still doesn't expand the query | Cache not recompiled (only relevant after direct vault edits, not tool calls) | `semantic-memory lexicon compile` |
| A terse follow-up ("same as before?") doesn't find the right note | Tier 2 expansion is a skill judgment call, not guaranteed | Rephrase with the specific noun, or add the phrasing as a lexicon alias so Tier 1 catches it next time |
| A symptom query (pasted error string) doesn't match the gotcha note | Note was authored before `symptoms` capture, or the exact string wasn't captured | Re-synthesize or update the note's `symptoms:` frontmatter with the verbatim string |

## See also

- [v1.4.0 changelog](../changelog/v1-4-0-resident-bridge.md) — full list of what shipped and where it lives
- [decay-guide.md](./decay-guide.md) — the other ranking signal query results compose with
- [mcp-tools-reference.md](../reference/mcp-tools-reference.md) — `manage_lexicon`, `synthesize_note`, `lint_vault`
- [`REGISTRY.md`](./REGISTRY.md) — tabular metadata view
</content>
