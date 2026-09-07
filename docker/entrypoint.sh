#!/bin/sh
set -eu
echo "[entrypoint] applying database migrations"
./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
if [ "${SEED_ON_BOOT:-false}" = "true" ]; then
  echo "[entrypoint] SEED_ON_BOOT=true: seeding demo data"
  node dist/seed.js
fi
echo "[entrypoint] starting server"
exec node dist/index.js
