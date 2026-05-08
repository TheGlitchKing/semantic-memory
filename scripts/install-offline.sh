#!/usr/bin/env bash
#
# install-offline.sh
#
# Ships INSIDE the offline tarball. Run from the extracted tarball directory.
# Installs semantic-sidekick into ~/.semantic-sidekick/ with no network access.
#
# Idempotency:
#   - Detects already-installed same version → exits 0 (use --force to reinstall).
#   - Atomic swap via .new/ staging dir; previous install preserved at .previous/.
#   - Model cache files skipped if already present with matching sha256.
#   - HF_HUB_OFFLINE block in ~/.bashrc is marker-guarded; re-runs are no-ops.
#
# Drift detection:
#   - Tarball integrity verified against MANIFEST.json before any destructive op.
#   - Existing install drift-checked against its bundled MANIFEST. Refuses to
#     clobber hand-edits unless --force-overwrite-local-edits is passed.
#
# Usage:
#   ./install-offline.sh                            install (or upgrade)
#   ./install-offline.sh --force                    reinstall same version
#   ./install-offline.sh --force-overwrite-local-edits   ignore destination drift
#   ./install-offline.sh --rollback                 swap .previous/ back
#   ./install-offline.sh --status                   print state, no changes
#   ./install-offline.sh --verify                   integrity-check installed state

set -euo pipefail

# Resolve own location — works whether run as ./install-offline.sh or via path.
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SELF_DIR}/lib"
TARBALL_MANIFEST="${SELF_DIR}/MANIFEST.json"

# Load helpers (only version.sh is sourced; manifest.js is invoked directly)
# shellcheck source=lib/version.sh
if [[ -f "${LIB_DIR}/version.sh" ]]; then
  source "${LIB_DIR}/version.sh"
fi

# Install destinations — all under ~/.semantic-sidekick/ per project policy.
# Override with --prefix (useful for sandboxed testing).
SS_ROOT="${SS_PREFIX:-${HOME}/.semantic-sidekick}"

# Defaults
MODE="install"  # install | rollback | status | verify
FORCE=0
FORCE_OVERWRITE_LOCAL_EDITS=0
PERSIST_RC=0
DRY_RUN=0

# Colors (only if stdout is a tty)
if [[ -t 1 ]]; then
  C_GREEN='\033[0;32m'; C_YELLOW='\033[1;33m'; C_RED='\033[0;31m'; C_BLUE='\033[0;34m'; C_RESET='\033[0m'
else
  C_GREEN=''; C_YELLOW=''; C_RED=''; C_BLUE=''; C_RESET=''
fi

log()  { printf "${C_BLUE}[install]${C_RESET} %s\n" "$*"; }
ok()   { printf "${C_GREEN}[install]${C_RESET} %s\n" "$*"; }
warn() { printf "${C_YELLOW}[install]${C_RESET} %s\n" "$*"; }
err()  { printf "${C_RED}[install]${C_RESET} %s\n" "$*" >&2; }

usage() {
  cat <<EOF
Usage: $0 [options]

Modes (mutually exclusive):
  (default)                          Install or upgrade
  --rollback                         Swap .previous/ back into place
  --status                           Print installed state, no side effects
  --verify                           Integrity-check installed state; exit non-zero on drift

Flags:
  --force                            Reinstall same version
  --force-overwrite-local-edits      Proceed even if existing install drifted
  --persist-rc                       Append HF_HUB_OFFLINE export to ~/.bashrc
                                     (default: write to <prefix>/env.sh and let
                                      the user source it themselves)
  --prefix DIR                       Install root (default: ~/.semantic-sidekick).
                                     Useful for sandboxed testing.
  --dry-run                          Run all checks but skip destructive ops
  -h, --help                         Show this message

Environment:
  SS_PREFIX                          Same as --prefix
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    --force-overwrite-local-edits) FORCE_OVERWRITE_LOCAL_EDITS=1; shift ;;
    --persist-rc) PERSIST_RC=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --prefix) SS_ROOT="$2"; shift 2 ;;
    --rollback) MODE="rollback"; shift ;;
    --status) MODE="status"; shift ;;
    --verify) MODE="verify"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "Unknown arg: $1"; usage; exit 2 ;;
  esac
done

# Derived install paths — set after arg parsing so --prefix takes effect.
PLUGIN_DIR="${SS_ROOT}/plugin"
PLUGIN_NEW="${SS_ROOT}/plugin.new"
PLUGIN_PREV="${SS_ROOT}/plugin.previous"
MODELS_DIR="${SS_ROOT}/models"
ENV_FILE="${SS_ROOT}/env.sh"

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

require_node() {
  command -v node >/dev/null || { err "node not found in PATH"; exit 1; }
}

