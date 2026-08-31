#!/usr/bin/env bash

set -euo pipefail

usage() {
  printf 'Usage: %s ARCHIVE DEPLOY_ROOT\n       %s --rollback DEPLOY_ROOT\n' "$0" "$0" >&2
  exit 2
}

replace_link_atomically() {
  source_link="$1"
  target_link="$2"
  node -e "require('node:fs').renameSync(process.argv[1], process.argv[2])" "$source_link" "$target_link"
}

if [ "${1:-}" = '--rollback' ]; then
  deploy_root="${2:-}"
  [ -n "$deploy_root" ] || usage
  [ -L "$deploy_root/previous" ] || { printf 'No previous release is available.\n' >&2; exit 1; }
  previous_target="$(readlink "$deploy_root/previous")"
  next_link="$deploy_root/.current.rollback.$$"
  ln -s "$previous_target" "$next_link"
  replace_link_atomically "$next_link" "$deploy_root/current"
  if [ -n "${AYA_RESTART_COMMAND:-}" ]; then
    (cd "$deploy_root/current" && sh -c "$AYA_RESTART_COMMAND")
  else
    (cd "$deploy_root/current" && docker compose up -d --build)
  fi
  printf '%s\n' "$previous_target"
  exit 0
fi

archive="${1:-}"
deploy_root="${2:-}"
[ -f "$archive" ] && [ -n "$deploy_root" ] || usage
[ -f "${archive}.sha256" ] || { printf 'Missing archive checksum: %s.sha256\n' "$archive" >&2; exit 1; }

expected_sha="$(awk 'NR == 1 { print $1 }' "${archive}.sha256")"
if command -v sha256sum >/dev/null 2>&1; then
  actual_sha="$(sha256sum "$archive" | awk '{print $1}')"
else
  actual_sha="$(shasum -a 256 "$archive" | awk '{print $1}')"
fi
[ "$expected_sha" = "$actual_sha" ] || { printf 'Archive checksum mismatch.\n' >&2; exit 1; }

if tar -tzf "$archive" | awk '/^(\/|\.\.\/)|\/\.\.\// { bad=1 } END { exit bad ? 0 : 1 }'; then
  printf 'Archive contains an unsafe path.\n' >&2
  exit 1
fi

mkdir -p "$deploy_root/releases" "$deploy_root/staging" \
  "$deploy_root/failed" "$deploy_root/shared/server/data" \
  "$deploy_root/shared/server/logs" "$deploy_root/shared/server/cache"
staging="$deploy_root/staging/release.$$"
mkdir -p "$staging"
trap 'case "$staging" in "$deploy_root"/staging/release.*) rm -rf -- "$staging" ;; esac' EXIT
tar -xzf "$archive" -C "$staging"

release_id="$(node "$staging/scripts/release-manifest.mjs" verify "$staging")"
release_dir="$deploy_root/releases/$release_id"
[ ! -e "$release_dir" ] || { printf 'Immutable release already exists: %s\n' "$release_id" >&2; exit 1; }

legacy_root="${AYA_LEGACY_ROOT:-}"
if [ -n "$legacy_root" ] && [ -d "$legacy_root" ]; then
  [ -f "$deploy_root/shared/server/.env" ] || { [ ! -f "$legacy_root/server/.env" ] || cp "$legacy_root/server/.env" "$deploy_root/shared/server/.env"; }
  if [ -d "$legacy_root/server/data" ] && [ -z "$(find "$deploy_root/shared/server/data" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
    rsync -a "$legacy_root/server/data/" "$deploy_root/shared/server/data/"
  fi
fi

for runtime_dir in data logs cache; do
  ln -s "$deploy_root/shared/server/$runtime_dir" "$staging/server/$runtime_dir"
done
if [ -f "$deploy_root/shared/server/.env" ]; then
  ln -s "$deploy_root/shared/server/.env" "$staging/server/.env"
fi

mv "$staging" "$release_dir"
staging="$deploy_root/staging/release.moved.$$"
previous_target=''
if [ -L "$deploy_root/current" ]; then
  previous_target="$(readlink "$deploy_root/current")"
elif [ -e "$deploy_root/current" ]; then
  printf 'Refusing to replace a non-symlink current path.\n' >&2
  exit 1
fi

next_link="$deploy_root/.current.next.$$"
ln -s "$release_dir" "$next_link"
replace_link_atomically "$next_link" "$deploy_root/current"

restart_release() {
  if [ -n "${AYA_RESTART_COMMAND:-}" ]; then
    (cd "$deploy_root/current" && sh -c "$AYA_RESTART_COMMAND")
  else
    (cd "$deploy_root/current" && docker compose up -d --build)
  fi
}

health_release() {
  if [ -n "${AYA_HEALTH_COMMAND:-}" ]; then
    (cd "$deploy_root/current" && sh -c "$AYA_HEALTH_COMMAND")
  else
    curl --fail --silent --show-error --max-time "${AYA_HEALTH_TIMEOUT_SECONDS:-20}" \
      "${AYA_HEALTH_URL:-http://127.0.0.1:8080/health}" >/dev/null
  fi
}

if ! restart_release || ! health_release; then
  if [ -n "$previous_target" ]; then
    rollback_link="$deploy_root/.current.failed.$$"
    ln -s "$previous_target" "$rollback_link"
    replace_link_atomically "$rollback_link" "$deploy_root/current"
    restart_release || true
  fi
  failed_dir="$deploy_root/failed/${release_id}.$(date -u +%Y%m%dT%H%M%SZ).$$"
  mv "$release_dir" "$failed_dir"
  printf 'Activation failed health verification; previous release restored.\n' >&2
  exit 1
fi

if [ -n "$previous_target" ]; then
  previous_link="$deploy_root/.previous.next.$$"
  ln -s "$previous_target" "$previous_link"
  replace_link_atomically "$previous_link" "$deploy_root/previous"
fi
printf '%s\n' "$release_id"
