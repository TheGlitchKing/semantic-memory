---
title: TheGlitchKing stack compatibility matrix
tier: reference
domains:
  - architecture
  - distribution
status: active
last_updated: 2026-05-07
version: 1.0.0
audience:
  - developers
  - admin
purpose: Canonical compatibility matrix for the TheGlitchKing memory-layer stack. Defines which combinations of underlying plugin versions are tested together and ship as a coherent set under each `dev-stack` meta-plugin version. This is the single source of truth referenced by every plugin's README.
---

# TheGlitchKing stack compatibility matrix

This is **the** compatibility matrix for the TheGlitchKing memory-layer + planning + docs + translation stack. It documents which combinations of underlying plugin versions are tested together and ship as a coherent set under each `dev-stack` meta-plugin version.

The matrix lives in `semantic-memory` (this repo) because semantic-memory is the runtime that consumes the other plugins as either:
- producers writing into corpora (persistent-planning → `plans`, babel-fish → `project-map`, hit-em-with-the-docs → `docs`)
- a frontmatter standard the runtime validates against (HEWTD)

Every other plugin's README cross-references this doc as the canonical source.

## Active matrix

### `dev-stack@1.0.x` (current)

| Plugin | Required range | Tested at |
|---|---|---|
| `@theglitchking/semantic-memory` | `^1.0.0` | 1.0.0 (Phase 2.0.0a — rebrand mechanics, runtime equivalent to semantic-sidekick 0.2.5) |
| `@theglitchking/hit-em-with-the-docs` | `~2.2.0` | 2.2.0 (Phase 1.1.0 — `tier: "plan"` + conditional `version`) |
| `@theglitchking/persistent-planning` | `^3.0.0` | 3.0.0 (Phase 1.2.0/1.3.0 — sm/lg modes + layered phase/task/atom/notes) |
| `@theglitchking/babel-fish` | `^2.0.0` | 2.0.0 (existing release; integration with semantic-memory project-map corpus + glossary side-channel ships in Phase 3.1.0) |

#### Why these ranges
- **semantic-memory `^1.0.0`**: any 1.x is API-compatible. Multi-corpus refactor (Phase 2.0.0b) lands as 1.1.0; will not break the 1.0 tool surface (regression-snapshot suite gates this).
- **hit-em-with-the-docs `~2.2.0`**: the `tier: "plan"` extension is the precise feature persistent-planning depends on. Tilde-range allows patch-level updates (2.2.x) without accepting a 2.3.0 that might re-shape the schema. Will widen to `^2.2.0` once 2.3 is known to be additive.
- **persistent-planning `^3.0.0`**: any 3.x preserves the lg-mode contract (phase / task / atom / notes layers, HEWTD frontmatter, sm-mode preservation).
- **babel-fish `^2.0.0`**: existing 2.0 release. Integration uses babel-fish's existing 19-section project-map output unchanged — semantic-memory consumes the artifact, doesn't drive babel-fish runtime.

#### What's tested together
- Each underlying plugin has its own test suite (preserved bit-for-bit through the rebrand)
- semantic-memory regression-snapshot suite (`test/regression/`) gates the 33-tool surface across all of these
- Phase 4.4.0 (persistent-planning testing) verifies sm + lg flows with semantic-memory present and absent
- Phase 4.5.0 (babel-fish testing) verifies the glossary contract end-to-end with semantic-memory's translation verbs

#### What's NOT tested together (documented gaps)
- Multi-corpus runtime is preview-documented in semantic-memory 1.0.0a but not implemented; full integration tests with all six corpora active land in Phase 4.2.0 once 2.0.0b ships
- Drift detection and translation verbs are not part of the 1.0 surface; they ship in Phase 3.1.0 / 3.3.0
- pages-compat mode (1:1 surface mapping for semantic-pages migrators) ships in 2.0.0b

## Future matrix (planned)

### `dev-stack@1.1.x` (after semantic-memory 1.1.0 ships with multi-corpus)

