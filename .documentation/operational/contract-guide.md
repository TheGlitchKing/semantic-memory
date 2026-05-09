---
title: AGENTS.md contract guide
tier: guide
domains: [operational]
audience: [developers, admin]
tags: [agents-md, contract, managed-block, regenerate-contract, v1.1]
status: active
last_updated: '2026-05-09'
version: '1.2.0'
purpose: Operational guide to the AGENTS.md contract artifact. When to generate it, what it contains, how managed blocks work, what stays vs. regenerates, and how it interacts with CLAUDE.md.
load_priority: 7
---

# AGENTS.md contract guide

`AGENTS.md` is the canonical, versionable agent contract for a project. It lives at the project root (next to `package.json`, not inside `.claude/`). Agents read it first to understand what semantic-memory is offering, what modes are active, and what workflow the project expects.

`AGENTS.md` is **opt-in**. The plugin doesn't create it automatically. Generate it via `regenerate_contract` (MCP tool) or `/contract refresh` (slash command).

## What's in AGENTS.md

```markdown
---
generated_by: semantic-memory
version: 1.2.0
last_generated: 2026-05-09T14:30:00Z
---

# Project Agent Contract

<!-- semantic-memory:begin contract -->

## Active Modes
- **vault-first** (default) — Project-scoped prose questions trigger vault consultation with cite-or-deflect.
- **research** — Every source introduced is filed via ingest_source; mandatory synthesize_note on exit.
- **outage-silence** — No proactive vault search. Terse responses. Postmortem synthesize_note on exit.

## Required Workflow
1. For multi-step work that needs verification, open a session: `session_start({task})`.
2. Use mode-aware retrieval: `search_hybrid`, `read_note`, `list_notes`, `backlinks`/`forwardlinks`.
3. Make durable updates via `apply_patch` or `synthesize_note` — never bypass the patch layer for multi-note edits.
4. Run verification commands inside a session: `session_run({cmd})`.
5. Close with `session_finish({summary})` — refused without verification unless explicitly waived.
6. Lint regularly: `lint_vault({checks: ['schema','provenance','stale','broken_links']})`.

## Tool Surface
- `search_semantic` — Vector similarity search.
- `search_hybrid` — Combined semantic + graph search.
- ... (all live tools)

### Deprecated (removed in v2.0.0)
- `find_stale` — (deprecated) Find stale notes.
- `rename_tag` — (deprecated) Rename a tag vault-wide.

## Memory Policy
- Markdown is canonical. The vault under `.claude/.vault/` (or wherever `--notes` points) is the source of truth.
- Indexes (vector / graph / FTS) are derived state — rebuildable via `reindex` without losing knowledge.
- Provenance frontmatter is required for `note`/`decision`/`gotcha` types — `sources` (external) or `derived_from` (internal).
- Mode router lives at `.claude/.semantic-memory/mode` (legacy `.claude/.sidekick-mode` still readable through v1.x); explicit `/mode` is ground truth.

<!-- semantic-memory:end contract -->

## Local Notes

<user-authored content here — preserved across regeneration>
```

The block between `<!-- semantic-memory:begin contract -->` and `<!-- semantic-memory:end contract -->` is **regenerable**. Anything outside those markers (the Local Notes section at the bottom, plus any custom sections you add) is **preserved verbatim**.

## When to generate AGENTS.md

- **First-time setup** of a project that uses semantic-memory: run `/contract refresh` to bootstrap
- **After upgrading** semantic-memory (new tool added, mode added): re-run `/contract refresh` so the tool list and mode descriptions stay current
- **After consolidating workflows** in your project: regenerate to surface the canonical workflow

You don't need to regenerate frequently. The contract content changes only when the plugin's tool surface or mode set changes.

## Three regeneration paths

### 1. MCP tool: `regenerate_contract`

```javascript
regenerate_contract({
  projectRoot: "/path/to/project",  // optional — derives from notesPath if omitted
  force: false                       // optional — overwrite hand-edited managed blocks
})
```

Returns `{ path, written, hand_edit_detected?, preserved_local_notes_chars? }`.

### 2. Slash command: `/contract`

- `/contract` or `/contract refresh` — regenerate normally
- `/contract inspect` — read-only inspection (existence, managed markers, Local Notes size)
- `/contract force` — overwrite hand-edited managed blocks (use only after the user has confirmed they accept losing in-block hand-edits)

### 3. Bootstrap on first session

When `session_start` runs and `AGENTS.md` doesn't exist, the plugin can create it. (This bootstrap is OPT-IN — see roadmap; not auto in v1.2.)

## Hand-edit detection

If you manually edit content INSIDE the managed block, regenerate refuses by default:

```javascript
regenerate_contract({})
// → { path: "...", written: false, hand_edit_detected: true,
//     reason: "Managed-block content has been hand-edited. Move your changes
//              to the Local Notes section (outside the managed block) and
//              re-run, or pass force=true to overwrite." }
```

The detection is content-based: the existing managed block's `trim()` is compared against what would be generated now. If they differ in any non-trivial way, it's considered hand-edited.

This protects accidental loss of edits. Two recovery paths:

1. **Move your edits to Local Notes** (outside the managed block) — they'll be preserved automatically forever
2. **Force overwrite** — `regenerate_contract({force: true})` if you really want to discard the hand-edits

