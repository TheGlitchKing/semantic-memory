---
description: Verify the local install + run drift detection. Self-heals npx-cache ERR_MODULE_NOT_FOUND. Pass --fast to skip the slow tier, --fix to auto-apply safe fixes.
allowed-tools: Bash(npx:*), Bash(node:*)
---

When the user runs `/healthcheck`:

- `/healthcheck` (no arg) — Run the local install verification AND the full drift check (fast tier + slow tier). Report the results: install status, drift findings (if any), and remediation pointers (e.g. `/relink`, `/normalize-config`, `regenerate_contract`).
- `/healthcheck --fast` — Run the install verification + ONLY the fast-tier drift checks. Skips the full vault lint (slow tier). Use when the agent only wants quick install/manifest checks without the multi-second vault scan.
- `/healthcheck --fix` — Run drift detection, then auto-apply **safe** fixes for fixable findings and report what was done. Combinable with `--fast`.

The fast-tier auto-check also runs on every `SessionStart` via `vault-context.js` — healthy installs see nothing at session start, drifted installs see a one-block warning with a pointer to this command.

Implementation: shell out to `node ./node_modules/@theglitchking/semantic-memory/bin/semantic-memory healthcheck [--fast] [--fix]` (or `npx --no @theglitchking/semantic-memory healthcheck [...]` if no local install). Falls back to the legacy `@theglitchking/semantic-sidekick` package on machines mid-migration.

Drift findings are categorized by check (the `Fix?` column shows what `--fix` does automatically):
- `mcp_json_entry` — `.mcp.json` missing the semantic-memory server entry. **`--fix`: reconciles `.mcp.json`** (also `/normalize-config`).
- `hook_registration` — `.claude/settings.json` missing one of SessionStart/UserPromptSubmit/Stop. **`--fix`: re-links skills/hooks** (also `/relink`).
- `index_freshness` — No vector index built yet. **`--fix`: reindexes the vault.**
- `legacy_state_files` — Legacy `.claude/.sidekick-*` state files present. **`--fix`: runs `migrate-state`.**
- `skill_manifest:*` — Per-agent skill install state. **`--fix`: re-links skills** when flagged.
- `agents_contract` — `AGENTS.md` exists but lacks managed-block markers. **Not auto-fixed** (needs a human decision — move custom content to a `Local Notes` section, or delete and re-run `regenerate_contract`).
- `session_staleness` — A session has been open >24h with no activity. **Not auto-fixed** (resume via `session_run` / `session_finish`, or remove the stale session file).
- `lint_vault` (slow tier only) — Vault lint findings. **Not auto-fixed** — stale notes, broken wikilinks, and schema violations require human review.

`--fix` is intentionally conservative: it only applies idempotent, non-destructive fixes derivable from the install itself. Anything touching user-authored content is reported for human review, never auto-changed. After applying fixes it re-runs drift detection so the printed findings reflect the post-fix state.
