#!/usr/bin/env bash
# semantic-sidekick — template pre-commit hook for vault repos.
#
# Install into your vault repo:
#   cp /path/to/semantic-sidekick/scripts/pre-commit-lint.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#   # set VAULT_PATH below, or export it before commit
#
# On each commit this runs the cheap lint rules:
#   - schema_violations   → blocks commit on error
#   - missing_provenance  → warns
#   - stale               → warns
#
# Pass STRICT=1 to also block on warnings. Pass SKIP_VAULT_LINT=1 to bypass.

set -euo pipefail

if [[ "${SKIP_VAULT_LINT:-0}" == "1" ]]; then
  echo "pre-commit-lint: skipped (SKIP_VAULT_LINT=1)"
  exit 0
fi

# Default to repo root; override with VAULT_PATH=... when your vault is elsewhere.
VAULT_PATH="${VAULT_PATH:-$(git rev-parse --show-toplevel)}"

# Locate semantic-sidekick CLI: prefer local install, fall back to npx.
CLI=""
if [[ -x "$VAULT_PATH/node_modules/@theglitchking/semantic-sidekick/bin/semantic-sidekick" ]]; then
  CLI="node $VAULT_PATH/node_modules/@theglitchking/semantic-sidekick/bin/semantic-sidekick"
elif command -v semantic-sidekick >/dev/null 2>&1; then
  CLI="semantic-sidekick"
else
  CLI="npx --no @theglitchking/semantic-sidekick"
fi

STRICT_FLAG=""
if [[ "${STRICT:-0}" == "1" ]]; then
  STRICT_FLAG="--strict"
fi

echo "pre-commit-lint: running vault lint against $VAULT_PATH"
$CLI lint --notes "$VAULT_PATH" $STRICT_FLAG
