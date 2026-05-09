---
description: Verify the local install + run drift detection. Self-heals npx-cache ERR_MODULE_NOT_FOUND. Pass --fast to skip the slow tier (full vault lint).
allowed-tools: Bash(npx:*), Bash(node:*)
---

When the user runs `/healthcheck`:

- `/healthcheck` (no arg) — Run the local install verification AND the full drift check (fast tier + slow tier). Report the results: install status, drift findings (if any), and remediation pointers (e.g. `/relink`, `/normalize-config`, `regenerate_contract`).
- `/healthcheck --fast` — Run the install verification + ONLY the fast-tier drift checks. Skips the full vault lint (slow tier). Use when the agent only wants quick install/manifest checks without the multi-second vault scan.

The fast-tier auto-check also runs on every `SessionStart` via `vault-context.js` — healthy installs see nothing at session start, drifted installs see a one-block warning with a pointer to this command.

Implementation: shell out to `node ./node_modules/@theglitchking/semantic-memory/bin/semantic-memory healthcheck [--fast]` (or `npx --no @theglitchking/semantic-memory healthcheck [--fast]` if no local install). Falls back to the legacy `@theglitchking/semantic-sidekick` package on machines mid-migration.

Drift findings are categorized by check:
- `mcp_json_entry` — `.mcp.json` missing the semantic-memory server entry. Fix: `/normalize-config`.
- `hook_registration` — `.claude/settings.json` missing one of SessionStart/UserPromptSubmit/Stop. Fix: `/relink` or reinstall.
- `agents_contract` — `AGENTS.md` exists but lacks managed-block markers. Fix: move custom content to a `Local Notes` section, or delete and re-run `regenerate_contract`.
- `session_staleness` — A session has been open >24h with no activity. Fix: resume (run `session_run` / `session_finish`) or remove the stale session file.
- `index_freshness` — No vector index built yet. Fix: call `reindex`.
- `skill_manifest:*` — Per-agent skill install state. Informational unless missing.
- `lint_vault` (slow tier only) — Vault lint findings. Many require human review (stale notes, broken wikilinks).

`--fix` flag is reserved for v1.2 — auto-applying safe fixes (re-link skills, reconcile `.mcp.json`, regenerate contract) is the planned v1.2 work. For v1.1, drift detection is read-only and points the user at the right manual command.
