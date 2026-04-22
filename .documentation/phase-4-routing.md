# Phase 4 — Routing + Transitions

> Three modes compete as the top-level router: `vault-first` (default), `research`, `outage-silence`. The skill descriptions are the classifier — no separate model call. The Stop hook is mode-aware: exiting `research` or `outage-silence` forces a synthesis/postmortem artifact before the session can close.

## What Phase 4 adds

1. **`research-mode` skill** — aggressive-vault behavior for sustained investigation sessions. Every source gets filed, every finding gets synthesized on exit.
2. **`outage-silence` skill** — incident mode. Suppresses all proactive vault activity, goes terse, forces a postmortem on exit.
3. **`/mode` slash command** — explicit mode setter. Writes `.claude/.sidekick-mode`, emits transition-capture prompts when exiting research or outage.
4. **`/vault` slash command** — explicit vault query that bypasses mode suppression (works even during outage-silence).
5. **Visible mode indicator rule** (in CLAUDE.md) — responses in `research` / `outage-silence` prefix with `[research]` / `[outage]`.
6. **Mode-aware hooks** — UserPromptSubmit suppresses auto-search in `outage-silence`; Stop emits mode-specific transition capture (research-synthesis / outage-postmortem / generic-capture).
7. **SessionStart resets mode to `vault-first`** — time-based reset only at session boundary, per the plan's "decay is relevance-based, not time-based within session."

## Invocation surfaces

| Action | Surface |
|---|---|
| Explicit mode set | `/mode research` \| `/mode vault-first` \| `/mode outage-silence` \| `/mode status` |
| Explicit vault query (always works) | `/vault <natural-language query>` |
| Read current mode (scripting) | `cat .claude/.sidekick-mode` (default `vault-first` if missing) |
| Implicit mode entry | Skill descriptions trigger on conversational cues — research cues enter research-mode, outage cues enter outage-silence |

## Under the hood

### Mode file — `.claude/.sidekick-mode`

- Single line, one of `vault-first` / `research` / `outage-silence`.
- Source of truth for hook-level routing decisions.
- Reset to `vault-first` at every SessionStart (enforced by `hooks/vault-context.js` → `handleSessionStart`).
- Written by `/mode` (user explicit), or by Claude itself when visibly switching based on strong signal.

### Skill routing

Each skill's `description:` field is the classifier. Claude evaluates skill descriptions against the current conversation to decide which one applies. Strong signals (pasted stack traces, multiple source links, explicit `/mode`) override weaker lexical signals.

Asymmetric cost-of-error (per plan):
- `outage-silence` enters on weaker signal (false-positive cheap, false-negative expensive — vault noise during a fire).
- `research` requires strong signal (multiple sources OR explicit language), because its behavioral change is heavyweight.
- `vault-first` is the default when neither fires.

### Hook wiring (`hooks/vault-context.js`)

New helpers:
- `readMode(projectRoot)` — returns current mode, defaulting to `vault-first`.
- `writeMode(projectRoot, mode)` — atomic write with validation against the `VALID_MODES` set.

Behavior deltas:
- `handleSessionStart` now writes `vault-first` to the mode file before doing its normal preload.
- `handlePrompt` now reads the mode at the top; if `outage-silence`, emits an empty context block and exits immediately — no search, no capture, no latency.
- `handleStop` branches on mode:
  - `research` + `pending.length > 0` → emits `<vault-transition-capture mode="research">` with the pending items listed, plus an instruction to call `synthesize_note` with `dry_run: true`. `decision: "block"`.
  - `outage-silence` → emits `<vault-transition-capture mode="outage-silence">` with the postmortem drafting instructions. `decision: "block"`. Fires regardless of capture-pending (the whole session was vault-silent by design).
  - `vault-first` (default) → the Phase 2 generic `<vault-capture-prompt>` if pending items exist, else a no-op emit.
- All branches reset `.claude/.sidekick-capture-pending.json` after emitting so the prompt doesn't loop.
- Loop guard: `CLAUDE_STOP_HOOK_ACTIVE=1` short-circuits the Stop handler — Claude is already mid-response to our prior block; don't re-block.

