#!/usr/bin/env bash
# Builds the web app and starts the server in production mode for Playwright.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
export NODE_ENV=production
export PORT="${E2E_PORT:-3000}"
export APP_ORIGIN="http://localhost:${PORT}"
export WEB_DIST_DIR="$ROOT_DIR/apps/web/dist"
if [ -f .env ]; then set -a; source .env; set +a; fi
# A dedicated database keeps the smoke suite away from dev data and from vitest's test DB.
export DATABASE_URL="${E2E_DATABASE_URL:-${TEST_DATABASE_URL/scoreboard_test/scoreboard_e2e}}"
export CONTROLLER_PIN="${CONTROLLER_PIN:-1234}"
export ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin-local-dev}"
export APP_VERSION="${APP_VERSION:-e2e}"
echo "[e2e] database: $DATABASE_URL"
pnpm --filter @scoreboard/server exec prisma migrate deploy >/dev/null
SEED_RESET=true pnpm --filter @scoreboard/server seed >/dev/null
pnpm --filter @scoreboard/web build >/dev/null
pnpm --filter @scoreboard/server build >/dev/null
cd apps/server
node dist/index.js