| Plugin | Range |
|---|---|
| `semantic-memory` | `^1.1.0` |
| `hit-em-with-the-docs` | `~2.2.0` (unchanged) |
| `persistent-planning` | `^3.0.0` (unchanged) |
| `babel-fish` | `^2.0.0` (unchanged) |

When 1.1 ships, dev-stack pin tightens to `^1.1.0` to ensure consumers get the multi-corpus runtime.

### `dev-stack@1.2.x` (after Phase 3.1.0 — babel-fish glossary integration)

When semantic-memory adds the `project-map` corpus + translation verbs (3.1.0 of the meta-plan = a minor of semantic-memory), babel-fish constraint may tighten to a specific minor that ships the glossary side-channel contract changes (TBD — could be 2.1.0 or 2.0.0 if the existing 19-section output already meets the contract).

### `dev-stack@2.0.x` (after Phase 3.2.0 / 3.3.0 — code corpus + drift)

Major bump if the drift-detection feature changes the way users author HEWTD docs (e.g. requires a new field). Otherwise stays at 1.x.

## Coexistence with deprecated plugins

| Plugin | Status | Coexists with dev-stack? |
|---|---|---|
| `semantic-sidekick` | Renamed to `semantic-memory` at 1.0.0a (PR #9) | Don't install both — semantic-memory IS the new name. Migrate via uninstall + install. |
| `semantic-pages` | Deprecated as of 2026-05-07 (PR #5) | Yes — different MCP key (`semantic-vault` vs `semantic-memory`). Both can run side-by-side during the 12-month sunset. |

## How to verify your install matches this matrix

```bash
# Check the meta-plugin version
/plugin list --installed | grep dev-stack

# Check each underlying plugin's version
/plugin list --installed | grep -E "semantic-memory|hit-em-with-the-docs|persistent-planning|babel-fish"
```

Or via npm:

```bash
npm ls @theglitchking/semantic-memory @theglitchking/hit-em-with-the-docs @theglitchking/persistent-planning @theglitchking/babel-fish
```

If any version falls outside the range listed above for your `dev-stack` version, you've drifted — either bump dev-stack or pin the underlying plugin manually in your `.mcp.json` / `package.json`.

## Inter-PR coordination history

This matrix was derived from the unified memory-layer plan tracked in `~/workspace/the-glitch-kingdom/persistent-planning/.planning/layered-planning-with-mcp-and-hewtd-frontmatter/task_plan.md`. Initial entries reflect the PRs landing in the May 2026 launch window:

| PR | Repo | Status | Lands |
|---|---|---|---|
| #7, #8 | semantic-sidekick | Merged to main | offline packaging, regression baseline |
| #3 | hit-em-with-the-docs | Open | HEWTD 2.2.0 — `tier: "plan"` + conditional version |
| #1 | persistent-planning | Open | persistent-planning 3.0.0 — sm/lg + layered model |
| #9 | semantic-sidekick | Open | semantic-memory 1.0.0a rebrand mechanics |
| #5 | semantic-pages | Open | deprecation announcement |
| (new repo) | dev-stack | Created private; pending visibility flip + publish | meta-plugin 1.0.0 |

## Updating this matrix

When a new minor of any underlying plugin ships:
1. Verify it satisfies the existing range (e.g. semantic-memory 1.1.0 satisfies `^1.0.0`)
2. If it does AND the integration is tested → no matrix change needed
3. If it changes behavior in a way users should opt into → bump dev-stack minor and tighten the constraint
4. If it requires breaking changes in another plugin → bump dev-stack major

The matrix is hand-maintained. Automation (a CI job that pins from npm latest) is a future improvement.

## See also

- `~/workspace/the-glitch-kingdom/dev-stack/README.md` — meta-plugin README with install / upgrade flow
- `~/workspace/the-glitch-kingdom/persistent-planning/.planning/layered-planning-with-mcp-and-hewtd-frontmatter/task_plan.md` — Phase 4.14.0 (cross-repo coordination)
- Each underlying plugin's CHANGELOG for what shipped in the bumps reflected here
