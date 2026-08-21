#!/usr/bin/env bash
#
# Deploy the Phillips Consulting TMS demo API to its own directory on the colat
# server. Nothing here touches the inspirtag stack.
#
#   ./deploy.sh                                  # uses the defaults below
#   TMS_SSH_HOST=user@host TMS_SSH_PORT=22 ./deploy.sh
#
# Requires: ssh + rsync on this machine, docker compose on the server.

set -euo pipefail

SSH_HOST="${TMS_SSH_HOST:-administrator@173.208.144.68}"
SSH_PORT="${TMS_SSH_PORT:-10041}"
# Docker apps on this host live under /opt (the colat API is /opt/colat-api);
# /var/www is reserved for the static SPAs.
REMOTE_DIR="${TMS_REMOTE_DIR:-/opt/philips-tms-api}"
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }

say "Deploying ${LOCAL_DIR} -> ${SSH_HOST}:${REMOTE_DIR}"

say "Ensuring the remote directory exists"
ssh -p "${SSH_PORT}" "${SSH_HOST}" "mkdir -p '${REMOTE_DIR}'"

say "Syncing files"
# Runtime state (issued tokens, throttle counters) and the server's .env are
# never overwritten from a workstation.
EXCLUDES=(
  '.git'
  '.env'
  'storage/tokens'
  'storage/throttle'
)

if command -v rsync >/dev/null 2>&1; then
  RSYNC_ARGS=()
  for item in "${EXCLUDES[@]}"; do
    RSYNC_ARGS+=(--exclude "${item}")
  done

  rsync -az --delete \
    -e "ssh -p ${SSH_PORT}" \
    "${RSYNC_ARGS[@]}" \
    "${LOCAL_DIR}/" "${SSH_HOST}:${REMOTE_DIR}/"
else
  # Git Bash on Windows ships ssh but not rsync — stream a tar instead.
  say "rsync not found; falling back to tar over ssh"

  TAR_ARGS=()
  for item in "${EXCLUDES[@]}"; do
    TAR_ARGS+=(--exclude "./${item}")
  done

  tar -czf - -C "${LOCAL_DIR}" "${TAR_ARGS[@]}" . \
    | ssh -p "${SSH_PORT}" "${SSH_HOST}" "tar -xzf - -C '${REMOTE_DIR}'"
fi

say "Preparing the environment file and storage permissions"
ssh -p "${SSH_PORT}" "${SSH_HOST}" bash -s <<REMOTE
set -euo pipefail
cd '${REMOTE_DIR}'

# First deploy only: seed .env from the example. APP_PATH_PREFIX stays empty —
# the host nginx proxy_pass already strips /tms before the request arrives.
if [ ! -f .env ]; then
  cp .env.example .env
  echo "created .env"
fi

# php-fpm runs as uid 82 (www-data) in the alpine image, so the runtime
# directories must belong to 82 or issuing a token fails with a 500. Re-applied
# on every deploy because extracting the archive resets directory modes.
#
# chown to another uid needs root, and once storage belongs to 82 an
# unprivileged account can no longer chmod it either - so try sudo first and
# only then fall back, without letting a failure abort the deploy.
mkdir -p storage/tokens storage/throttle

if sudo -n chown -R 82:82 storage 2>/dev/null; then
  echo "storage: chowned to 82:82 (passwordless sudo)"
elif sudo chown -R 82:82 storage 2>/dev/null; then
  echo "storage: chowned to 82:82"
elif chmod -R 0777 storage 2>/dev/null; then
  echo "storage: fell back to mode 0777"
else
  echo "WARNING: could not make storage/ writable by uid 82." >&2
  echo "         Sign-in will return 500 until this is fixed:" >&2
  echo "           sudo chown -R 82:82 '${REMOTE_DIR}/storage'" >&2
fi
REMOTE

say "Starting the containers"
ssh -p "${SSH_PORT}" "${SSH_HOST}" "cd '${REMOTE_DIR}' && (docker compose up -d --remove-orphans || docker-compose up -d --remove-orphans)"

say "Waiting for the service to answer"
ssh -p "${SSH_PORT}" "${SSH_HOST}" bash -s <<'REMOTE'
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8090/api/health >/dev/null 2>&1; then
    echo "healthy"
    curl -sS http://127.0.0.1:8090/api/health
    echo
    exit 0
  fi
  sleep 2
done
echo "The service did not become healthy in time. Container logs:" >&2
docker logs --tail 40 phillips-tms-nginx 2>&1 || true
docker logs --tail 40 phillips-tms-api 2>&1 || true
exit 1
REMOTE

say "Done."
cat <<'NEXT'

One-time step, if it has not been done yet:
  1. Copy deploy/host-nginx-snippet.conf into the api.colat.ng server block in
     /etc/nginx/sites-available/colat, above its catch-all `location /`.
  2. sudo nginx -t && sudo systemctl reload nginx
  3. Verify:  curl https://api.colat.ng/tms/api/health

NEXT