## Preservation of "Local Notes"

The Local Notes section (everything below `<!-- semantic-memory:end contract -->`) is preserved BYTE-FOR-BYTE across regenerations. Use it for:

- Project-specific rules that override or extend the generic contract
- Branch / release / deploy guidance
- Per-team conventions
- Things that aren't part of the regenerable tool surface

You can also add **custom sections OUTSIDE the managed block but BEFORE Local Notes** — those are also preserved. The regenerator only touches what's inside the markers.

## Frontmatter behavior

The frontmatter at the top of `AGENTS.md` IS regenerated each run — `last_generated` updates to "now." If you want to add custom frontmatter, add it via the `extra_frontmatter` mechanism (planned) or accept that it'll be overwritten.

## What if AGENTS.md exists without managed-block markers?

The plugin **refuses to take it over** silently. If you have a hand-rolled `AGENTS.md` without the markers:

```javascript
regenerate_contract({})
// → { written: false,
//     reason: "AGENTS.md exists but does not contain the semantic-memory
//              managed-block markers. Move your existing content into a
//              Local Notes section outside the managed block, or delete
//              AGENTS.md and re-run to bootstrap from scratch." }
```

Two recovery paths:

1. **Manually add the markers** — wrap your existing content with `<!-- semantic-memory:begin contract -->` ... `<!-- semantic-memory:end contract -->`. The next `regenerate_contract` will overwrite that section but preserve everything else.
2. **Start fresh** — delete the file and re-run; the bootstrap path writes a complete, marker-included `AGENTS.md`.

The plugin will NEVER auto-take-over a file that wasn't written by it.

## AGENTS.md and CLAUDE.md

These two files coexist:

| File | Purpose | Editable? |
|---|---|---|
| `<project>/AGENTS.md` | Canonical, regenerable, generic contract surface | Local Notes section: yes. Managed block: no (regenerable). |
| `<project>/.claude/CLAUDE.md` | Repo-specific augmentation. Can include vault-first rules, branch policies, ad-hoc context. | Yes — fully user-owned. |

The relationship: **AGENTS.md is generic; CLAUDE.md is project-specific.** AGENTS.md says "here are the tools and modes." CLAUDE.md says "this repo also has these rules: never push to main, all schemas use snake_case, etc."

In v1.2, the project's `.claude/CLAUDE.md` was updated to start with a pointer at `AGENTS.md`:

```markdown
> **Primary contract: [`/AGENTS.md`](../AGENTS.md)** — generated and refreshed by `regenerate_contract`. Read that file first; it lists active modes, the required workflow, and the live tool surface.
>
> This file augments AGENTS.md with repo-specific rules that are not part of the generic contract — vault-first behavior, mode routing details, and pointers to project tooling.
```

This makes the relationship explicit: AGENTS.md first, CLAUDE.md second.

## Should AGENTS.md be in git?

**Yes, commit it.** Reasons:

- It's the canonical contract — it should be reviewable in PRs
- The Local Notes section is per-project knowledge that needs versioning
- It needs to follow the repo across machines (otherwise contributors all see different contracts)
- Regeneration is deterministic given the plugin version + tool surface — no merge conflicts on the managed-block content

`AGENTS.md` is NOT gitignored. Commit it.

## Multi-developer collaboration

Two developers regenerating `AGENTS.md` will produce **identical managed-block content** if they're on the same plugin version. The Local Notes section can diverge — handle as normal git merges.

If the plugin upgrades and you regenerate before pulling, you'll see a diff in the managed block. Normal: that's the new tool list / mode descriptions for the upgraded version.

## Inspection

```javascript
inspect_contract({ projectRoot: "..." })
// → {
//     path: "/path/to/AGENTS.md",
//     exists: true,
//     has_managed_block: true,
//     local_notes_chars: 1842
//   }
```

This is read-only — no mutations. Useful in healthcheck contexts or when you're not sure if AGENTS.md is in good shape.

## Related slash commands and tools

| Command | Effect |
|---|---|
| `/contract` or `/contract refresh` | Regenerate (with hand-edit refusal) |
| `/contract inspect` | Read-only inspection |
| `/contract force` | Overwrite hand-edits (with confirmation) |
| `regenerate_contract({force: false})` | Same as `/contract refresh` |
| `regenerate_contract({force: true})` | Same as `/contract force` |
| `inspect_contract()` | Same as `/contract inspect` |
| `/healthcheck` | Surfaces `agents_contract` finding when AGENTS.md exists without markers |

## Testing AGENTS.md changes

When you add a new MCP tool or change a description:

1. Update `src/mcp/tools/inventory.ts` — the canonical tool list the generator reads
2. Run `regenerate_contract` against a test project to see the new content
3. The plugin's regression suite (`test/unit/agents-contract.test.ts`) covers the generation logic

If you modify `src/core/agents-contract.ts` itself, run that test file and update snapshots.

## See also

- [v1-stack-overview.md](../architecture/v1-stack-overview.md) — where AGENTS.md fits in v1.1+
- [sessions-guide.md](./sessions-guide.md) — session_start can bootstrap AGENTS.md
- [drift-detection.md](./drift-detection.md) — `agents_contract` healthcheck finding
- [mcp-tools-reference.md](../reference/mcp-tools-reference.md) — full tool signatures for regenerate_contract / inspect_contract
