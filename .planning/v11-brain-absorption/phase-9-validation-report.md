# Phase 9 — Full Validation Report (success gate)

**Status:** PASS — automated portion. Manual smoke tests deferred to release-time tester.

**Date:** 2026-05-08
**Branch:** feat/v1.1-brain-absorption
**Head:** f2d04c7

## Test Execution Matrix

| Surface | Validation | Result |
|---|---|---|
| TypeScript lint | `npm run lint` | ✓ clean |
| Build | `npm run build` | ✓ clean (ESM 37ms, DTS 3.1s) |
| Unit tests | `npm test -- test/unit` | ✓ 17 files, all green |
| Integration tests | `npm test -- test/integration` | ✓ 5 files, all green |
| E2E tests | `npm test -- test/e2e` | ✓ 4 files, all green |
| Regression — tool surface | `npm test -- test/regression/tool-surface.test.ts` | ✓ 40-tool snapshot, additive-only diffs across all phases |
| Regression — tool outputs | `npm test -- test/regression/tool-outputs.test.ts` | ✓ no surviving-tool output drift |
| Phase4 mode-hook | `npm test -- test/phase4` | ✓ 2 files, all green (no-session Stop path byte-identical) |
| Phase5 session-hook | `npm test -- test/phase5` | ✓ 1 file, 5 tests, all green |
| **Total** | `npm test` | **31/31 files, 277/277 tests passing** |
| Built dist tool count | grep server.tool count in dist/mcp/server.js | ✓ 40 tools in bundle |
| CLI version | `node dist/cli/index.js --version` | 1.0.1 (Phase 10 bumps to 1.1.0) |

## Backwards-compatibility audit

| Statement (from CHANGELOG contract) | Evidence |
|---|---|
| Every existing MCP tool name remains callable | All 33 original tool names present in tool-surface snapshot. 6 deprecation shims registered with [DEPRECATED] prefix. |
| Hook output unchanged when no session is active and no drift exists | test/phase4 still passes unchanged; test/phase5 case "NO session present" verifies absence of session-close emission. |
| AGENTS.md generation is opt-in | regenerate_contract is a write-mode tool; never called automatically. AGENTS.md only created when explicitly requested. |
| Drift detection silent on healthy installs | test/unit/healthcheck.test.ts:"clean install (nothing in place) produces no drift findings" + budget test (<500ms). |

## Tool-surface delta vs v1.0.1

```
v1.0.1: 33 tools
   + regenerate_contract     (Phase 3)
   + inspect_contract         (Phase 3)
   + synthesize_promote       (Phase 4)
   + session_start            (Phase 5)
   + session_run              (Phase 5)
   + session_finish           (Phase 5)
   + session_status           (Phase 5)
   = 40 tools (write mode), 21 tools (read-only mode, unchanged)
```

All 6 deprecation shims (find_schema_violations, find_missing_provenance, find_stale, find_broken_links, read_multiple_notes, rename_tag) remain callable through v1.x.

## Performance budgets

| Budget | Target | Measured |
|---|---|---|
| Healthcheck fast tier | <100ms | <500ms in test (CI overhead); raw <100ms locally |
| Test suite end-to-end | <30s | 18s |
| Build (ESM) | <1s | 37ms |

## Tests added by phase

| Phase | New test files | New tests |
|---|---|---|
| 3 | test/unit/agents-contract.test.ts | 7 |
| 4 | (extended) test/unit/synthesize.test.ts | 6 |
| 5 | test/unit/session.test.ts | 24 |
| 5 (Phase 7) | test/phase5/stop-hook-session.test.ts | 5 |
| 6 | test/unit/skills-bundler.test.ts | 12 |
| 8 | test/unit/healthcheck.test.ts | 12 |
| **Total new** | | **66 new tests** |

Total suite: 211 (baseline) + 66 = ~277 ✓

## Manual smoke checklist (deferred to release-time tester)

These cannot be exercised in this environment without polluting the user's home dir or simulating an existing-install upgrade:

- [ ] Upgrade an existing v1.0.x install via `npm install @theglitchking/semantic-memory@1.1.0`
- [ ] Confirm `.semantic-sidekick-index/` is NOT touched (no re-index)
- [ ] Confirm `~/.semantic-sidekick/models/` is NOT touched (no model re-download)
- [ ] Confirm `bin/semantic-sidekick` alias still resolves
- [ ] Confirm `bin/semantic-memory --version` reports 1.1.0
- [ ] Run `bin/semantic-memory skills install --agent codex --scope local` against a real project
  - [ ] Verify `.codex/skills/{vault-first,research-mode,outage-silence,semantic-first}/` written
  - [ ] Verify `.codex/skills/.semantic-memory-skill-manifest.json` written with sha256s
  - [ ] Re-run without --force → non-destructive (drift detection vs same shas → ok)
  - [ ] Mutate a SKILL.md, re-run without --force → drift refused
  - [ ] Re-run with --force → succeeds, manifest updated
- [ ] Run `bin/semantic-memory healthcheck` with stdout drift output
- [ ] Build offline tarball: `./scripts/build-offline-tarball.sh`
- [ ] Install on a fresh target: `./install-offline.sh`
- [ ] Run `./install-offline.sh --verify` → clean
- [ ] Run `./install-offline.sh --rollback` → succeeds

## Sign-off

**Automated validation: PASS.** All test tiers green, snapshot diffs additive-only, type-check clean, build clean. Backwards-compat contract is mechanically enforced by the existing regression snapshot suite.

**Manual smoke validation: DEFERRED.** Items requiring an existing v1.0.x install or real agent skill dirs are listed above for the release-time tester.

**Recommendation:** Phase 10 (release) may proceed for npm-publish + CHANGELOG. Manual smoke tests SHOULD complete on the release tester's machine before announcement / dogfood week begins.

— Validation harness, 2026-05-08
