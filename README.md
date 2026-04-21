# semantic-sidekick

> A shelf is retrievable. A prosthesis is present.

Activation, mode-routing, and capture layer built on top of [semantic-pages](https://github.com/TheGlitchKing/semantic-pages). semantic-pages gives you a searchable markdown vault. semantic-sidekick makes the vault *present* during work — auto-firing when relevant, staying silent when it would harm (outages), and forcing capture at mode transitions so 3-hour sessions produce durable artifacts instead of evaporating into chat history.

## Status

**Phase 0 — fork scaffolding.** Substrate inherited from semantic-pages; no sidekick-specific behavior shipped yet. See `.planning/semantic-sidekick/task_plan.md` for the full build plan.

## Relationship to semantic-pages

- **Substrate** (retrieval, graph, MCP tools): inherited unchanged from semantic-pages.
- **Upstream remote** tracks semantic-pages for cherry-picking substrate fixes. Push is disabled; sidekick does not push back.
- **What's net-new in sidekick**: activation hooks, mode-routing skills, capture workflows (ingest/synthesize), lint suite, provenance + schema layer.

## Architecture (five layers)

1. **Substrate** — markdown vault + hybrid search + graph + MCP (inherited)
2. **Structure** — schema, provenance frontmatter, atomic `apply_patch`, structured log
3. **Workflows** — `ingest_source`, `synthesize_note`, lint suite
4. **Activation** — SessionStart / UserPromptSubmit / Stop hooks, `vault-first` skill, CLAUDE.md rules
5. **Routing** — mode skills (research / default / outage), signal weighting, transition capture

See the originating design discussion in `.planning/semantic-sidekick/` for rationale and phase-by-phase build plan.

## Development

```bash
npm install
npm run build
node dist/cli/index.js --version
```

## License

MIT