read_manifest_field() {
  # $1 = manifest path, $2 = dotted field
  local manifest="$1" field="$2"
  if [[ ! -f "${manifest}" ]]; then
    return 1
  fi
  node "${LIB_DIR}/manifest.js" read "${manifest}" "${field}" 2>/dev/null || return 1
}

# ----------------------------------------------------------------------------
# Mode: status
# ----------------------------------------------------------------------------
do_status() {
  echo "semantic-sidekick offline install — status"
  echo ""

  if [[ -f "${TARBALL_MANIFEST}" ]]; then
    local v sha
    v="$(read_manifest_field "${TARBALL_MANIFEST}" "version" || echo "?")"
    sha="$(read_manifest_field "${TARBALL_MANIFEST}" "gitSha" || echo "?")"
    echo "Tarball:    version=${v} gitSha=${sha}"
  else
    echo "Tarball:    (no MANIFEST.json found in ${SELF_DIR})"
  fi

  if [[ -f "${PLUGIN_DIR}/MANIFEST.json" ]]; then
    local v sha
    v="$(read_manifest_field "${PLUGIN_DIR}/MANIFEST.json" "version" || echo "?")"
    sha="$(read_manifest_field "${PLUGIN_DIR}/MANIFEST.json" "gitSha" || echo "?")"
    echo "Installed:  version=${v} gitSha=${sha} at ${PLUGIN_DIR}"
  else
    echo "Installed:  (none)"
  fi

  if [[ -f "${PLUGIN_PREV}/MANIFEST.json" ]]; then
    local v sha
    v="$(read_manifest_field "${PLUGIN_PREV}/MANIFEST.json" "version" || echo "?")"
    sha="$(read_manifest_field "${PLUGIN_PREV}/MANIFEST.json" "gitSha" || echo "?")"
    echo "Previous:   version=${v} gitSha=${sha} at ${PLUGIN_PREV}"
  else
    echo "Previous:   (none)"
  fi

  if [[ -d "${MODELS_DIR}" ]]; then
    local count size
    count="$(find "${MODELS_DIR}" -mindepth 1 -maxdepth 1 -type d | wc -l)"
    size="$(du -sh "${MODELS_DIR}" 2>/dev/null | awk '{print $1}')"
    echo "Models:     ${count} model(s), ${size} at ${MODELS_DIR}"
  else
    echo "Models:     (none at ${MODELS_DIR})"
  fi

  echo ""
  if [[ -f "${PLUGIN_DIR}/MANIFEST.json" ]]; then
    echo "Drift check (installed vs bundled manifest):"
    node "${LIB_DIR}/manifest.js" diff "${PLUGIN_DIR}" "${PLUGIN_DIR}/MANIFEST.json" \
      || true
  fi
}

# ----------------------------------------------------------------------------
# Mode: verify
# ----------------------------------------------------------------------------
do_verify() {
  if [[ ! -f "${PLUGIN_DIR}/MANIFEST.json" ]]; then
    err "No installed manifest at ${PLUGIN_DIR}/MANIFEST.json"
    exit 1
  fi
  log "Verifying installed plugin against bundled manifest"
  if node "${LIB_DIR}/manifest.js" verify "${PLUGIN_DIR}" "${PLUGIN_DIR}/MANIFEST.json"; then
    ok "Installed state matches manifest"
    exit 0
  else
    err "Installed state has drifted from bundled manifest (see drift report above)"
    exit 1
  fi
}

# ----------------------------------------------------------------------------
# Mode: rollback
# ----------------------------------------------------------------------------
do_rollback() {
  if [[ ! -d "${PLUGIN_PREV}" ]]; then
    err "No previous install at ${PLUGIN_PREV}"
    exit 1
  fi
  log "Rolling back: swapping ${PLUGIN_DIR} <-> ${PLUGIN_PREV}"

  local rollback_swap="${SS_ROOT}/plugin.rollback-swap"
  rm -rf "${rollback_swap}"

  if [[ -d "${PLUGIN_DIR}" ]]; then
    mv "${PLUGIN_DIR}" "${rollback_swap}"
  fi
  mv "${PLUGIN_PREV}" "${PLUGIN_DIR}"
  if [[ -d "${rollback_swap}" ]]; then
    mv "${rollback_swap}" "${PLUGIN_PREV}"
  fi

  local v
  v="$(read_manifest_field "${PLUGIN_DIR}/MANIFEST.json" "version" || echo "?")"
  ok "Rolled back to version ${v}"
  warn "Restart Claude Code to pick up the change."
}

# ----------------------------------------------------------------------------
# Mode: install
# ----------------------------------------------------------------------------

