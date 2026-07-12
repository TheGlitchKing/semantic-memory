---
title: Entity Dossiers — Operating Guide
tier: guide
domains: [operational]
audience: [developers, admin]
tags: [dossier, manage_dossier, two-hop-retrieval, entity, incident-log, lexicon]
status: active
last_updated: '2026-07-11'
version: '1.5.0'
purpose: How to operate v1.5.0 entity dossiers day to day — create them, accrete incidents and current state in place, understand two-hop retrieval, feed the lexicon via aliases, seed from babel-fish, and troubleshoot resolution misses.
load_priority: 6
---

# Entity Dossiers — Operating Guide

A dossier (v1.5+) is a living note about one critical component — what it is, how it fails, which knobs to turn, its incident history, and where it stands right now. It exists because file-shaped memory doesn't match component-shaped questions: "what do I know about the payment gateway" shouldn't require scanning ten separate incident notes. This guide covers day-to-day operation; for the model and rationale see the [v1.5.0 changelog](../changelog/v1-5-0-expert-character.md).

## The one thing to know

Dossiers **accrete in place**. There is no "new dossier note per incident" — a component gets exactly one dossier, and every incident is a dated line appended to its Incident log. If you catch yourself about to `synthesize_note` a fresh gotcha about a component that already has a dossier, use `manage_dossier({action:"append_incident", ...})` instead.

## How dossiers work

Each dossier is a `dossier`-type note at `<vault>/dossiers/<slug>.md` with:

| Field | Meaning |
|---|---|
| `entity` | The canonical component name (required) |
| `aliases` | The human's phrases for this entity — feeds the lexicon compiler |
| `status`, `last_verified`, `confidence` | Standard provenance fields |

The body has five fixed sections, in this order:

1. **Purpose** — what it is and why it exists
2. **Failure modes** — how it breaks, tell-tale symptoms
3. **Knobs & commands** — the buttons to push: commands, config, flags, dashboards
4. **Incident log** — dated entries, newest last, each `what happened → cause → fix`
5. **Current state** — the single freshest sentence about where it stands right now

A derived, fast-lookup cache is compiled to `.claude/.semantic-memory/dossier-cache.json`. This is derived — don't hand-edit it; it's rebuilt automatically on every dossier write (`init`, `append_incident`, `set_state`) and on `manage_dossier({action:"list"})`.

## Creating a dossier

**Via CLI:**

```bash
semantic-memory dossier init "payment-gateway" --notes <path> \
  --alias "the gateway" --alias "stripe proxy" \
  --seeded-from ".claude/project-map/PROJECT_MAP.md"
```

**Via MCP tool:**

```
manage_dossier({
  action: "init",
  entity: "payment-gateway",
  aliases: ["the gateway", "stripe proxy"],
  seeded_from: ".claude/project-map/PROJECT_MAP.md"
})
```

`init` is a no-op if a dossier already exists for that entity (matched by exact `entity` or any existing `aliases`) — safe to call repeatedly. `seeded_from` records provenance (e.g. a babel-fish project-map entry) into `sources:` but never blocks scaffolding if the reference doesn't resolve to anything — it's fail-open, same posture as the v1.2 code-symbol drift seed.

**Listing what exists:**

```bash
semantic-memory dossier list --notes <path>
```

or `manage_dossier({ action: "list" })` from the assistant side — both print entity, aliases, and current state for every dossier.

## Accreting incidents and current state

