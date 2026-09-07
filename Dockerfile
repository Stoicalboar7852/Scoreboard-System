# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Multi-stage build: installs the workspace, builds the web SPA and the server
# bundle, then produces a slim runtime image that applies migrations on boot.
# ---------------------------------------------------------------------------
ARG NODE_IMAGE=node:22-bookworm-slim

# ---- deps -----------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

# ---- build ----------------------------------------------------------------
FROM deps AS build
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/web apps/web
RUN pnpm --filter @scoreboard/server db:generate \
  && pnpm --filter @scoreboard/web build \
  && pnpm --filter @scoreboard/server build \
  && pnpm --filter @scoreboard/server --prod deploy /deploy/server

# ---- runtime --------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -r app && useradd -r -g app -d /app app
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST_DIR=/app/web
COPY --from=build --chown=app:app /deploy/server /app
COPY --from=build --chown=app:app /repo/apps/web/dist /app/web
COPY --chown=app:app docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:3000/healthz || exit 1
ENTRYPOINT ["/app/entrypoint.sh"]
