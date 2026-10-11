#!/usr/bin/env bash

set -euo pipefail

archive="${1:-}"
[ -f "$archive" ] && [ -f "${archive}.sha256" ] || {
  printf 'Usage: AYA_DEPLOY_HOST=host AYA_DEPLOY_USER=user %s ARCHIVE\n' "$0" >&2
  exit 2
}

: "${AYA_DEPLOY_HOST:?AYA_DEPLOY_HOST is required}"
: "${AYA_DEPLOY_USER:?AYA_DEPLOY_USER is required}"
deploy_port="${AYA_DEPLOY_PORT:-22}"
deploy_root="${AYA_DEPLOY_ROOT:-/srv/ainews}"
remote_incoming="$deploy_root/incoming"
remote="${AYA_DEPLOY_USER}@${AYA_DEPLOY_HOST}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ssh_args=(-p "$deploy_port" -o BatchMode=yes)
scp_args=(-P "$deploy_port" -o BatchMode=yes)
if [ -n "${AYA_DEPLOY_KEY:-}" ]; then
  ssh_args+=(-i "$AYA_DEPLOY_KEY")
  scp_args+=(-i "$AYA_DEPLOY_KEY")
fi

ssh "${ssh_args[@]}" "$remote" "mkdir -p '$remote_incoming'"
if command -v rsync >/dev/null 2>&1; then
  rsync -az --partial -e "ssh ${ssh_args[*]}" \
    "$archive" "${archive}.sha256" "$script_dir/activate-release.sh" \
    "$remote:$remote_incoming/"
else
  scp "${scp_args[@]}" "$archive" "${archive}.sha256" "$script_dir/activate-release.sh" \
    "$remote:$remote_incoming/"
fi

remote_archive="$remote_incoming/$(basename "$archive")"
ssh "${ssh_args[@]}" "$remote" \
  "bash '$remote_incoming/activate-release.sh' '$remote_archive' '$deploy_root'"
