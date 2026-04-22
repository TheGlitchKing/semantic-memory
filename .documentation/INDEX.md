# semantic-sidekick documentation

> Operator's manual for the five-layer activation / routing / capture stack on top of the semantic-pages vault MCP.

## Start here

- **[sidekick-overview.md](./sidekick-overview.md)** — what this is, what problem it solves, the "shelf vs prosthesis" framing.
- **[installation-guide.md](./installation-guide.md)** — plugin install, .mcp.json wiring, first reindex.
- **[architecture-layers.md](./architecture-layers.md)** — the five layers in one page.

## Using it

- **[modes-guide.md](./modes-guide.md)** — vault-first / research / outage-silence; how to enter and exit.
- **[capture-workflows.md](./capture-workflows.md)** — synthesize_note, ingest_source, Stop-hook capture, transition capture.
- **[injection-points.md](./injection-points.md)** — every place sidekick injects into Claude's context.

## Reference

- **[mcp-tools-reference.md](./mcp-tools-reference.md)** — all 33 MCP tools.
- **[cli-reference.md](./cli-reference.md)** — all `semantic-sidekick <subcommand>` invocations.
- **[hooks-reference.md](./hooks-reference.md)** — SessionStart / UserPromptSubmit / Stop contracts.
- **[configuration-reference.md](./configuration-reference.md)** — env vars, settings files, mode file, fingerprint cache.
- **[schema-and-provenance.md](./schema-and-provenance.md)** — vault.schema.yml, frontmatter fields, lint rules.

## Operating + observability

- **[logs-and-events.md](./logs-and-events.md)** — log.md format, auto-logged kinds, state-delta preload, how future-Claude monitors state.
- **[troubleshooting.md](./troubleshooting.md)** — known failure modes with diagnostic commands.
- **[tests-and-validation.md](./tests-and-validation.md)** — test suites, what they cover, how to run.

## Per-phase change logs

These describe what shipped in each phase commit. Read them to understand *why* a feature exists, not just what it does.

- **[phase-1-activation.md](./phase-1-activation.md)** — vault-first skill + hooks + CLAUDE.md rule.
- **[phase-2-structure.md](./phase-2-structure.md)** — schema, apply_patch, synthesize_note, lint, capture-on-close, parsed-doc cache.
- **[phase-3-ingest.md](./phase-3-ingest.md)** — ingest_source, structured log, hierarchical index auto-regen, broken-link lint.
- **[phase-4-routing.md](./phase-4-routing.md)** — research-mode + outage-silence skills, /mode, /vault, mode-aware hooks.

## Legacy (inherited from semantic-pages substrate)

- [how-it-works.md](./how-it-works.md) — MCP server startup, indexer, embedder internals.
- [embedder-guide.md](./embedder-guide.md) — ONNX embedder options.
- [frontmatter-guide.md](./frontmatter-guide.md) — indexer-consumed frontmatter fields.
- [performance-tuning.md](./performance-tuning.md) — ONNX workers, batch size.
- [changelog.md](./changelog.md) — version history.
- [troubleshooting.md](./troubleshooting.md) — substrate-level troubleshooting (this doc supersedes for sidekick-layer issues).
