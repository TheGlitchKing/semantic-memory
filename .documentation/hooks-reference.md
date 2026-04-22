# Hooks reference

> Three Claude Code hooks power the activation + capture loop. All three live in `hooks/vault-context.js` (plus the plugin-runtime `hooks/session-start.js` for MCP reconciliation).

## Hook registration

Plugins declare hooks via `hooks/hooks.json`. Installed plugins get merged into the user's `.claude/settings.json`.

Current `hooks/hooks.json`:
```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.js\"" },
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/vault-context.js\"" }
      ] }
    ],
    "UserPromptSubmit": [
      { "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/vault-context.js\"" }
      ] }
    ],
    "Stop": [
      { "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/vault-context.js\"" }
      ] }
    ]
  }
}
```

Composing two SessionStart hooks is safe: Claude Code merges `additionalContext` from multiple handlers.

---

## SessionStart — `handleSessionStart`

**Input JSON (from stdin):**
```json
{
  "hook_event_name": "SessionStart",
  "cwd": "<project root>"
}
```

**Actions (in order):**
1. Read current mode from `.claude/.sidekick-mode`.
2. Reset capture-pending (`.claude/.sidekick-capture-pending.json`).
3. Write mode to `vault-first`.
4. If prior mode was non-default → log `kind=mode_change` event.
5. Compute seed query: `"{project basename} {git branch with dashes→spaces}"`.
6. Run `search` CLI (hybrid) with seed query, limit 6, 30s timeout.
7. Run `log-query` CLI with `after=(now - 14 days)`, limit 30.
8. Format both into `<vault-state-since>` + `<vault-context source="sessionstart">` blocks.
9. Emit.

**Output JSON (shape per Claude Code schema):**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<...>"
  }
}
```

**Fails open.** Any error (no vault, no CLI, search timeout) becomes empty additionalContext — session proceeds without vault preload.

**Latency:** ~0.7s warm (parsed-doc cache + HNSW + graph load), ~6s cold (first run after reindex).

---

## UserPromptSubmit — `handlePrompt`

**Input JSON:**
```json
{
  "hook_event_name": "UserPromptSubmit",
  "prompt": "<user's prompt text>",
  "cwd": "<project root>"
}
```

**Actions:**
1. Bail early if `prompt.length < 8`.
2. Read mode. If `outage-silence` → emit empty context, return (mode contract).
3. Compute prompt fingerprint (sha1 of lowercased + whitespace-normalized, first 16 chars).
4. Read fingerprint ring from `.claude/.sidekick-fingerprints.json`. If fingerprint matches any of last 10 → suppress (no re-fire).
5. Run `search` CLI (hybrid) with prompt, limit 8, 30s timeout.
6. Append fingerprint to the ring, save.
7. Run capture-cue detection on the prompt. If matched → append to `.claude/.sidekick-capture-pending.json`.
8. Format hits into `<vault-context source="prompt">` block. Emit.

**Output JSON:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "<...>"
  }
}
```

**Fingerprint ring size:** 10. Rationale: covers same-question-rephrased-3-turns-later without persisting the full history.

**Capture cues (list):**
- `/\bbecause\b/i`
- `/\bdecided\b|\bwe chose\b|\bthe decision\b/i`
- `/\bturned out to be\b|\bthe bug was\b|\bthe fix was\b/i`
- `/\bgotcha\b|\bworkaround\b|\bhack\b/i`
- `/\bnew convention\b|\bfrom now on\b|\bgoing forward\b/i`

---

## Stop — `handleStop`

**Input JSON:**
```json
{
  "hook_event_name": "Stop",
  "cwd": "<project root>"
}
```

**Actions:**
1. Check `CLAUDE_STOP_HOOK_ACTIVE` env var — if `1`, reset pending + emit no-op `{}` (loop guard).
2. Read pending + mode.
3. Branch on mode:

| Mode | Condition | Emits |
|---|---|---|
| `research` | pending > 0 | `{"decision":"block", "reason":"<vault-transition-capture mode=\"research\">..."}` |
| `outage-silence` | always | `{"decision":"block", "reason":"<vault-transition-capture mode=\"outage-silence\">..."}` |
| `vault-first` | pending > 0 | `{"decision":"block", "reason":"<vault-capture-prompt count=\"N\">..."}` |
| any | nothing to capture | `{}` |

4. Reset pending file after emitting.

**Output shape (CRITICAL):** Stop hook does **NOT** use `hookSpecificOutput`. Stop-mode schema uses top-level fields only: `decision`, `reason`, `continue`, `stopReason`, `suppressOutput`. Emitting `hookSpecificOutput.hookEventName="Stop"` fails schema validation with "(root): Invalid input".

---

## Error handling (Phase 4.5)

Uncaught exceptions in `main()` trigger the global catch block:
1. Log to stderr (visible with `SIDEKICK_DEBUG=1`).
2. Log `kind=error` to log.md with `{ tool: "vault-context-hook", event, stack }` — first 6 stack lines, pipe-joined.
3. Emit empty safe response (`emit(eventName, "")` for SessionStart/UserPromptSubmit; `{}` for Stop).

**Consequence:** crashes are durable. Run `log_query({ kind: "error", limit: 10 })` after weird session behavior to see what failed silently.

---

## Runtime state files

| Path | Owner | Purpose | Gitignored |
|---|---|---|---|
| `.claude/.sidekick-mode` | `/mode` + SessionStart hook | Current mode name | Recommended |
| `.claude/.sidekick-fingerprints.json` | UserPromptSubmit | Ring buffer of recent prompt sha1s | Yes |
| `.claude/.sidekick-capture-pending.json` | UserPromptSubmit + Stop | Captured cues queued for Stop | Yes |
| `.claude/.semantic-sidekick-update-cache.json` | Plugin runtime | Auto-update policy cache | Yes |
| `.claude/.vault/` | Plugin runtime reconcile | Default vault path (auto-created) | No (user content) |

All project-local. SessionStart owns the reset lifecycle.

---

## Disabling / tuning

- **Disable entirely:** remove hook entries from `.claude/settings.json`.
- **Disable just UserPromptSubmit injection:** remove the UserPromptSubmit entry; SessionStart preload still runs at boot.
- **Disable Stop hook capture prompt:** set `.claude/.sidekick-mode` to a value not in `VALID_MODES` → hook sees it as default `vault-first` but pending stays empty if you also avoid cue-triggering prompts.
- **Force re-injection for a prompt:** `rm .claude/.sidekick-fingerprints.json`.
- **Clear mode:** `rm .claude/.sidekick-mode` (SessionStart recreates).
- **See what the hook is doing:** `SIDEKICK_DEBUG=1 claude` then expand hook lines with `ctrl+o`.
