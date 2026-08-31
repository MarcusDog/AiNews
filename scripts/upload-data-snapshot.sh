#!/usr/bin/env bash

set -euo pipefail

snapshot="${1:-server/data/local-production-ready.db}"
[ -f "$snapshot" ] || { printf 'Dataset snapshot not found: %s\n' "$snapshot" >&2; exit 2; }
: "${AYA_DEPLOY_HOST:?AYA_DEPLOY_HOST is required}"
: "${AYA_DEPLOY_USER:?AYA_DEPLOY_USER is required}"

deploy_port="${AYA_DEPLOY_PORT:-22}"
deploy_root="${AYA_DEPLOY_ROOT:-/srv/ainews}"
remote="${AYA_DEPLOY_USER}@${AYA_DEPLOY_HOST}"
snapshot_name="dataset-$(date -u +%Y%m%dT%H%M%SZ)-$$.db"
remote_data="$deploy_root/shared/server/data"
remote_snapshot="$remote_data/$snapshot_name"
ssh_args=(-p "$deploy_port" -o BatchMode=yes)
scp_args=(-P "$deploy_port" -o BatchMode=yes)
if [ -n "${AYA_DEPLOY_KEY:-}" ]; then
  ssh_args+=(-i "$AYA_DEPLOY_KEY")
  scp_args+=(-i "$AYA_DEPLOY_KEY")
fi

if command -v sha256sum >/dev/null 2>&1; then
  local_sha="$(sha256sum "$snapshot" | awk '{print $1}')"
else
  local_sha="$(shasum -a 256 "$snapshot" | awk '{print $1}')"
fi

ssh "${ssh_args[@]}" "$remote" "mkdir -p '$remote_data'"
if command -v rsync >/dev/null 2>&1; then
  rsync -az --partial -e "ssh ${ssh_args[*]}" "$snapshot" "$remote:$remote_snapshot"
else
  scp "${scp_args[@]}" "$snapshot" "$remote:$remote_snapshot"
fi

ssh "${ssh_args[@]}" "$remote" "set -eu
  if command -v sha256sum >/dev/null 2>&1; then actual=\$(sha256sum '$remote_snapshot' | awk '{print \$1}'); else actual=\$(shasum -a 256 '$remote_snapshot' | awk '{print \$1}'); fi
  [ \"\$actual\" = '$local_sha' ]
  cd '$deploy_root/current'
  docker compose exec -T ainews-server node scripts/merge-content-snapshot.js \
    --live /app/data/ainews.db \
    --snapshot '/app/data/$snapshot_name' \
    --report '/app/logs/content-merge-$snapshot_name.json'
  curl --fail --silent --show-error --max-time 20 '${AYA_HEALTH_URL:-http://127.0.0.1:8080/health}' >/dev/null
  rm -f '$remote_snapshot'"

printf 'Uploaded and merged dataset SHA256 %s\n' "$local_sha"