step_check_tarball_integrity() {
  log "Verifying tarball integrity (${SELF_DIR})"
  if [[ ! -f "${TARBALL_MANIFEST}" ]]; then
    err "MANIFEST.json not found at ${TARBALL_MANIFEST}. Is this an offline tarball?"
    exit 1
  fi
  if ! node "${LIB_DIR}/manifest.js" verify "${SELF_DIR}" "${TARBALL_MANIFEST}"; then
    err "Tarball integrity check failed. Aborting before any destructive operation."
    err "Likely cause: corruption in transport (truncated scp, USB write error, etc.)."
    exit 1
  fi
  ok "Tarball integrity OK"
}

step_resolve_versions() {
  TARBALL_VERSION="$(read_manifest_field "${TARBALL_MANIFEST}" "version")"
  TARBALL_SHA="$(read_manifest_field "${TARBALL_MANIFEST}" "gitSha")"
  log "Tarball: version=${TARBALL_VERSION} gitSha=${TARBALL_SHA}"

  if [[ -f "${PLUGIN_DIR}/MANIFEST.json" ]]; then
    INSTALLED_VERSION="$(read_manifest_field "${PLUGIN_DIR}/MANIFEST.json" "version" || echo "?")"
    INSTALLED_SHA="$(read_manifest_field "${PLUGIN_DIR}/MANIFEST.json" "gitSha" || echo "?")"
    log "Installed: version=${INSTALLED_VERSION} gitSha=${INSTALLED_SHA}"
  else
    INSTALLED_VERSION=""
    INSTALLED_SHA=""
    log "Installed: (none)"
  fi
}

step_decide_action() {
  if [[ -z "${INSTALLED_VERSION}" ]]; then
    log "Action: fresh install"
    return 0
  fi

  if [[ "${INSTALLED_VERSION}" == "${TARBALL_VERSION}" \
        && "${INSTALLED_SHA}" == "${TARBALL_SHA}" \
        && "${FORCE}" -eq 0 ]]; then
    ok "Same version already installed (${INSTALLED_VERSION} @ ${INSTALLED_SHA}). Nothing to do."
    ok "Pass --force to reinstall."
    exit 0
  fi

  if [[ "${INSTALLED_VERSION}" == "${TARBALL_VERSION}" \
        && "${INSTALLED_SHA}" == "${TARBALL_SHA}" \
        && "${FORCE}" -eq 1 ]]; then
    log "Action: forced reinstall of ${TARBALL_VERSION}"
  else
    log "Action: upgrade ${INSTALLED_VERSION} -> ${TARBALL_VERSION}"
  fi
}

step_drift_check_existing() {
  if [[ ! -f "${PLUGIN_DIR}/MANIFEST.json" ]]; then
    return 0
  fi

  log "Drift-checking existing install against its bundled manifest"
  local drift_log
  drift_log="$(mktemp)"
  if node "${LIB_DIR}/manifest.js" verify "${PLUGIN_DIR}" "${PLUGIN_DIR}/MANIFEST.json" \
       2>"${drift_log}" >/dev/null; then
    ok "Existing install matches its manifest (no local edits detected)"
    rm -f "${drift_log}"
    return 0
  fi

  warn "Existing install has drifted from its bundled manifest:"
  cat "${drift_log}" >&2
  rm -f "${drift_log}"

  if [[ "${FORCE_OVERWRITE_LOCAL_EDITS}" -eq 1 ]]; then
    warn "--force-overwrite-local-edits set; proceeding anyway."
    warn "The drifted files will be preserved at ${PLUGIN_PREV}/ for inspection."
    return 0
  fi

  err "Refusing to clobber hand-edited files."
  err "Either reconcile the edits, OR re-run with --force-overwrite-local-edits."
  err "(Edits will still be backed up at ${PLUGIN_PREV}/ if you proceed.)"
  exit 1
}

step_stage_new_install() {
  log "Staging new install at ${PLUGIN_NEW}"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    warn "(dry-run) would rsync ${SELF_DIR}/semantic-sidekick/ -> ${PLUGIN_NEW}/"
    return 0
  fi
  mkdir -p "${SS_ROOT}"
  rm -rf "${PLUGIN_NEW}"
  mkdir -p "${PLUGIN_NEW}"

  # rsync brings in the plugin sub-manifest at PLUGIN_NEW/MANIFEST.json
  # — that's the one we use for post-install drift detection.
  rsync -a "${SELF_DIR}/semantic-sidekick/" "${PLUGIN_NEW}/"

  if [[ ! -f "${PLUGIN_NEW}/MANIFEST.json" ]]; then
    err "Plugin sub-manifest missing at ${PLUGIN_NEW}/MANIFEST.json"
    err "Tarball was likely built with an older build script. Rebuild with current scripts/build-offline-tarball.sh."
    exit 1
  fi
}

