---
title: Installation Guide
tier: guide
domains: [quickstart]
audience: [developers]
tags: [install, setup, plugin, npm]
status: active
last_updated: '2026-04-23'
version: '0.2.3'
purpose: Three install routes (plugin / npm / dev), post-install housekeeping, uninstall
load_priority: 10
---

# Installation guide

> From zero to a running semantic-sidekick in your project. Three routes: plugin install (recommended), npm install (bare), and dev (contributing to this repo).

## Prerequisites

- Node.js ≥ 18.
- Claude Code CLI or a compatible MCP client.
- A directory to serve as the vault (can be empty — a starter schema will be installed).

## Route A — Claude Code plugin (recommended)

This is the packaged path. Everything auto-wires.

### 1. Add the marketplace

In Claude Code, run:
```
/plugin marketplace add https://github.com/TheGlitchKing/semantic-sidekick
```

(Replace with the actual repo URL if you've forked or published to a different remote.)

### 2. Install the plugin

```
/plugin install semantic-sidekick
```

On install:
- `node_modules/@theglitchking/semantic-sidekick/` is added to the project.
- `scripts/link-skills.js` runs via postinstall — symlinks `skills/{vault-first, research-mode, outage-silence, semantic-first}` into `.claude/skills/`.
- `hooks/hooks.json` declares SessionStart + UserPromptSubmit + Stop hooks → merged into your `.claude/settings.json` via the plugin runtime.
- Slash commands `/mode` and `/vault` are registered from `commands/`.

### 3. First session

On the next `claude` invocation, the SessionStart hook fires:
- `hooks/session-start.js` reconciles `.mcp.json` — auto-adds a `semantic-vault` entry pointing at `.claude/.vault/` (or a path you've set).
- `hooks/vault-context.js` resets `.claude/.sidekick-mode` → `vault-first`.

### 4. Set your vault path (optional)

By default the reconciler writes `--notes ./.claude/.vault`. To use a different vault, edit `.mcp.json`:

```json
{
  "mcpServers": {
    "semantic-vault": {
      "type": "stdio",
      "command": "node",
      "args": [
        "./node_modules/@theglitchking/semantic-sidekick/bin/semantic-sidekick",
        "--notes",
        "/absolute/or/relative/path/to/vault"
      ]
    }
  }
}
```

The reconcile hook preserves manually-edited entries — it only rewrites entries it wrote itself.

### 5. Install the schema (optional but recommended)

```bash
npx semantic-sidekick install-schema --notes /path/to/vault
```

Writes `vault.schema.yml` with the default 4-type schema. Without this, lint runs against the bundled default. With a local file, you can customize types, enums, and lint thresholds.

### 6. First reindex

```bash
npx semantic-sidekick --notes /path/to/vault --reindex
```

Downloads the ONNX model (first time, ~90MB), indexes all `*.md` files. Writes `.semantic-sidekick-index/` with vector/graph/text indexes + parsed-doc cache. Required before hook-driven search works at low latency.

Subsequent sessions use the cached index; reindex is only needed when notes change in bulk or the model is swapped.

### 7. Verify

In a Claude session:

1. Check the hook fired — expand a `ctrl+o` on the hook line, look for `<vault-state-since>` + `<vault-context>` blocks.
2. `/mode status` — should print `current mode: vault-first`.
3. Ask a project question — Claude should call `mcp__semantic-vault__search_hybrid`.

---

## Route B — npm install (no Claude Code plugin system)

For using `semantic-sidekick` as a standalone CLI + MCP server without the plugin runtime.

### 1. Install
```bash
npm install @theglitchking/semantic-sidekick
```

### 2. Run the MCP server
```bash
npx semantic-sidekick --notes /path/to/vault
```

### 3. Wire into your MCP client
Point your client at `node ./node_modules/@theglitchking/semantic-sidekick/bin/semantic-sidekick --notes /path/to/vault` as a stdio command.

### 4. Install the CLI globally (optional)
```bash
npm install -g @theglitchking/semantic-sidekick
# then: semantic-sidekick --help
```

Route B gives you the 33 MCP tools but NOT the activation hooks, mode skills, or slash commands — those are plugin-only.

---

## Route C — Development (contributing to this repo)

### 1. Clone
```bash
git clone https://github.com/TheGlitchKing/semantic-sidekick
cd semantic-sidekick
```

### 2. Install dependencies
```bash
npm install
```

### 3. Build
```bash
npm run build
```

### 4. Run tests
```bash
npm test             # full vitest suite
npm run lint         # tsc --noEmit typecheck
```

### 5. Point a vault at this repo's CLI
Edit `.mcp.json` (gitignored):
```json
{
  "mcpServers": {
    "semantic-vault": {
      "type": "stdio",
      "command": "node",
      "args": ["./dist/cli/index.js", "--notes", "/path/to/test/vault"]
    }
  }
}
```

### 6. Run the Phase 1 activation test suite
```bash
node test/phase1/run.js
```

Expects `/home/tmarlette/workspace/the-glitch-kingdom/sidekick-test-vault/` or override via `vaultPath` in `test/phase1/prompts.json`.

### 7. Active development loop
```bash
npm run dev    # tsup in watch mode
```

In another terminal, run `claude` from the repo root — it picks up `hooks/vault-context.js` via `.claude/settings.json`.

---

## Post-install housekeeping

### Gitignore your runtime state
If you're tracking the vault in git, add these to `.gitignore`:
```
.claude/.sidekick-mode
.claude/.sidekick-fingerprints.json
.claude/.sidekick-capture-pending.json
.claude/.semantic-sidekick-update-cache.json
.semantic-sidekick-index/
.mcp.json
```

`log.md` SHOULD be committed — it's the durable record.

### Pre-commit hook (vault repos)
Only if you're using git to manage the vault itself:
```bash
cp node_modules/@theglitchking/semantic-sidekick/scripts/pre-commit-lint.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Blocks commits on schema errors; warns on stale / missing provenance / broken links.

### Start with the CLI to get feel
```bash
semantic-sidekick --help
semantic-sidekick tools        # lists all 33 MCP tools
semantic-sidekick lint --notes <vault>
semantic-sidekick log-query --notes <vault> --limit 10
```

These are the same interfaces the hooks use. Getting comfortable with the CLI makes hook behavior predictable.

---

## Uninstall

### From Claude Code
```
/plugin uninstall semantic-sidekick
```

Removes the package and skill symlinks. Does NOT touch `.mcp.json` or your vault — those are yours.

### Manual
```bash
npm uninstall @theglitchking/semantic-sidekick
rm -rf .claude/skills/{vault-first,research-mode,outage-silence,semantic-first}
# Optionally clean up hooks in .claude/settings.json
```

Vault and log.md persist. The vault is yours; the tool is just a layer.
