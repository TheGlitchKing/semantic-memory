---
title: Frontmatter spec — every field, what it does, who reads it
tier: reference
domains: [reference]
audience: [developers, admin]
tags: [frontmatter, schema, yaml, fields, spec, provenance]
status: active
last_updated: '2026-05-09'
version: '1.2.0'
purpose: Authoritative field-by-field spec for note frontmatter. Covers every field the indexer / lint / search tools read, what types they expect, what defaults apply, and which tools surface them.
load_priority: 9
---

# Frontmatter spec

Every markdown note in the vault SHOULD have YAML frontmatter at the top. The frontmatter is parsed by [`gray-matter`](https://github.com/jonschlinkert/gray-matter) and stored on the `IndexedDocument` for that note. Many fields drive search ranking, filter behavior, lint findings, and graph edges — so getting them right matters more than they look.

This doc is the authoritative reference. The schema definition that the linter validates against lives in `<vault>/vault.schema.yml` (install via `install_schema`); fields below describe both the standard schema and how the indexer interprets each field.

## Frontmatter format

```markdown
---
title: My Note Title
type: decision
status: active
last_verified: 2026-05-09
sources:
  - https://example.com/source
related_docs:
  - other-note.md
tags:
  - architecture
  - auth
load_priority: 8
---

# My Note Title

Body text here. The `# Heading` line typically matches `title` but the frontmatter title is canonical.
```

Frontmatter sits between two `---` lines at the very top of the file. Anything after the closing `---` is body content.

## Field reference (alphabetical)

### `audience`
- **Type:** `string[]`
- **Required:** No
- **Used by:** Documentation organization (HEWTD-flavored docs use this); not currently used by search filters
- **Schema rule:** None
- **Example:** `audience: [developers, admin]`

### `confidence`
- **Type:** `string` — typically one of `low`, `medium`, `high`
- **Required:** No (defaults to `medium` when set by `synthesize_note`)
- **Used by:** No search re-ranking yet (planned for v1.3 confidence-decay; will multiply into score). Lint surfaces as informational. Set by `synthesize_note` automatically.
- **Schema rule:** None by default; you can constrain to enum in your `vault.schema.yml`
- **Example:** `confidence: high`

### `decided_on`
- **Type:** `string` — ISO date `YYYY-MM-DD`
- **Required:** Recommended for `type: decision`
- **Used by:** Surfaced in `list_notes` output; used by some lint configurations
- **Example:** `decided_on: '2026-04-22'`

### `decision_maker`
- **Type:** `string`
- **Required:** Recommended for `type: decision`
- **Used by:** Set by `synthesize_note` if provided; informational
- **Example:** `decision_maker: tom`

### `derived_from`
- **Type:** `string[]` — paths/names of other vault notes
- **Required:** Required for `type: note`/`decision`/`gotcha` (alongside or instead of `sources`) — see `missing_provenance` lint rule
- **Used by:**
  - Graph: each entry creates a `derived_from` edge in the knowledge graph
  - Lint: `missing_provenance` rule fires if both this and `sources` are absent
  - `synthesize_note({from_session: true})` (planned v1.3) defaults this to `session.notes_touched`
- **Schema rule:** Listed in `provenance` config in vault.schema.yml
- **Example:**
  ```yaml
  derived_from:
    - decisions/auth-migration.md
    - gotchas/keycloak-token-refresh.md
  ```

### `domains`
- **Type:** `string[]` — content domains (free-form tags, but conventional)
- **Required:** No
- **Used by:**
  - `list_notes({domain: "X"})` filter
  - `search_*({domain: "X"})` filter (across all search modes)
  - HEWTD doc organization
- **Convention:** Use lowercase, dash-separated. Examples: `architecture`, `api`, `security`, `frontend`.
- **Example:** `domains: [architecture, api]`

### `evergreen` (v1.3 — planned)
- **Type:** `boolean`
- **Required:** No
- **Used by:** v1.3 confidence-decay engine. When `true` AND `last_verified` is within 365 days, decay multiplier is locked at 1.0. When `last_verified` > 365 days old, the evergreen claim has expired and normal decay applies.
- **Status:** NOT in v1.2. Adding now is forward-compatible (ignored by v1.2; honored by v1.3+).

### `extra_frontmatter`
- **Type:** `Record<string, unknown>` — passed through `synthesize_note` calls into the resulting note's frontmatter
- **Required:** No
- **Used by:** This is a `synthesize_note` INPUT field, not a frontmatter FIELD. Lets callers attach arbitrary frontmatter to the synthesized note.

### `is_proposal` / `proposed_target` (v1.1+)
- **Type:** automatically set by `synthesize_note({proposal: true})`
- **Used by:**
  - Notes with `status: proposal` are written under `proposals/<date>-<slug>.md`
  - `proposed_target` records the canonical destination path
  - `synthesize_promote` reads `proposed_target` to know where to move the proposal
- **Direct manual editing not recommended.**

### `last_modified` (v1.2+)
- **Type:** ISO date `YYYY-MM-DD` or full ISO timestamp
- **Required:** No
- **Used by:** Auto-stamped by `apply_patch` and `update_note` on every edit. Distinguishes "file edited" from "knowledge re-verified."
- **Important:** v1.2 introduces `last_modified` as the auto-stamp field. Before v1.2, `last_verified` was being auto-stamped on every edit, which conflated the two concepts.

### `last_verified`
- **Type:** ISO date `YYYY-MM-DD`
- **Required:** Recommended for `type: note`/`decision`/`gotcha`
- **Used by:**
  - `find_stale` / `lint_vault({checks: ["stale"]})` rule (default threshold: 180 days)
  - **v1.3 confidence-decay** will use this as the primary decay signal
  - Set by `synthesize_note` at note creation
  - **In v1.2+, only updated by:** explicit `verify_note` tool (planned v1.3) OR initial creation. NOT updated by edits.
- **Schema rule:** `stale.max_age_days` controls when staleness is flagged
- **Example:** `last_verified: '2026-04-15'`

### `load_priority`
- **Type:** `number` — integer 1–10
- **Required:** No
- **Used by:**
  - `search_semantic` and `search_hybrid` apply a score boost: `score × (1 + (load_priority - 5) × 0.04)`
  - load_priority 10 → +20% boost
  - load_priority 5 → no change (default)
  - load_priority 1 → -16% reduction
  - HEWTD docs use this for "load order" preference when domain docs are loaded together
- **Convention:** Reserve 9-10 for top-tier reference docs (compat matrix, root indices). Reserve 1-3 for verbose tutorials / examples that shouldn't dominate search.
- **Example:** `load_priority: 8`

### `purpose`
- **Type:** `string` — one-paragraph "why this exists / what it covers"
- **Required:** No (recommended for HEWTD-flavored docs)
- **Used by:** Surfaced in `list_notes` output, HEWTD `list` / `search` results
- **Convention:** 1-3 sentences. The "if I only read this, what do I know?" summary.
- **Example:**
  ```yaml
  purpose: Defines the schema fields and lint rules for vault notes.
    Read this when authoring or reviewing notes.
  ```

### `related_docs`
- **Type:** `string[]` — paths/names of related vault notes
- **Required:** No
- **Used by:**
  - Graph: each entry creates a `related_doc` edge
  - Surfaced in `forwardlinks` and similar graph queries
  - HEWTD navigation
- **Difference from `derived_from`:** `derived_from` implies "this note builds on those." `related_docs` implies "consider reading these together." Both create graph edges; lint treats them differently (`missing_provenance` only counts `derived_from` and `sources`).
- **Example:**
  ```yaml
  related_docs:
    - architecture/auth-flow.md
    - operational/auth-troubleshooting.md
  ```

### `severity`
- **Type:** `string` — typically one of `low`, `medium`, `high`, `critical`
- **Required:** Recommended for `type: gotcha`
- **Used by:** Set by `synthesize_note` when provided; surfaced in `list_notes` output; can be schema-constrained
- **Example:** `severity: high`

### `source_summary` (only inside `sources/<slug>.md` notes)
- **Type:** `string`
- **Used by:** Set by `ingest_source`. One-line summary of the external source.

### `source_tags` (only inside `sources/<slug>.md` notes)
- **Type:** `string[]`
- **Used by:** Set by `ingest_source`. Tags applied to the source note.

### `source_title` (only inside `sources/<slug>.md` notes)
- **Type:** `string`
- **Used by:** Set by `ingest_source`. Human-readable source title.

### `source_type`
- **Type:** `string` — typically `article`, `paper`, `documentation`, `video`, `code`, `personal-communication`
- **Used by:** Set by `ingest_source`. Helps categorize the type of external source.

### `source_uri`
- **Type:** `string` — URL
- **Used by:** Set by `ingest_source`. Canonical address of the external source.

### `sources`
- **Type:** `string[]` — URLs or external paths
- **Required:** Required for `type: note`/`decision`/`gotcha` (alongside or instead of `derived_from`) — see `missing_provenance` lint rule
- **Used by:** Lint `missing_provenance`. Surfaced in `list_notes` output.
- **Schema rule:** Listed in `provenance` config in vault.schema.yml
- **Example:**
  ```yaml
  sources:
    - https://example.com/rfc-1
    - "Conversation with Alice 2026-04-15"
  ```

### `status`
- **Type:** `string` — typically `active`, `draft`, `deprecated`, `archived`, `proposal`
- **Required:** Yes (default in schema)
- **Used by:**
  - `list_notes({status: "X"})` filter
  - `search_*({status: "X"})` filter
  - `proposal` is the v1.1+ marker for review-pending notes (auto-set by `synthesize_note({proposal: true})`)
- **Schema rule:** Schema can constrain to an enum
- **Example:** `status: active`

### `tags`
- **Type:** `string[]`
- **Required:** No
- **Used by:**
  - Graph: each tag becomes a tag node; notes get edges to their tags
  - `manage_tags({action: "list"})` returns these (combined with inline `#tag` markers)
  - `search_text({tagFilter: ["X"]})` filters
- **Convention:** Lowercase, no leading `#`. The leading `#` is for inline body text only.
- **Example:**
  ```yaml
  tags:
    - architecture
    - decision-record
  ```

### `tier`
- **Type:** `string` — one of `guide`, `standard`, `example`, `reference`, `admin` (HEWTD convention)
- **Required:** No (HEWTD docs use it; vault notes typically don't)
- **Used by:** HEWTD doc organization; not currently used by search ranking.
- **Convention:** Vault notes typically don't carry `tier`. Use it in `.documentation/` if your project uses HEWTD-style frontmatter.

### `title`
- **Type:** `string`
- **Required:** Yes (effectively — many tools fall back to filename if missing)
- **Used by:**
  - `list_notes` output
  - Search snippet rendering
  - Graph node label
- **Convention:** Match the body's `# H1` line.

### `type`
- **Type:** `string` — typically `note`, `decision`, `gotcha`, `source` (default schema)
- **Required:** Yes (in default schema)
- **Used by:**
  - Schema: each type can have type-specific required fields and rules
  - Lint: `missing_provenance` only fires for `note`/`decision`/`gotcha`, NOT `source`
  - **v1.3 confidence-decay** will use type to look up per-type half-life (decision: 365d, gotcha: 90d, etc.)
  - `synthesize_note` accepts this as input
- **Schema rule:** `types` map in `vault.schema.yml` declares valid types and their per-type rules
- **Example:** `type: decision`

### `version`
- **Type:** `string`
- **Required:** No
- **Used by:** HEWTD docs use this; informational

## Schema enforcement

The default schema (installed via `install_schema`) enforces:

- `type` must be one of: `note`, `decision`, `gotcha`, `source`
- `status` must be one of: `active`, `draft`, `deprecated`, `archived`, `proposal`
- `last_verified` must parse as ISO date when present
- For `type` ∈ `{note, decision, gotcha}`: at least one of `sources` or `derived_from` must be non-empty (warning, not error)
- For `type: decision`: `decision_maker` is recommended (warning if absent)
- `stale.max_age_days` defaults to 180 — `last_verified` older than this triggers `find_stale`

Customize `<vault>/vault.schema.yml` to add types, fields, or stricter rules. The lint suite re-runs against the live schema.

## Conflicts and disambiguation

A few fields look similar but mean different things:

| Pair | Meaning |
|---|---|
| `last_modified` vs `last_verified` | `last_modified` = file edit timestamp (auto-stamped on every save). `last_verified` = "I confirmed this knowledge is still correct" (only updated at creation or by explicit `verify_note`). v1.2+ formalizes this distinction. |
| `derived_from` vs `related_docs` | `derived_from` = "this note builds on those" (provenance). `related_docs` = "consider these alongside" (cross-reference). Lint `missing_provenance` only counts `derived_from`. |
| `sources` vs `derived_from` | `sources` = external (URLs, papers, conversations). `derived_from` = internal (other vault notes). Both satisfy the provenance lint. |
| `tags` vs `domains` | `tags` are content-classification labels (often inline-friendly). `domains` are broader content areas (e.g. "architecture", "api"). Both are filterable; tags drive graph edges, domains don't. |
| `type` vs `tier` | `type` = vault-content classification (note / decision / gotcha / source). `tier` = HEWTD doc-tier classification (guide / reference / etc.). Vault notes use `type`; documentation uses `tier`. |

## Legacy / deprecated fields

| Field | Status | Replacement |
|---|---|---|
| `tags: "single-string"` | Was tolerated by some early callers | Use `string[]` always |
| `provenance:` (object form) | Was experimental | Use top-level `sources` and `derived_from` |
| `sidekick_*` prefixes | Never made it to v1.x | n/a |

## What you SHOULD always include

Minimum viable frontmatter for a vault note:

```yaml
---
title: "..."
type: note   # or decision, gotcha, source
status: active
last_verified: 2026-05-09  # today's date at creation
sources:
  - https://example.com/source
# OR (whichever is appropriate)
derived_from:
  - other-vault-note.md
---
```

For a `decision` add `decision_maker`, `decided_on`, `confidence`. For a `gotcha` add `severity`. For a `source` add `source_uri`, `source_title`, `source_type`.

## See also

- [schema-and-provenance.md](../architecture/schema-and-provenance.md) — substrate-level schema architecture
- [what-gets-indexed.md](../architecture/what-gets-indexed.md) — content perspective: where each frontmatter field ends up in the indices
- [mcp-tools-reference.md](./mcp-tools-reference.md) — every tool that reads or writes frontmatter
