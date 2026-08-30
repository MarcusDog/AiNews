#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
output_dir="${AYA_RELEASE_OUTPUT_DIR:-${TMPDIR:-/tmp}/aya-releases}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
revision="$(git -C "$repo_root" rev-parse --short=12 HEAD 2>/dev/null || printf 'nogit')"
release_id="${AYA_RELEASE_ID:-aya-${timestamp}-${revision}-$$}"
staging_root="$(mktemp -d "${TMPDIR:-/tmp}/aya-release.XXXXXX")"
release_root="$staging_root/release"

cleanup() {
  case "$staging_root" in
    "${TMPDIR:-/tmp}"/aya-release.*) rm -rf -- "$staging_root" ;;
  esac
}
trap cleanup EXIT

mkdir -p "$output_dir" "$release_root"

if [ "${AYA_SKIP_BUILD:-0}" != "1" ]; then
  (cd "$repo_root/client" && npm ci && npm run build)
fi

rsync -a \
  --exclude='.git' \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='node_modules/' \
  --exclude='.gstack/' \
  --exclude='release/' \
  --exclude='backups/' \
  --exclude='server/data/' \
  --exclude='server/logs/' \
  --exclude='server/cache/' \
  --exclude='client/dist/.vite/' \
  --exclude='*.db' \
  --exclude='*.db-shm' \
  --exclude='*.db-wal' \
  --exclude='*.log' \
  --exclude='*.pid' \
  "$repo_root/" "$release_root/"

node "$script_dir/release-manifest.mjs" create "$release_root" "$release_id" >/dev/null
archive="$output_dir/${release_id}.tar.gz"
(cd "$release_root" && find . -type f -print | LC_ALL=C sort | tar -czf "$archive" -T -)

if command -v sha256sum >/dev/null 2>&1; then
  archive_sha="$(sha256sum "$archive" | awk '{print $1}')"
else
  archive_sha="$(shasum -a 256 "$archive" | awk '{print $1}')"
fi
printf '%s  %s\n' "$archive_sha" "$(basename "$archive")" > "${archive}.sha256"
printf '%s\n' "$archive"
