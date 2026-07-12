---
title: v1.5.0 — the expert-character layer (dossiers, usage-feedback ranking, session paging, speaker profile)
tier: reference
domains: [changelog]
audience: [developers, admin]
tags: [v1.5.0, dossier, manage_dossier, two-hop-retrieval, usage-feedback, decoys, session-paging, synthesize_promote, speaker-profile, manage_profile]
status: active
last_updated: '2026-07-11'
version: '1.5.0'
purpose: What v1.5.0 added — entity dossiers with two-hop retrieval and lexicon-alias fold-in, usage-feedback ranking that consumes the v1.3.1 selection log plus a decoys lint, Stop/SessionStart session paging (digest-as-proposal), and a speaker profile learned via correction cues. Tool count 42→44 (manage_dossier, manage_profile).
load_priority: 7
---

# v1.5.0 — the expert-character layer

v1.5.0 (2026-07-11) ships across four feature phases (8–11) plus a validation phase (12), all shipped and tested (418/418 green). Where v1.4.0 taught the plugin *how this human talks about the system* and closed the vocabulary gap, v1.5.0 gives it the other two traits of a resident expert: it organizes memory by **component**, not by file, and it **learns from its own usage** instead of throwing every citation and every session boundary away. Tool surface grows 42→44 with `manage_dossier` and `manage_profile`.

## The problem this solves

The lexicon (v1.4) fixed how queries get *phrased*. Two gaps remained in how memory itself was *organized*:

- **File-shaped memory, component-shaped problems.** A real resident expert doesn't think "which note was that in" — they think "what do I know about the payment gateway." Before v1.5, an incident about the same component spawned a new note every time, and nothing routed an utterance naming the component straight to what's known about it.
- **Retrieval and session boundaries were pure write-once.** The v1.3.1 selection log recorded which notes got cited — and nothing consumed it. Every `Stop` was a hard reset: whatever context accumulated in the conversation vanished at compaction instead of being filed for next time. And nothing modeled the one variable that's constant across every session with this human: how *they* talk, what *they* chronically omit, how much detail *they* want back.

v1.5.0 addresses both without changing how v1.3 (decay) or v1.4 (path-class, lexicon) rank or expand — it composes with them, at the same rank site and the same capture-cue machinery.

## What's new

### 1. Entity dossiers — memory organized by component, not by file