### `/mode` command behavior (`commands/mode.md`)

The command file is a prompt template that tells Claude to:
1. Parse `$ARGUMENTS`.
2. Read the current mode.
3. If exiting `research` → emit the synthesis prompt before switching (don't silently drop findings).
4. If exiting `outage-silence` → emit the postmortem prompt before switching.
5. Write the new mode.
6. Report the transition as `mode: <old> → <new>`.

The command-level transition capture is belt-and-suspenders to the Stop-hook-level transition capture: either path lands you at synthesis/postmortem before the mode actually changes.

### `/vault` command (`commands/vault.md`)

Minimal: runs `search_hybrid` + `read_note` with no mode side effects. The one sanctioned way to read the vault during outage-silence without violating the mode contract.

## Visible mode indicator

CLAUDE.md rule instructs Claude to prefix the first line of responses with `[research]` or `[outage]` when those modes are active. `vault-first` is unmarked (it's the default).

The indicator serves two purposes:
- Lets the user catch mis-routing immediately ("why is it in `[outage]` — I just asked a documentation question?") and correct via `/mode`.
- Lets the user know Claude is deliberately being terse during `[outage]` rather than broken.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Session starts in research or outage-silence | Mode file persisted from prior session | Intentional — SessionStart hook resets it. If the reset didn't run, check `.claude/settings.json` has the SessionStart hook registered |
| `[outage]` prefix on an ordinary question | Conversational cue over-fired (e.g., "my test is broken") | User runs `/mode vault-first` to override explicitly; or Claude uses the visible indicator + a sentence of explanation to exit. Skill description weighs "test is broken" as weak signal — should not actually trigger; if it does, refine the skill |
| Stop hook blocks forever with postmortem prompt | Loop guard missing or wrong env var | `CLAUDE_STOP_HOOK_ACTIVE=1` breaks the loop — Claude Code sets this automatically. If you see a loop in a non-Claude-Code harness, mimic the env var |
| `/vault` call during outage-silence injects a giant context block | `/vault` is a command, it runs `search_hybrid` + `read_note` directly in Claude's context; hook-level suppression doesn't apply | This is the intended behavior — the user explicitly asked. Keep the `/vault` response tight |
| Mode stays stuck in `outage-silence` because the user forgot to `/mode vault-first` | Mode persists until explicitly changed | Next SessionStart will reset. For in-session reset, user can `/mode vault-first` or `/mode status` shows the current state |
| Research-mode exits without synthesis despite the prompt | Claude received the block but declined (or the user dismissed it) | The Stop hook already reset the pending file after emitting — the prompt doesn't retry. Session ends with findings unsynthesized; this is the known lossy case. Phase 5 could add stricter enforcement; Phase 4 treats the prompt as advisory-with-teeth |

## Tests

- `test/phase4/mode-hook.test.ts` (5 cases) — SessionStart reset, UserPromptSubmit suppression in outage, Stop branching per mode, vault-first fallback behavior.
- Full suite: **178/178** tests passing (173 prior + 5 new).

## Phase 4 scope boundaries

- **Signal weighting is in prose, not code.** The skill descriptions carry the routing logic. No separate classifier, no YAML weights. Per plan — "skill descriptions ARE the router".
- **Hysteresis is informal.** The research-mode description says "once entered, stays through topic shifts until explicit exit or session end". No explicit decay counter in code.
- **Mode transitions via conversation are advisory.** If Claude enters `[outage]` based on signal but the user disagrees, `/mode` is the override. No automatic rollback.
- **No stage-before-synthesis enforcement** — Phase 5's calibration ritual could measure "how often does the synthesis actually get filed on research exit" and tighten from there.

## Commit boundary

Phase 4 ships as a single commit on `feat/sidekick-layers`:
`feat(phase-4): routing + transitions — research/outage mode skills, /mode, /vault, mode-aware hooks`.
