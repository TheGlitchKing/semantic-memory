#!/usr/bin/env bash
# Sourced by build-offline-tarball.sh. Resolves version + git sha + tarball name.
# Pure bash; no jq dependency (uses node since the repo already requires node).

set -euo pipefail

resolve_pkg_version() {
  local repo_root="${1:?repo_root required}"
  node -p "require('${repo_root}/package.json').version"
}

resolve_git_sha() {
  local repo_root="${1:?repo_root required}"
  git -C "${repo_root}" rev-parse --short=10 HEAD
}

resolve_git_dirty() {
  local repo_root="${1:?repo_root required}"
  if [[ -n "$(git -C "${repo_root}" status --porcelain)" ]]; then
    echo "dirty"
  else
    echo "clean"
  fi
}

# Tarball name: semantic-sidekick-offline-<version>-<sha>-<arch>
# Arch is hardcoded x64 per project scope (RHEL 9/10 + Ubuntu 24, x86_64).
resolve_tarball_basename() {
  local version="${1:?version required}"
  local sha="${2:?sha required}"
  local arch="${3:-x64}"
  echo "semantic-sidekick-offline-${version}-${sha}-${arch}"
}
