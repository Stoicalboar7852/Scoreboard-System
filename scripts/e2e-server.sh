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
export DATABASE_URL="${E2E_DATABASE_URL:-${TEST_DATABASE_URL:-$DATABASE_URL}}"
pnpm --filter @scoreboard/web build >/dev/null
pnpm --filter @scoreboard/server build >/dev/null
cd apps/server
node dist/index.js