**Append an incident** (adds a dated line to the Incident log; the first real incident replaces the section's placeholder prompt, every one after that just appends below it):

```
manage_dossier({
  action: "append_incident",
  entity: "payment-gateway",
  incident: "webhook signature mismatch → clock drift on the worker box → ntp resync"
})
```

**Update the current-state one-liner** (replaces the whole Current state section body — this is a revision, not an accretion):

```
manage_dossier({
  action: "set_state",
  entity: "payment-gateway",
  state: "Stable since the ntp fix; watch for drift alerts."
})
```

Both actions accept `entity` as the canonical name, any known alias, or a direct dossier path — `resolveDossierPath` resolves whichever you pass. Both refuse (return a "no dossier for entity" message) if `init` hasn't been run for that entity yet — dossiers don't get implicitly created by an incident append.

**Reading one directly:**

```
manage_dossier({ action: "get", entity: "payment-gateway" })
```

or `read_note({ path: "dossiers/payment-gateway.md" })` for the full note with `section` targeting if you only want one part.

## Two-hop retrieval

When an utterance names a tracked entity or one of its aliases, the `UserPromptSubmit` hook resolves it **before** firing semantic search: `resolveDossierForPrompt` does a deterministic, longest-key normalized match against `dossier-cache.json` (no LLM round-trip, no embedding call), and on a hit `formatDossierHead` injects a `<vault-dossier>` block — Purpose + Current state + a pointer to read the Incident log — **ahead of** the semantic hits.

This means "what's up with the payment gateway" resolves utterance → entity → dossier deterministically, instead of relying on embedding similarity to happen to surface the right note. It's the two-hop path: name the entity, get routed straight to what's tracked about it.

## How aliases feed the lexicon

A dossier's `aliases:` are folded into the lexicon compiler (`src/core/lexicon.ts`) as authored entries — `confidence: high`, `evidence_count` = number of aliases, `canonical` = the dossier path — skipped only when a real lexicon `alias` note already claims that canonical target. This means **Tier-1 query expansion** (v1.4's `expandQueryViaLexicon`) picks up dossier aliases automatically the next time the lexicon cache is compiled — no separate `manage_lexicon add` call needed for entity phrasing. Run `semantic-memory lexicon compile` (or any `manage_dossier` write, which recompiles the dossier cache but not the lexicon cache) after adding dossier aliases if you want the lexicon fold-in to show up immediately in `manage_lexicon({action:"lookup"})`.

## Seeding from babel-fish

If this project has babel-fish installed, its project map (`.claude/project-map/PROJECT_MAP.md`) is a natural `seeded_from` source — it already enumerates the project's routes/models/infra components, which map naturally to dossier candidates. Pass the project-map path or a specific entry reference as `--seeded-from`/`seeded_from` when initializing a dossier for a component babel-fish already tracks, so the dossier's provenance points back at where the entity was first identified.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| A phrase naming a component doesn't trigger the two-hop dossier block | `dossier-cache.json` is stale, or the phrase isn't a substring of `entity`/`aliases` after lowercasing | `manage_dossier({action:"list"})` to force a recompile; check the phrase actually matches an alias — matching is containment-based, not fuzzy |
| `append_incident`/`set_state` returns "no dossier for entity" | `init` was never run for that entity | `manage_dossier({action:"init", entity:...})` first |
| Incidents keep appending below a placeholder instead of replacing it | Only the *first* real append replaces the placeholder; subsequent ones correctly append below it — this is expected behavior, not a bug | n/a |
| A dossier alias doesn't expand a query even though it's set | Lexicon cache wasn't recompiled after the dossier write | `semantic-memory lexicon compile --notes <path>` |
| `dossier init` seems to silently do nothing on a repeat call | Intentional no-op — a dossier already exists for that entity or one of its aliases | `dossier list` to confirm; use `append_incident`/`set_state` to update it instead |

## See also

- [v1.5.0 changelog](../changelog/v1-5-0-expert-character.md) — full list of what shipped and where it lives
- [lexicon-guide.md](./lexicon-guide.md) — the query-expansion layer dossier aliases feed into
- [session-paging-guide.md](./session-paging-guide.md) — how dossier current-states also page into the SessionStart digest
- [mcp-tools-reference.md](../reference/mcp-tools-reference.md) — `manage_dossier` full args
- [frontmatter-spec.md](../reference/frontmatter-spec.md) — the `dossier` note type's fields and sections
- [`REGISTRY.md`](./REGISTRY.md) — tabular metadata view
