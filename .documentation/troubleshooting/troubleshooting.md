---
title: Troubleshooting
tier: guide
domains: [troubleshooting]
audience: [developers]
tags: [troubleshooting, debugging, failure-modes, diagnostics]
status: active
last_updated: '2026-04-23'
version: '0.2.3'
purpose: Symptom / cause / fix across all 5 layers — golden diagnostic sequence
load_priority: 9
---

# Troubleshooting

> Known failure modes across all five layers. Each has a symptom, a likely cause, and a specific diagnostic command. This doc covers the full sidekick stack; the legacy substrate-only troubleshooting lives at the bottom.

## Installation + plugin runtime

### "plugin not found" after `/plugin install semantic-sidekick`
- **Cause:** marketplace wasn't added, or the plugin name in the marketplace doesn't match.
- **Check:** `cat .claude-plugin/marketplace.json` — the `plugins[0].name` must match what you ran `/plugin install` with.
- **Fix:** `/plugin marketplace list` confirms registration; `/plugin marketplace add <url>` re-adds.

### `.mcp.json` shows npx-form instead of local-bin form
- **Cause:** pre-0.10.0 SessionStart hook wrote a fragile form; reconcile hook runs only on new sessions.
- **Fix:** `semantic-sidekick normalize-config [--dry-run]` rewrites to stable form. Backs up to `.mcp.json.bak` and verifies the binary starts before committing.

### `ERR_MODULE_NOT_FOUND` on first MCP call
- **Cause:** corrupted npx cache (classic failure mode that triggered 0.10.0).
- **Fix:** `semantic-sidekick healthcheck` auto-heals by rm-rf'ing the bad cache dir and retrying. Manual: `rm -rf ~/.npm/_npx/*/node_modules/@theglitchking`.

### "No vault found" on SessionStart
- **Cause:** `.mcp.json` missing or `semantic-vault` entry not present.
- **Check:** `grep -A5 semantic-vault .mcp.json`.
- **Fix:** restart Claude Code; reconcile hook writes `.mcp.json` on SessionStart. If that fails, check `hooks/session-start.js` is wired in `.claude/settings.json`.

---

## Index + search

### Search CLI fails with "index not built"
- **Cause:** `.semantic-sidekick-index/` missing or incomplete.
- **Fix:** `semantic-sidekick --notes <vault> --reindex`.

### Search results are stale (new notes not surfacing)
- **Cause:** parsed-doc cache is from a prior reindex; watcher didn't catch the add.
- **Check:** `cat <vault>/.semantic-sidekick-index/meta.json` — look at `indexedAt`.
- **Fix:** `semantic-sidekick --notes <vault> --reindex` rebuilds both the vector index and the parsed-doc cache.

### Hook latency is 6+ seconds per prompt
- **Cause:** parsed-doc cache missing; indexer re-parses all notes per call.
- **Check:** `ls -la <vault>/.semantic-sidekick-index/docs.cache.json`.
- **Fix:** run `--reindex` once; subsequent hook calls load the cache (~0.7s).

### Model mismatch error on search
- **Cause:** changed `--model` value without reindexing; cached embeddings are invalid.
- **Fix:** `--reindex` regenerates embeddings with the current model.

### HNSW / embedder fails to initialize
- **Cause:** missing native dependencies (`hnswlib-node`, `onnxruntime-node`).
- **Fix:** `npm install` in the plugin dir; if onnxruntime-node fails to build, falls back to onnxruntime-web automatically.

---

## Hooks

### Stop hook error: "Hook JSON output validation failed — (root): Invalid input"
- **Cause:** hook emitted `hookSpecificOutput` for the Stop event. Stop schema only accepts top-level fields (`decision`, `reason`, `continue`, `stopReason`, `suppressOutput`).
- **Fix:** already fixed in commit `183aa30`. If you still see it, you're on an older build — `git pull` and `npm run build`.

### Hook doesn't fire at all
- **Check 1:** `.claude/settings.json` has `hooks.SessionStart[0].hooks[0].command` pointing at `vault-context.js`.
- **Check 2:** `node hooks/vault-context.js` runs without error (from the repo root).
- **Check 3:** Claude Code sees the plugin — `/hooks` command in a live session lists registered hooks.

### Hook fires but no context is injected
- **Cause:** hook failed silently (fails-open design). Most likely: no vault configured, search CLI errored, or hook timeout.
- **Fix:** run with `SIDEKICK_DEBUG=1 claude` and expand the hook line with `ctrl+o` — stderr shows exactly where it bailed.

### SessionStart fires but `<vault-state-since>` is missing
- **Cause:** `log-query` CLI failed. Check for a `kind=error` entry from a prior session.
- **Fix:** `semantic-sidekick log-query --notes <vault>` manually — if that errors, you've diagnosed it.

### UserPromptSubmit hook not firing on prompts that should match
- **Cause 1:** mode is `outage-silence` — hook intentionally suppresses.
- **Cause 2:** fingerprint collision — this prompt (or a near-duplicate) was asked recently.
- **Check:** `cat .claude/.sidekick-mode` + `cat .claude/.sidekick-fingerprints.json`.
- **Fix:** `/mode vault-first` to exit outage; `rm .claude/.sidekick-fingerprints.json` to clear dedupe.

### Capture-on-close doesn't fire
- **Cause:** `.sidekick-capture-pending.json` is empty — no cue matched this session's prompts.
- **Check:** `cat .claude/.sidekick-capture-pending.json` mid-session (before Stop) to verify cues were detected.
- **If detected but Stop still doesn't block:** check `SIDEKICK_DEBUG=1` output for stop-hook exit path (loop guard, mode, etc.).

