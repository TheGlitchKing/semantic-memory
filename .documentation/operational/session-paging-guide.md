---
title: Session Paging & Speaker Profile — Operating Guide
tier: guide
domains: [operational]
audience: [developers, admin]
tags: [session-paging, synthesize_promote, speaker-profile, manage_profile, capture-cue, sessions]
status: active
last_updated: '2026-07-11'
version: '1.5.0'
purpose: How to operate v1.5.0 session paging (Stop digest-as-proposal, SessionStart curated digest) and the speaker profile (init, sections, correction-cue updates, injection) — the session-lifecycle pair.
load_priority: 6
---

# Session Paging & Speaker Profile — Operating Guide

Session paging and the speaker profile are grouped in this guide because they're both about what survives a session boundary: paging turns compaction from information loss into information filing, and the speaker profile is the one thing that's supposed to be true across *every* session with this human, not just the one that's ending. Both shipped in v1.5.0. See the [v1.5.0 changelog](../changelog/v1-5-0-expert-character.md) for the model and rationale.

## The one thing to know

Neither of these writes anything canonical without a review step. The session digest always files as a `proposal:` — you (or a future session) graduate it with `synthesize_promote`. The speaker profile only ever updates through an explicit correction ("no, when I say X I mean Y") — it's never inferred silently from ordinary conversation.

## The Stop digest-as-proposal flow

When a session is open (`session.json` exists) and the `Stop` hook fires, the session-close prompt appends an instruction to page this session's durable state to the vault:

```
mcp__semantic-vault__synthesize_note({
  from_session: true,
  proposal: true,
  proposal_subdir: "sessions",
  suggested_path: "sessions/<session-id>.md",
  topic: "...",
  answer: "..."   // decisions made, resolutions (symptom → cause → fix), remaining task state
})
```

This writes a **proposal** — `status: proposal`, `proposed_target` recording the canonical `sessions/<session-id>.md` destination — not a directly-canonical note. Review it like any other proposal, then:

```
synthesize_promote({ proposal_path: "proposals/2026-07-11-<slug>.md" })
```

to graduate it. If it's not worth keeping, just leave it as a proposal (or delete it) — nothing downstream depends on every session producing a permanent digest.

**Why a proposal and not a direct write:** decision Q10 from the v1.5 planning doc — automatic drafting is fine, automatic *canonicalization* isn't. The draft happens every time a session closes; the review gate stays human.

## The SessionStart curated digest

On the next `SessionStart`, `buildSessionStartDigest` assembles a curated block instead of firing the old broad whole-vault semantic sweep, when there's anything durable to page in:

- **Active task** — from `session.json`, if a session is currently open
- **Last session digest** — the head (title + first paragraph) of the newest `sessions/*.md` note
- **Dossier current-states** — up to 6, each entity's Current state one-liner
- **Active mode** — vault-first / research / outage-silence

Rendered as:

```
<vault-session-digest mode="vault-first">
Paged in from the vault (curated — not a broad search):
- active task: fix the flaky indexer retry loop (session sess_...)
- last session digest `sessions/sess_....md`: Root-caused to a race in...
- tracked entities (current state):
    · payment-gateway — Stable since the ntp fix; watch for drift alerts.  `dossiers/payment-gateway.md`
Read the digest or a dossier before re-deriving prior context.
</vault-session-digest>
```

**When it falls back to the old broad search:** if there's no digest note, no dossier states, and no active session, `buildSessionStartDigest` returns empty and SessionStart uses the original seeded semantic search instead. Fresh vaults are unaffected by this change — there's nothing to page in yet.

## The speaker profile

A singleton note at `<vault>/profile/speaker.md` (created `evergreen: true` — it doesn't decay the way ordinary notes do), with four fixed sections:

1. **Severity calibration** — what this human's words map to (e.g. "annoying" = low, "on fire" = drop everything)
2. **Chronic omissions** — what they habitually leave unsaid (env, repro steps, which service) so you ask up front
3. **Verbosity preference** — terse answer first, or full reasoning? code or prose?
4. **Shorthand & terms** — non-entity shorthand ("the usual", "ship it") and what it's meant

### Initializing

```bash
semantic-memory profile init --notes <path>
```

or `manage_profile({ action: "init" })`. No-op if the note already exists.

### Reading it

```bash
semantic-memory profile show --notes <path>
```

or `manage_profile({ action: "get" })`. Prints the injection head — real content only, placeholder prompts stripped.

### Updating a section

```
manage_profile({
  action: "update_section",
  section: "Shorthand & terms",
  text: "\"the usual\" = the staging redeploy script",
  mode: "append"
})
```

`mode: "append"` (default) adds a line; `mode: "replace"` swaps the whole section body. `update_section` scaffolds the note first if it doesn't exist yet, so you never need to call `init` first manually.

### How it gets updated via correction cues

You don't normally call `manage_profile` directly mid-conversation — a correction cue triggers it. When you say something matching the existing capture-cue pattern with a speaker-correction shape — "when I say X I mean Y", "what I mean by...", "I actually meant...", "when I said X I meant Y" — the vault-first capture prompt routes it to `manage_profile({action:"update_section", ...})` instead of `synthesize_note`. This reuses the same `CAPTURE_CUES` detection machinery from v1.1/v1.4, just with a new destination for this specific correction shape.

### What gets injected

SessionStart renders a capped `<vault-speaker-profile>` block (`readSpeakerProfileBlock`, ≤24 lines) alongside the session digest:

```
<vault-speaker-profile path="profile/speaker.md">
How this human communicates (learned — apply, don't recite):
  Severity calibration:
  "annoying" = low, "broken" = ship-blocking, "on fire" = drop everything
  Shorthand & terms:
  "the usual" = the staging redeploy script
</vault-speaker-profile>
```

**Silent when unfilled.** If every section is still just its placeholder prompt, `readSpeakerProfileBlock` returns an empty string and nothing is injected — an empty profile costs zero tokens.

One human, one profile. Multi-speaker attribution (tracking who said what across different humans) is an explicit non-goal for v1.5.0.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Stop hook doesn't offer the digest-paging instruction | No session is open | `session_start({task})` first — the instruction only appears when `session.json` exists |
| A digest proposal never got promoted and is cluttering `proposals/` | Expected — promotion is a manual step | `synthesize_promote({proposal_path: ...})` if worth keeping, or just leave/delete it |
| SessionStart shows the old broad search instead of the curated digest | Nothing durable to page in yet (no session digests, no dossier states, no active session) | Correct fallback behavior, not a bug — create a dossier or let a session close through the Stop flow to build up state |
| Speaker profile block never appears | All sections still placeholder-only | `semantic-memory profile show` to confirm; use `manage_profile({action:"update_section", ...})` or wait for a correction cue to fire |
| A correction I made didn't update the profile | The phrasing didn't match a recognized correction-cue pattern | Use one of the recognized shapes explicitly ("when I say X I mean Y"), or call `manage_profile` directly |

## See also

- [v1.5.0 changelog](../changelog/v1-5-0-expert-character.md) — full list of what shipped and where it lives
- [dossiers-guide.md](./dossiers-guide.md) — dossier current-states are one of the digest's inputs
- [capture-workflows.md](./capture-workflows.md) — the golden capture path this reuses
- [sessions-guide.md](./sessions-guide.md) — session_start/session_finish lifecycle the Stop digest depends on
- [mcp-tools-reference.md](../reference/mcp-tools-reference.md) — `manage_profile`, `synthesize_note`, `synthesize_promote`
- [`REGISTRY.md`](./REGISTRY.md) — tabular metadata view
