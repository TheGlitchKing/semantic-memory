---
title: Sessions guide — verification-gated work units
tier: guide
domains: [operational]
audience: [developers, admin]
tags: [sessions, verification, workflow, v1.1, hard-gate]
status: active
last_updated: '2026-05-09'
version: '1.2.0'
purpose: Operational guide to the v1.1 session loop. When to open a session, how to run verification commands, how `session_finish`'s hard gate works, what session_state contains, and how the Stop hook surfaces open sessions.
load_priority: 8
---

# Sessions guide

Sessions are verification-gated work units. They formalize the "I'm doing X, I'm running tests, I'm done" pattern for multi-step coding work. The hard gate at `session_finish` refuses to close without recorded verifications unless explicitly waived — preventing "I shipped without testing" outcomes.

Sessions are **opt-in**. You can use semantic-memory entirely without ever calling `session_start`. They exist for when you want the discipline.

## When to open a session

Open a session when:

- You're doing **multi-step work** that ends in a clear "done" moment
- The work has a **verification step** (tests, lint, smoke, type-check, etc.)
- You want a **structured close-out** that surfaces what was verified vs. waived

Don't open a session for:

- Single-shot exploratory queries (`search_*`, `read_note`)
- Pure prose work (note authoring, doc edits) where there's nothing to verify
- Sessions that span multiple Claude Code conversations (sessions are per-process; SessionStart doesn't auto-resume)

## The four session tools

| Tool | Purpose | Refuses when |
|---|---|---|
| `session_start({task})` | Open a session | Another session is already open with a different task. Same-task call returns existing id (idempotent). |
| `session_run({cmd, timeout_ms?})` | Run a verification command, capture exit/duration/tail | No session is open |
| `session_finish({summary, verified?, reason?})` | Close the session | No session open. **HARD GATE:** No verifications recorded AND `verified !== false`. Or `verified=false` with empty `reason`. |
| `session_status()` | Read the active session (or `{state: "no_session"}`) | Never — read-only |

## Hard gate semantics

`session_finish` enforces this rule:

> A session can only close successfully if (verifications were recorded) OR (the caller explicitly waived verification with a non-empty reason).

In practice:

```javascript
// HAPPY PATH — verifications recorded
session_start({ task: "tighten auth flow" })
session_run({ cmd: "npm test" })       // → exit: 0
session_run({ cmd: "npm run lint" })   // → exit: 0
session_finish({ summary: "auth flow tightened, tests pass" })
// → ok: true

// REFUSED — no verifications, no waiver
session_start({ task: "edit some docs" })
session_finish({ summary: "edited docs" })
// → ok: false
//   error: "session_finish refused: no verification commands recorded.
//           Run session_run with a real verification command first, OR
//           pass verified=false with a reason to waive verification."

// WAIVER PATH — explicitly verified=false + reason
session_start({ task: "edit some docs" })
session_finish({
  summary: "edited 3 doc files",
  verified: false,
  reason: "doc-only edits, no test surface"
})
// → ok: true
//   closed.closed_verified_waived: true
//   closed.closed_waiver_reason: "doc-only edits, no test surface"
```

## When to use the waiver path

Waive verification with `verified: false, reason: "..."` for tasks that genuinely have nothing to verify:

- **Documentation-only edits** — `reason: "doc-only edits, no test surface"`
- **Vault content authoring** — `reason: "wrote 3 decision notes, no code touched"`
- **README updates** — same
- **Quick frontmatter fixes** — `reason: "frontmatter normalization, lint suite covers"`

Waiving is the path of integrity, not laziness. A session that ran `npm test` and then waived because tests don't apply isn't lying — it's accurate. A session that should have run tests but waived to skip them defeats the gate.

If you're frequently waiving, you may not need sessions for that workflow. The gate is supposed to be friction; if it's pure friction with no benefit, just don't open the session.

## What's recorded in session.json

```json
{
  "id": "ses_2026-05-09T14-30-01-000Z",
  "task": "tighten auth flow",
  "started_at": "2026-05-09T14:30:01.000Z",
  "last_activity_at": "2026-05-09T14:35:12.000Z",
  "verifications": [
    {
      "cmd": "npm test",
      "exit": 0,
      "signal": null,
      "duration_ms": 4321,
      "tail": "...last 4KB of stdout/stderr...",
      "at": "2026-05-09T14:34:56.000Z"
    }
  ],
  "notes_touched": [
    "decisions/auth-migration.md",
    "gotchas/keycloak-token-refresh.md"
  ]
}
```

After `session_finish`, the file is **deleted**. Session state is ephemeral — durable artifacts are:

- The closed session's data passed back in the `session_finish` result
- Log events in `<vault>/log.md` (kind: `session`)
- Any notes that got created/modified during the session (recorded in `notes_touched`)

If you want a persistent record of what a session accomplished, follow up `session_finish` with a `synthesize_note` (with `from_session: true` in v1.3+, but you can manually populate it in v1.2). That writes a durable note to the vault.

## notes_touched auto-recording

When `apply_patch`, `synthesize_note`, or `synthesize_promote` succeed (non-dry-run, non-proposal), the affected note paths are appended to `session.notes_touched` automatically. You don't need to track this manually.

This means: every durable change you make during a session is captured. The closed session's `notes_touched` is your "what files did this work touch" answer.

Caveat: if a session opens AFTER you've already made changes, those changes aren't retroactively attributed. Open the session first.

## Stop hook session-aware branch (v1.1+)

When you Stop (`/quit`, session end, etc.) with an open session, the Stop hook emits a session-close prompt:

**With verifications recorded:**

```
<vault-session-close id="ses_..." task="tighten auth flow" verifications="2">
Session ses_... is still open: task="tighten auth flow", verifications=2.

Recent verifications:
- `npm test` → exit=0 in 4321ms
- `npm run lint` → exit=0 in 1832ms

Before ending: call mcp__semantic-vault__session_finish with a one-line
summary. Verification recorded — finish will succeed without a waiver.
</vault-session-close>
```

**Without verifications recorded:**

```
<vault-session-close id="ses_..." task="..." verifications="0">
Session ses_... is still open: task="...", verifications=0.

Before ending: either run mcp__semantic-vault__session_run with at
least one verification command (tests/lint), or call session_finish
with `verified: false` and a `reason` waiving verification (e.g.
doc-only edits). session_finish refuses without one of these paths.
</vault-session-close>
```

The hook does NOT auto-close the session — it surfaces the open state and asks you to handle it. A session that survives across Stop events stays open until you explicitly close it (or delete `session.json`).

## Concurrency: one session at a time

semantic-memory enforces **one session per project at a time**. `session_start` with a different task while a session is open returns an error. This matches brain's design — concurrent sessions add coordination complexity for unclear benefit.

If you genuinely need parallel work streams, run them in separate Claude Code sessions in separate project directories.

## Session staleness detection

If a session has been open for >24 hours with no activity, `session_status` reports `state: "stale"` (instead of `state: "active"`). The drift detection at SessionStart will also flag stale sessions.

Stale sessions usually mean someone abandoned the work. Recovery options:

1. **Resume:** call `session_run` (updates `last_activity_at`); the staleness goes away
2. **Close:** call `session_finish` (with whatever truthful state — usually `verified: false` + `reason: "abandoned"`)
3. **Discard:** `rm <project>/.claude/.semantic-memory/session.json`

## Common patterns

### Pattern: feature work with tests

```
session_start({ task: "add OAuth provider X" })
# ... edit code, write tests ...
session_run({ cmd: "npm test -- src/auth/" })   // unit
session_run({ cmd: "npm run test:e2e:auth" })   // e2e
session_run({ cmd: "npm run lint" })            // lint
session_run({ cmd: "npm run typecheck" })       // types
session_finish({ summary: "OAuth X provider added, all checks pass" })
```

### Pattern: bug fix with regression test

```
session_start({ task: "fix #432 (auth token expiration race)" })
session_run({ cmd: "npm test src/auth/token.test.ts" })     // shows failure
# ... fix code ...
session_run({ cmd: "npm test src/auth/token.test.ts" })     // shows pass
session_run({ cmd: "npm test" })                            // full suite
session_finish({ summary: "fix #432: token race resolved" })
```

### Pattern: doc-only with waiver

```
session_start({ task: "rewrite onboarding doc" })
# ... edit docs ...
session_finish({
  summary: "onboarding doc rewritten with v1.2 references",
  verified: false,
  reason: "doc-only changes; no test surface affected"
})
```

### Pattern: research that ends without code

```
session_start({ task: "research alternative MCP transports" })
# ... search_*, read_note, ingest_source for 5 sources ...
session_finish({
  summary: "evaluated 4 transports; findings filed via synthesize_note",
  verified: false,
  reason: "research session; outputs are vault notes not testable code"
})
```

## Sessions and modes

Sessions are orthogonal to modes. You can:

- Open a session in `vault-first` mode (most common)
- Open a session in `research` mode (uncommon — research mode is for unbounded exploration; sessions imply bounded work)
- Open a session in `outage-silence` (uncommon — outage usually means urgent fix; the verification step is your test that the fix works)

Mode-exit transition prompts (research → synthesis, outage → postmortem) and the session-close prompt can both fire at Stop. The session-close branch fires first; mode-exit prompts come after.

## See also

- [v1-stack-overview.md](../architecture/v1-stack-overview.md) — architectural context for v1.1 sessions
- [drift-detection.md](./drift-detection.md) — how `/healthcheck` surfaces stale sessions
- [contract-guide.md](./contract-guide.md) — AGENTS.md as the canonical session-aware contract
- [mcp-tools-reference.md](../reference/mcp-tools-reference.md) — full tool signatures for session_*
