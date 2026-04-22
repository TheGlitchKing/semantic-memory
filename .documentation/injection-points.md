# Injection points — everywhere sidekick touches Claude's context

> Four mechanisms put vault-derived content into Claude's working memory. Understanding which one is firing for a given symptom is 80% of troubleshooting.

## 1. SessionStart hook — `<vault-state-since>` + `<vault-context>` blocks

**When:** every session boot.
**Source:** `hooks/vault-context.js` → `handleSessionStart`.
**Output shape:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<vault-state-since ...>...</vault-state-since>\n\n<vault-context source=\"sessionstart\" query=\"<seed>\">...</vault-context>"
  }
}
```
**Two blocks composed:**
- `<vault-state-since>` — 14-day summary of log.md kinds + the 6 most recent entries. Lets future-Claude see what past-Claude was doing.
- `<vault-context source="sessionstart">` — hybrid search results seeded from `{project basename} {git branch}`.

**Side effects:**
- Resets `.claude/.sidekick-mode` to `vault-first`.
- If prior mode was non-default, logs `kind=mode_change` event so the reset is visible in log.md.

**Latency:** ~0.7s on cache hit, ~6s on cache miss.

## 2. UserPromptSubmit hook — `<vault-context source="prompt">` block

**When:** every user prompt, except:
- Mode is `outage-silence` (hard-suppressed — see Layer 5 contract).
- Prompt is <8 characters.
- The prompt's normalized sha1 is in the fingerprint ring (last 10 prompts) — avoids re-injecting the same context for rephrased questions.

**Source:** `hooks/vault-context.js` → `handlePrompt`.
**Output shape:** identical to SessionStart but with `source="prompt"` and `query="<user prompt>"`.

**Side effect:** capture-cue detection. If the prompt matches one of:
- `\bbecause\b`
- `\bdecided\b | \bwe chose\b | \bthe decision\b`
- `\bturned out to be\b | \bthe bug was\b | \bthe fix was\b`
- `\bgotcha\b | \bworkaround\b | \bhack\b`
- `\bnew convention\b | \bfrom now on\b | \bgoing forward\b`

…the prompt excerpt + cue is appended to `.claude/.sidekick-capture-pending.json` for the Stop hook to consume.

**Fingerprint cache:** `.claude/.sidekick-fingerprints.json` — ring buffer of 10 sha1 hashes. Cleared on Phase 1 test runner invocation; otherwise persists across prompts within a session and across sessions.

## 3. Stop hook — `decision: "block"` with mode-specific reason

**When:** every session close, if capture is warranted.
**Source:** `hooks/vault-context.js` → `handleStop`.
**Output shape (blocking):**
```json
{
  "decision": "block",
  "reason": "<vault-transition-capture mode=\"research\">...</vault-transition-capture>"
}
```

Stop hook **does NOT use** `hookSpecificOutput` — Claude Code's schema rejects it for Stop. Top-level `decision` + `reason` only.

**Three variants:**

| Mode | Trigger | Reason block |
|---|---|---|
| `research` | pending.length > 0 | `<vault-transition-capture mode="research">` — synthesize_note dry-run instruction |
| `outage-silence` | always (end of outage) | `<vault-transition-capture mode="outage-silence">` — postmortem draft instruction |
| `vault-first` | pending.length > 0 | `<vault-capture-prompt>` — generic "name each item, file or acknowledge" |

**Non-blocking emit:** `{}` (empty object) — Stop hook schema validates this as valid no-op.

**Loop guard:** `CLAUDE_STOP_HOOK_ACTIVE=1` env var short-circuits — Claude is already mid-response to our prior block; don't re-block.

## 4. Skill descriptions (always active, no hook involvement)

**When:** Claude evaluates which skill to use on every turn. This is the LLM-level routing layer, not a hook.

**Sources:**
- `skills/vault-first/SKILL.md` — default mode; triggers on project-scoped prose questions.
- `skills/research-mode/SKILL.md` — aggressive vault; triggers on "I'm researching", multiple sources, explicit `/mode research`.
- `skills/outage-silence/SKILL.md` — incident mode; triggers on "down", "broken", "customers", pasted stack traces, or explicit `/mode outage-silence`.
- `skills/semantic-first/SKILL.md` — inherited from plugin substrate; covers docs lookup + research-notes routing.

**Contract:** the `description:` YAML field in each SKILL.md is the classifier. Strong signals beat weak; explicit `/mode` is ground truth regardless of cues.

**No file on disk captures "current active skill"** — it's evaluated per-turn by Claude. The mode file captures the *mode*, which is a stronger behavioral anchor than which skill is active.

## 5. CLAUDE.md project rule (always-loaded context)

**When:** every session. Claude Code loads `.claude/CLAUDE.md` as project-level system prompt.
**Source:** `.claude/CLAUDE.md` — has two sidekick-owned rule blocks:
- **Vault-first rule** — cite-or-deflect contract for project questions.
- **Routing / mode indicator rule** — visible `[research]` / `[outage]` prefix, transition-capture requirement, `/vault` always respected.

**Contract:** these rules are the backstop when skill descriptions fail to fire or the hook injected no context.

## 6. Slash commands (`/mode`, `/vault`)

**When:** user types `/mode ...` or `/vault ...`.
**Source:** `commands/mode.md`, `commands/vault.md` — markdown files with frontmatter declaring `description`, `argument-hint`, `allowed-tools`.

**Mechanism:** Claude Code interprets the command file as a prompt template, substitutes `$ARGUMENTS`, and runs the body as instructions Claude follows.

**Effects:**
- `/mode` — writes `.claude/.sidekick-mode`, emits transition-capture prompts on research/outage exit, reports transition visibly.
- `/vault` — runs `search_hybrid` + `read_note`, works in any mode including outage-silence.

## Summary — debugging "why didn't X happen?"

| Symptom | First check |
|---|---|
| No vault context at session start | `SIDEKICK_DEBUG=1 claude` — look for `[vault-context] event=SessionStart` in stderr; verify `.mcp.json` points at a real vault path |
| Vault context appears but seems stale | Rebuild index — `semantic-sidekick --notes <vault> --reindex` |
| No injection on a prompt that should trigger it | Fingerprint collision — `cat .claude/.sidekick-fingerprints.json` and check if your prompt's sha1 is there, or mode is outage-silence — `cat .claude/.sidekick-mode` |
| Stop hook doesn't fire capture prompt | Check `.claude/.sidekick-capture-pending.json` — empty = no cues matched the session's prompts |
| Claude doesn't cite notes | vault-first skill didn't fire — check `ls .claude/skills/vault-first` (should be symlink to `skills/vault-first`); CLAUDE.md rule may also be missing |
| `[outage]` prefix on non-incident turn | `cat .claude/.sidekick-mode`; if it says `outage-silence`, run `/mode vault-first` |
| `/mode` command doesn't persist | Permission issue writing to `.claude/.sidekick-mode` — check the command ran via `/mode status` afterward |
