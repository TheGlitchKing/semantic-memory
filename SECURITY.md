# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 0.2.x | ✅ (current) |
| 0.1.x | ⚠️ (fork scaffolding — upgrade to 0.2.x) |
| < 0.1 | ❌ |

## Reporting a vulnerability

**Do not open a public GitHub issue for security reports.**

Email: `theglitchking@users.noreply.github.com` with the subject prefix `[SECURITY] semantic-sidekick:`.

Include:
- Affected version(s).
- Reproduction steps (a minimal vault + a specific invocation).
- Impact assessment (what an attacker could achieve).
- Any suggested mitigation.

## Response SLA

- **Acknowledgement:** within 1 week.
- **Assessment:** within 2 weeks.
- **Fix release:** within 4 weeks for confirmed high/critical; best-effort for medium/low.
- **Disclosure:** coordinated — a credited advisory is published after the fix ships.

## What's in scope

Primary attack surface:

- **Vault file I/O** — `apply_patch`, `synthesize_note`, `ingest_source`, and the underlying `NoteCrud` module operate on paths that a user/Claude supplies. Path traversal outside the `--notes <vault>` root is considered a vulnerability.
- **Hook input parsing** — `hooks/vault-context.js` reads JSON from stdin. Parser injection or DoS via malformed input is in scope.
- **MCP tool arg handling** — every tool uses Zod schemas, but unchecked property access after validation is in scope.
- **Spawn calls** — the hook shells out to the `semantic-sidekick` CLI. Command injection via vault paths or query strings is in scope.
- **Log.md writes** — `logEvent` writes user-controllable strings. Log-injection (newlines breaking YAML blocks) is in scope.

## What's out of scope

- The embedder/model download (ONNX runtime) — upstream responsibility of the HuggingFace transformers library.
- Filesystem permission escalation — the tool runs with the user's permissions by design.
- Claude's judgment — the tool trusts Claude to use its tools sensibly within the user's granted permission scope. If Claude makes destructive calls, that's a permission scope question, not a sidekick vulnerability.
- Third-party MCP clients that connect to the server — we test against Claude Code only.

## Hardening notes

Defense-in-depth already in place:

- All `NoteCrud` operations resolve paths against the `notesPath` root and do not accept absolute paths.
- `apply_patch` pre-check verifies collision/existence before any write.
- Schema validation (when `validate: true`, the default) blocks writes that would violate the schema.
- Hooks fail open — any exception emits empty context, never destructive output.
- Log writes are `.catch(() => {})` wrapped — logging failures never mask real errors.

## Dependency updates

- Monthly security review — `npm audit` against the lock file.
- Patch-level upgrades applied within 2 weeks of disclosure for `moderate+` advisories.
- Major upgrades pinned by semver; tested in a separate branch before merge.

## Acknowledgements

None yet. First reporter gets the credit slot here.