### Stop hook loops
- **Cause:** `CLAUDE_STOP_HOOK_ACTIVE` env var missing in your harness.
- **Fix:** In Claude Code proper, this is set automatically. For other harnesses, set it when re-invoking after a block response.

---

## Skills + modes

### Skill doesn't activate when expected
- **Check:** `ls -la .claude/skills/` — each skill directory should be present as a symlink to `skills/<name>/`.
- **Fix (dev):** `ln -sfn ../../skills/<name> .claude/skills/<name>`.
- **Fix (installed plugin):** re-run `npm install` or `/plugin install semantic-sidekick` — link-skills.js recreates symlinks.

### `[research]` / `[outage]` prefix appears on wrong turns
- **Cause:** skill description's entry signals are too permissive.
- **Immediate fix:** `/mode vault-first` to override.
- **Long-term:** file a misfire as a gotcha note; tune the skill's `description` field to demote the specific false-positive trigger.

### `/mode` appears to write but subsequent hooks don't see the change
- **Check:** `cat .claude/.sidekick-mode` after `/mode research`.
- **Cause:** the command file relies on Claude executing the bash to write the file. If Claude skipped that step, the mode isn't persisted.
- **Fix:** rerun `/mode research` and confirm the bash runs; or manually `printf 'research' > .claude/.sidekick-mode`.

### `/vault <query>` returns nothing
- **Cause:** index may be empty or query has no matches.
- **Check:** `semantic-sidekick --notes <vault> --stats` shows note count.
- **Fix:** add notes; `--reindex`; try a broader query.

---

## Schema + lint

### apply_patch rejects every create with `missing required field "title"`
- **Cause:** `crud.update` with `mode: overwrite` discards existing frontmatter; the "new content" has no title.
- **Fix:** use `patch-by-heading` or include YAML frontmatter in the new content block.

### Lint shows errors on notes that *look* valid
- **Check:** field name typos (`tittle:`), enum value mismatch (`status: published` when enum is `[draft, active, ...]`).
- **Fix:** `semantic-sidekick lint --notes <vault> --json | jq '.byRule.schema_violations'` shows the exact message per file.

### Pre-commit hook blocks despite me wanting to commit a WIP
- **Fix:** `SKIP_VAULT_LINT=1 git commit ...` — documented in `scripts/pre-commit-lint.sh`.

### Broken-link lint flags legitimate links
- **Cause:** target note name has a different basename than the `[[wikilink]]` text.
- **Fix:** rename the link to match, or rename the target file to match.

---

## Capture + synthesis

### synthesize_note rejects with validation errors
- **Cause:** the proposed frontmatter fails schema validation (missing title, bad status, etc.).
- **Check:** the tool's response body has `result.lint[]` with specific findings.
- **Fix:** pass the missing/correct fields. Re-try with `dry_run: true` to confirm.

### Auto-wikilinks aren't inserted in synthesized notes
- **Cause:** `related_notes` entries don't match a plain-text occurrence in the body (case-sensitive or code-block).
- **Fix:** use exact basename or edit the body manually after synthesis.

### ingest_source creates a duplicate source-note
- **Cause:** reused `source_title` but new slugified `source_path` — pre-check thought it was a new note.
- **Fix:** pass `source.source_path` explicitly to point at the existing source-note.

---

## Logs

### log.md doesn't exist after several ingests
- **Cause:** `logEvent` silently failed (disk full, permissions, read-only filesystem).
- **Check:** `touch <vault>/log.md` — if permission denied, that's the issue.
- **Fix:** fix filesystem perms. Prior events are lost; future events will resume.

### log_query returns empty despite log.md having entries
- **Cause:** entries were added in a format other than the one our writer produces (e.g., hand-edited with different YAML structure).
- **Check:** open log.md, verify entries have ```yaml event fenced blocks.
- **Fix:** use `mcp__semantic-vault__log_event` (or the CLI equivalent) to append; those emit the exact parseable shape.

### State-delta preload shows "No logged activity" despite recent activity
- **Cause:** window is 14 days; entries older than that don't appear. Or timestamps are inconsistent (UTC vs local).
- **Check:** `semantic-sidekick log-query --notes <vault> --limit 5` — shows what the parser sees.

---

## The golden diagnostic sequence

When something feels off and you don't know where to start:

```bash
# 1. Current mode
cat .claude/.sidekick-mode

# 2. Pending captures
cat .claude/.sidekick-capture-pending.json

# 3. Recent errors
semantic-sidekick log-query --notes <vault> --kind error --limit 10

# 4. Vault health
semantic-sidekick lint --notes <vault> --json | jq '.counts'

# 5. Index freshness
cat <vault>/.semantic-sidekick-index/meta.json

# 6. Full debug on next session
SIDEKICK_DEBUG=1 claude
```

If steps 1-5 all look reasonable and step 6 shows the hook reaching its intended exit path, the system is operating correctly and the user-visible behavior is a tuning question (probably a skill description), not a bug.

---

## Legacy substrate troubleshooting

These are original `semantic-pages` diagnostics, preserved for substrate-level issues. For anything sidekick-specific, prefer the sections above.

### Vault/index mismatch
```bash
# Show current model + indexed-at timestamp
cat <vault>/.semantic-sidekick-index/meta.json

# Re-embed with a specific model
semantic-sidekick --notes <vault> --reindex --model nomic-ai/nomic-embed-text-v1.5
```

### Performance tuning
See [performance-tuning.md](../legacy/performance-tuning.md) for worker count, batch size, and quantization tradeoffs.

### Embedder options
See [embedder-guide.md](../legacy/embedder-guide.md).
