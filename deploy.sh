#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

usage() {
  echo "Usage: ./deploy.sh <dev|prod>" >&2
  exit 2
}

[[ $# -eq 1 ]] || usage
ENVIRONMENT="$1"
[[ "$ENVIRONMENT" == "dev" || "$ENVIRONMENT" == "prod" ]] || usage

for command in docker; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command not found: $command" >&2
    exit 1
  }
done
docker compose version >/dev/null

if [[ "$ENVIRONMENT" == "dev" ]]; then
  [[ -f .env ]] || {
    echo "Missing .env. Copy .env.example to .env and configure it first." >&2
    exit 1
  }
  APP_URL=http://localhost:3005 \
    GOOGLE_REDIRECT_URI=http://localhost:3005/api/auth/google/callback \
    APP_PORT=3005 \
    NODE_ENV=development \
    docker compose --env-file .env --project-name shuffle-dev up -d --build --force-recreate web
  echo "Development deployment is available at http://localhost:3005"
    echo "Register this Google OAuth authorized redirect URI: http://localhost:3005/api/auth/google/callback"
    exit 0
fi

command -v ssh >/dev/null 2>&1 || {
  echo "Required command not found: ssh" >&2
  exit 1
}
command -v rsync >/dev/null 2>&1 || {
  echo "Required command not found: rsync" >&2
  exit 1
}

PROD_ENV_FILE=.env.production
[[ -f "$PROD_ENV_FILE" ]] || {
  echo "Missing .env.production. Copy .env.production.example to .env.production and set production secrets." >&2
  exit 1
}

DEPLOY_HOST="$(awk -F= '$1 == "DEPLOY_HOST" { sub(/^[^=]*=/, ""); print; exit }' "$PROD_ENV_FILE")"
DEPLOY_PATH="$(awk -F= '$1 == "DEPLOY_PATH" { sub(/^[^=]*=/, ""); print; exit }' "$PROD_ENV_FILE")"
DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/shuffle}"

PROD_APP_URL="$(awk -F= '$1 == "APP_URL" { sub(/^[^=]*=/, ""); print; exit }' "$PROD_ENV_FILE")"
PROD_REDIRECT_URI="$(awk -F= '$1 == "GOOGLE_REDIRECT_URI" { sub(/^[^=]*=/, ""); print; exit }' "$PROD_ENV_FILE")"
[[ "$PROD_APP_URL" == "https://shuffle.ll.rs" ]] || {
  echo "Set APP_URL=https://shuffle.ll.rs in .env.production." >&2
  exit 1
}
[[ "$PROD_REDIRECT_URI" == "https://shuffle.ll.rs/api/auth/google/callback" ]] || {
  echo "Set GOOGLE_REDIRECT_URI=https://shuffle.ll.rs/api/auth/google/callback in .env.production." >&2
  exit 1
}

if [[ ! "$DEPLOY_HOST" =~ ^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$ ]]; then
  echo "Set DEPLOY_HOST in .env.production to a valid SSH destination, for example root@ll.rs." >&2
  exit 1
fi
if [[ ! "$DEPLOY_PATH" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  echo "DEPLOY_PATH in .env.production must be an absolute path containing only letters, numbers, dots, underscores, slashes, or hyphens." >&2
  exit 1
fi

echo "Syncing application files to ${DEPLOY_HOST}:${DEPLOY_PATH} ..."
ssh "$DEPLOY_HOST" "mkdir -p '$DEPLOY_PATH'"
rsync -az \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='.env' \
  --exclude='.env.*' \
  ./ "$DEPLOY_HOST:$DEPLOY_PATH/"
ssh "$DEPLOY_HOST" "umask 077 && cat > '$DEPLOY_PATH/.env'" < "$PROD_ENV_FILE"

echo "Building and starting the production deployment for https://shuffle.ll.rs on ${DEPLOY_HOST} ..."
ssh "$DEPLOY_HOST" \
  "cd '$DEPLOY_PATH' && chmod 600 .env && docker compose --env-file .env --project-name shuffle-prod up -d --build --force-recreate --remove-orphans web"

echo "Production deployment completed: https://shuffle.ll.rs"