step_install_models() {
  log "Installing model cache to ${MODELS_DIR}"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    warn "(dry-run) would rsync ${SELF_DIR}/models/ -> ${MODELS_DIR}/"
    return 0
  fi
  mkdir -p "${MODELS_DIR}"
  # rsync skips files that already match (size + mtime). The manifest is the
  # authoritative integrity check; this just avoids re-copying ~90 MB unnecessarily.
  rsync -a "${SELF_DIR}/models/" "${MODELS_DIR}/"
  ok "Model cache placed"
}

step_atomic_swap() {
  log "Atomic swap"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    warn "(dry-run) would swap: ${PLUGIN_DIR} -> ${PLUGIN_PREV}, ${PLUGIN_NEW} -> ${PLUGIN_DIR}"
    return 0
  fi
  if [[ -d "${PLUGIN_PREV}" ]]; then
    log "Removing prior backup at ${PLUGIN_PREV}"
    rm -rf "${PLUGIN_PREV}"
  fi
  if [[ -d "${PLUGIN_DIR}" ]]; then
    mv "${PLUGIN_DIR}" "${PLUGIN_PREV}"
    log "Previous install moved to ${PLUGIN_PREV}"
  fi
  mv "${PLUGIN_NEW}" "${PLUGIN_DIR}"
  ok "New install activated at ${PLUGIN_DIR}"
}

step_run_link_skills() {
  log "Wiring plugin runtime (link-skills)"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    warn "(dry-run) would run: node ${PLUGIN_DIR}/scripts/link-skills.js"
    return 0
  fi
  if ! node "${PLUGIN_DIR}/scripts/link-skills.js"; then
    warn "link-skills.js exited non-zero. Review output above."
    warn "The plugin tree is in place, but skill/hook registration may be incomplete."
  fi
}

step_write_env_file() {
  log "Writing env file at ${ENV_FILE}"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    warn "(dry-run) skipping env file write"
    return 0
  fi
  cat > "${ENV_FILE}" <<'EOF'
# semantic-sidekick offline install — sourced env.
# Forces @huggingface/transformers to never reach for network.
export HF_HUB_OFFLINE=1
EOF
  ok "Env file written"
}

step_persist_rc() {
  # Only runs when --persist-rc was passed. Default behavior is non-invasive:
  # we write env.sh and let the user source it themselves.
  if [[ "${PERSIST_RC}" -eq 0 ]]; then
    return 0
  fi
  local rc="${HOME}/.bashrc"
  local marker_start="# >>> semantic-sidekick offline install >>>"
  local marker_end="# <<< semantic-sidekick offline install <<<"
  local source_line="[ -f \"${ENV_FILE}\" ] && . \"${ENV_FILE}\""

  if [[ -f "${rc}" ]] && grep -qF "${marker_start}" "${rc}"; then
    log "RC block already present in ${rc}"
    return 0
  fi

  log "Appending source line to ${rc}"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    warn "(dry-run) would append source line to ${rc}"
    return 0
  fi
  {
    echo ""
    echo "${marker_start}"
    echo "${source_line}"
    echo "${marker_end}"
  } >> "${rc}"
  warn "Open a new shell (or 'source ${rc}') so HF_HUB_OFFLINE takes effect."
}

do_install() {
  require_node
  step_check_tarball_integrity
  step_resolve_versions
  step_decide_action
  step_drift_check_existing
  step_stage_new_install
  step_install_models
  step_atomic_swap
  step_run_link_skills
  step_write_env_file
  step_persist_rc

  echo ""
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    ok "Dry run complete (no changes made): version ${TARBALL_VERSION} (gitSha ${TARBALL_SHA})"
  else
    ok "Install complete: version ${TARBALL_VERSION} (gitSha ${TARBALL_SHA})"
  fi
  echo ""
  echo "Next steps:"
  echo "  1. Restart Claude Code so it re-detects the plugin."
  if [[ "${PERSIST_RC}" -eq 0 ]]; then
    echo "  2. Add this to your shell rc to enable offline mode:"
    echo "       [ -f \"${ENV_FILE}\" ] && . \"${ENV_FILE}\""
    echo "     Or re-run install with --persist-rc to do it automatically."
  fi
  echo "  3. Verify state: ${PLUGIN_DIR}/install-offline.sh --status"
  if [[ -d "${PLUGIN_PREV}" ]]; then
    echo "  4. Rollback (if needed): ./install-offline.sh --rollback"
  fi
}

# ----------------------------------------------------------------------------
# Dispatch
# ----------------------------------------------------------------------------
case "${MODE}" in
  install)  do_install ;;
  rollback) do_rollback ;;
  status)   do_status ;;
  verify)   do_verify ;;
  *) err "Unknown mode: ${MODE}"; exit 2 ;;
esac