A new `dossier` note type lives at `<vault>/dossiers/<slug>.md`, one per critical component. Frontmatter requires `entity` (the canonical name) and carries `aliases: []` (the human's phrases for it) alongside the standard `title`/`status`/`last_verified`/`confidence`.

Every dossier has the same fixed sections, in this order: **Purpose / Failure modes / Knobs & commands / Incident log / Current state**. Knowledge accretes **in place**:

- `appendIncident` writes a dated line (`- 2026-07-11 — <what happened> → <cause> → <fix>`) to the Incident log — newest last. The first real incident replaces the section's placeholder prompt; every one after that just appends.
- `setCurrentState` replaces the whole Current state section body — the single freshest sentence about where the entity stands.

Never a new note per event — the entity is the unit of memory, the file is just its container.

**Core** (`src/core/dossier.ts`): `initDossier` (no-op on a repeat call for the same entity; `seeded_from` provenance is fail-open — a missing source never blocks scaffolding), `listDossiers`, `findDossier`, `resolveDossierForQuery` (longest-key match so a specific alias wins over a generic one), `appendIncident`, `setCurrentState`, `compileDossiers` (writes the derived `.claude/.semantic-memory/dossier-cache.json`), plus generic heading-scoped editors `appendToSection`/`replaceSectionBody` that Phase 11's speaker profile reuses.

**Surface:**
- MCP tool `manage_dossier` — actions `init | append_incident | set_state | get | list`.
- CLI `semantic-memory dossier init <entity> [--alias <phrase...>] [--seeded-from <ref>]` and `dossier list`.

```
manage_dossier({ action: "init", entity: "payment-gateway", aliases: ["the gateway", "stripe proxy"], seeded_from: ".claude/project-map/PROJECT_MAP.md" })
manage_dossier({ action: "append_incident", entity: "payment-gateway", incident: "webhook signature mismatch → clock drift on the worker box → ntp resync" })
manage_dossier({ action: "set_state", entity: "payment-gateway", state: "Stable since the ntp fix; watch for drift alerts." })
```

**Lexicon fold-in.** A dossier's `aliases:` feed the lexicon compiler directly (`src/core/lexicon.ts`): each becomes an authored entry (`confidence: high`, `evidence_count` = alias count) pointing at the dossier path, skipped only if a real lexicon note already owns that canonical target. This means Tier-1 query expansion (v1.4) routes phrases naming a tracked entity to its dossier automatically, without a separate `manage_lexicon add` call.

**Two-hop retrieval.** The `UserPromptSubmit` hook (`hooks/vault-context.js`) now runs `resolveDossierForPrompt` — a deterministic, longest-key normalized match against `dossier-cache.json`, no LLM, no embedding call — before firing semantic search. A hit is rendered by `formatDossierHead` as a `<vault-dossier>` block (Purpose + Current state + a pointer to read the Incident log) and injected **first**, ahead of the semantic hits. The retrieval path is now utterance → entity → dossier, not just utterance → embedding → nearest chunk. This is what finally makes the knowledge graph load-bearing at query time, not just a `backlinks`/`graph_path` curiosity.

**Troubleshoot:** if a dossier isn't resolving for a phrase you'd expect it to, check that `dossier-cache.json` has actually been recompiled (`manage_dossier({action:"list"})` or `dossier list` forces a recompile) and that the phrase is genuinely a substring of `entity` or one of `aliases` after lowercasing/whitespace-normalization — `resolveDossierForQuery`/`resolveDossierForPrompt` do containment matching, not fuzzy matching.

### 2. Usage-feedback ranking + decoys

Consumes the v1.3.1 selection log (`.claude/.semantic-memory/selection.jsonl`) to turn repeated citations into a bounded rank boost.

`src/core/usage-boost.ts`: `computeUsageBoost(citations, config) = min(cap, 1 + citations · per_citation)` — clamped to `[1, cap]`, so a note with zero citations is an exact no-op. Config lives in a `usage_boost` block in `vault.schema.yml`:

```yaml
usage_boost:
  enabled: true
  cap: 1.5
  per_citation: 0.1
```

Wired as `applyUsageBoost` at the same shared `src/mcp/context.ts` rank site as `applyDecay` (v1.3) and `applyPathClass` (v1.4) — all three (plus `load_priority`) compose **multiplicatively**. A stale-but-cited note still decays; a cited-but-archived note still down-weights. The citation snapshot is TTL-cached for 15s and refreshed via `refreshUsageBoost()` before each search batch, so citations made earlier *in the same session* take effect on later searches without re-reading the log on every scored result. Boosted results carry a `usage: { citations, multiplier }` block, the same shape convention as `decay`.

The cap exists to stop a feedback-runaway loop: cited → ranks higher → gets cited more → ranks higher still. `usage_boost.enabled: false` reproduces byte-identical pre-v1.5 ranking.

**Decoys — the complementary signal, surfaced only.** `findDecoys` in `src/core/lint.ts` flags notes retrieved 3+ times (`DECOY_MIN_RETRIEVALS = 3`) per the selection log but **never** cited — exposed via `lint_vault({ checks: ["decoys"] })`. This is deliberately lint-only: a decoy might be genuine noise, or it might be a note the answers were wrong to skip. Usage-feedback ranking never auto-down-ranks on this ambiguous signal — a human reads the finding and decides (decision Q5, below).

**Troubleshoot:** if a note you'd expect to be boosted isn't, check `selection.jsonl` actually has `selection`-kind entries for it (`semantic-memory selection-stats --notes <path>`) — the boost is citation-count-driven, not search-appearance-driven; showing up in results without being read doesn't count.

### 3. Session paging — memory as swap space

Two hook-side changes, one on each end of a session:

**Stop.** When a session is open, the session-close prompt now appends a digest-paging instruction (`formatSessionDigestPrompt`): draft this session's decisions, resolutions (symptom → cause → fix), and remaining task state via `synthesize_note` with `from_session: true`, `proposal: true`, `proposal_subdir: "sessions"`, `suggested_path: "sessions/<session-id>.md"`. It files as a reviewable **proposal**, not a silent write — `synthesize_promote` graduates it to canonical if it's worth keeping (decision Q10, below).

**SessionStart.** `buildSessionStartDigest` pages in a curated block — the active task from `session.json`, the head of the latest `sessions/*.md` digest, up to 6 dossier current-states, and the active mode — rendered as `<vault-session-digest>`. When there's anything durable to page in, this block **replaces** the broad whole-vault semantic sweep that SessionStart used to always fire. Fresh vaults with no digest, no dossier states, and no active session are unaffected — SessionStart falls back to the original seeded search.

The reframe: compaction used to mean information loss (the conversation is gone, only what got explicitly synthesized survives). Session paging makes it information *filing* — the Stop hook always offers to page the session out, and the next SessionStart pages the relevant slice back in instead of re-deriving it from scratch.

**Troubleshoot:** if SessionStart isn't showing the curated digest and falls back to a broad search instead, that's correct behavior when there's genuinely nothing durable yet — check whether `sessions/*.md`, `dossiers/*.md`, or `.claude/.semantic-memory/session.json` actually exist before assuming a bug.

### 4. Speaker profile — the model of THIS human

A new `profile` note type, singleton at `<vault>/profile/speaker.md` (created `evergreen: true`), with fixed sections: **Severity calibration / Chronic omissions / Verbosity preference / Shorthand & terms**.

**Core** (`src/core/profile.ts`): `initSpeakerProfile`, `readSpeakerProfile` (returns a placeholder-stripped injection head — an unfilled profile yields nothing but section headings get dropped too, so an empty profile injects nothing at all), `updateProfileSection` (`mode: "append" | "replace"`, scaffolds the note first if it doesn't exist yet).

**Surface:**
- MCP tool `manage_profile` — actions `init | get | update_section` (params: `section`, `text`, `mode` = `append` (default) | `replace`).
- CLI `semantic-memory profile init` and `profile show`.

SessionStart injects a capped `<vault-speaker-profile>` block (`readSpeakerProfileBlock` in the hook, ≤24 lines) — real learned content only, silent when the profile has nothing but placeholders.

**Update loop.** A correction cue — "when I say X I mean Y", "what I mean by", "I actually meant", "when I said X I meant Y" — folds into the *existing* capture-cue machinery from v1.1. The vault-first capture prompt now routes a speaker correction to `manage_profile({action:"update_section", ...})` instead of `synthesize_note`, so "no, when I say 'the usual' I mean the staging redeploy" updates *how this human talks* rather than filing a one-off fact note.

One human, one profile — multi-speaker attribution is an explicit non-goal for v1.5.0.

**Troubleshoot:** if the profile block never appears at SessionStart, that's the intended silent behavior until at least one section has real (non-placeholder) content — check with `semantic-memory profile show`, which prints `(profile is empty — only placeholders)` when nothing has been learned yet.

## Key design decisions

Four open questions from the v1.4/v1.5 planning doc were locked to the conservative posture at kickoff (2026-07-11):

- **Q5 — decoys stay lint-only.** Retrieved-but-never-cited notes are surfaced via `lint_vault({checks:["decoys"]})`; usage-feedback ranking never auto-down-ranks on that signal. Down-rank on evidence (citations), never on ambiguous inference (a decoy could be noise or a wrongly-skipped answer).
- **Q9 — conditional tool registration stays default OFF.** The v1.4 `tools.conditional` block remains `false` by default through v1.5.0; `tools/list_changed` MCP-protocol reliability across clients is still unverified, so the reduced outage-silence tool surface stays opt-in.
- **Q10 — session digest is an automatic draft, filed as a proposal.** The Stop hook always offers the digest-paging call, and `synthesize_note` always writes it as `proposal: true` — reviewable, not silently canonical. `synthesize_promote` is the human-gated graduation step.
- **Q11 — learned aliases stay propose-and-confirm regardless of `evidence_count`.** Even a lexicon entry reinforced many times over doesn't earn silent auto-add privileges in v1.5.0. Dossier aliases are the one exception, and it's a *narrower* one: they're written by an explicit `manage_dossier init`/CLI call, not inferred from conversation.

All four honor the same house rule this arc keeps returning to: humans stay in the loop for anything that isn't hard evidence.

## How it composes with v1.3 / v1.4

- **Ranking stack** at `src/mcp/context.ts` is now `decay (v1.3) × path_class (v1.4) × usage_boost (v1.5) × load_priority`, all multiplicative, none of the signals replacing another. `search_text`/`search_graph` remain unaffected by all of them — decay/path-class/usage-boost apply only to `search_semantic`/`search_hybrid`.
- **Query expansion** (v1.4 Tier-1, `expandQueryViaLexicon`) now also matches dossier aliases, because dossier `aliases:` fold into the same compiled lexicon cache the Tier-1 hook reads.
- **Capture-cue machinery** (v1.1+, extended for lexicon capture in v1.4) is extended again in v1.5 to route speaker-correction cues to `manage_profile` instead of `synthesize_note` — same detection regex family, new destination.
- **Golden eval harness** (v1.4 Phase 1) is the regression gate for the ranking changes: Phase 12 validation confirmed zero regression (recall@1 = 86%, recall@3 = 100%, recall@5 = 100%, MRR = 0.929 — unchanged, because the fixture vault has no lexicon/dossier data, which is the correct null result for a no-op check).

## Where it lives

| Thing | Location |
|---|---|
| Dossier engine (init, accretion, cache, section editors) | `src/core/dossier.ts` |
| `manage_dossier` MCP tool | `src/mcp/tools/patch.ts` |
| CLI `dossier init`/`dossier list` | `src/cli/index.ts` |
| Dossier alias fold-in to the lexicon compiler | `src/core/lexicon.ts` |
| Two-hop retrieval (resolve + format + inject before semantic hits) | `hooks/vault-context.js` (`resolveDossierForPrompt`, `formatDossierHead`) |
| Usage-boost engine (compute, config, citation counts) | `src/core/usage-boost.ts` |
| Usage-boost wiring at the shared rank site | `src/mcp/context.ts` (`applyUsageBoost`, `refreshUsageBoost`) |
| Decoys lint check | `src/core/lint.ts` (`findDecoys`) |
| Session-paging Stop instruction | `hooks/vault-context.js` (`formatSessionDigestPrompt`) |
| Session-paging SessionStart digest | `hooks/vault-context.js` (`buildSessionStartDigest`, `readLatestSessionDigest`, `readDossierStates`) |
| Speaker profile engine | `src/core/profile.ts` |
| `manage_profile` MCP tool | `src/mcp/tools/patch.ts` |
| CLI `profile init`/`profile show` | `src/cli/index.ts` |
| Speaker profile SessionStart injection | `hooks/vault-context.js` (`readSpeakerProfileBlock`) |
| Speaker-correction capture cues | `hooks/vault-context.js` (`CAPTURE_CUES`) |

## See also

- [Root CHANGELOG.md](../../CHANGELOG.md) — git-tracked release notes
- [dossiers-guide.md](../operational/dossiers-guide.md) — operating entity dossiers day to day
- [usage-feedback-guide.md](../operational/usage-feedback-guide.md) — operating usage-feedback ranking + the decoys lint
- [session-paging-guide.md](../operational/session-paging-guide.md) — the session-lifecycle pair: digest paging + speaker profile
- [v1.4.0 changelog](./v1-4-0-resident-bridge.md) — the lexicon and query expansion this composes with
- [v1.3.1 changelog](./v1-3-1-telemetry.md) — the selection log usage-feedback ranking consumes
- [`REGISTRY.md`](./REGISTRY.md) — tabular metadata view
