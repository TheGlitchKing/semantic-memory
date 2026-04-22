// Default vault schema shipped with semantic-sidekick.
// Intentionally minimal — the plan is to grow from pain, not preempt it.
// Users can override with a vault.schema.yml at the vault root.

export const DEFAULT_SCHEMA_YAML = `# semantic-sidekick vault schema (minimal starter).
# Override by placing a vault.schema.yml at the vault root.

version: 1

# Provenance fields — apply to all types, enforced by lint.find_missing_provenance.
# sources:         URLs or filesystem paths the note was derived from
# derived_from:    wikilinks to other notes this one synthesizes
# last_verified:   ISO date this note was last confirmed true (YYYY-MM-DD)
# status:          one of: draft | active | stale | deprecated | archived
# confidence:      one of: high | medium | low
provenance_fields:
  - sources
  - derived_from
  - last_verified
  - status
  - confidence

# Allowed status values (enforced by schema_violations lint).
status_enum: [draft, active, stale, deprecated, archived]
confidence_enum: [high, medium, low]

# Note types. Each type declares its required frontmatter.
# Any field not listed as required is allowed but not enforced.
types:
  note:
    description: Generic note — default type when \`type\` frontmatter is absent
    required: [title, status]

  decision:
    description: Architectural or process decision with dated rationale
    required: [title, status, decided_on, decision_maker]

  gotcha:
    description: Compressed lesson from a past incident/bug/surprise
    required: [title, status, last_verified, severity]

  source:
    description: External reference (paper, blog post, doc) used as provenance
    required: [title, status, source]

# Severity values for gotcha type.
severity_enum: [low, medium, high, critical]

# Lint policy. Each rule has a default severity that pre-commit/CI consumes.
lint:
  missing_provenance:
    # Triggers when a note type in this list has no sources AND no derived_from.
    applies_to: [note, decision, gotcha]
    severity: warn
  stale:
    # Triggers when last_verified is older than this many days (0 = disabled).
    max_age_days: 180
    severity: warn
  schema_violations:
    # Triggers on missing required fields, unknown type, or enum mismatch.
    severity: error
`;
