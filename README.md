# Scoreboard System

Multi-court scoreboard and competition management for time-based volleyball: referee
controllers (PWA), kiosk scoreboards, an admin panel with live clock control, fixtures, Excel
import, draw generation, finals and configurable ladders, plus public ladder pages.

One Node.js server (Fastify 5 REST + Socket.IO 4 + Prisma 6 on PostgreSQL 16) serves one React
SPA with four surfaces:

| URL | Who | Auth |
|-----|-----|------|
| `/controller` | Referees on tablets | Venue PIN, exchanged once per tablet for a device token |
| `/scoreboard` | Kiosk displays (one per court) | None |
| `/admin` | Office staff | Email + password |
| `/ladders`, `/ladders/:id`, `/draw/:id`, `/tonight` | Players, public, Facebook pin | None |

## Ten-minute quick start (clone → demo night)

You need **Node.js 22**, **pnpm 10+** and **PostgreSQL 16** (a local install or Docker).

```bash
# 0. Toolchain (skip what you already have)
corepack enable && corepack prepare pnpm@11.24.0 --activate   # pnpm
brew install node@22 postgresql@16                             # macOS; apt/choco equivalents work too

# 1. Install and configure
git clone <this repository> scoreboard && cd scoreboard
pnpm install
cp .env.example .env            # defaults are fine for local development

# 2. Database (pick one)
pnpm db:local start             # A: project-private PostgreSQL on port 54329, no Docker needed
docker compose up -d db         # B: PostgreSQL in Docker (then set DATABASE_URL port to 5432 in .env)

# 3. Schema + demo venue
pnpm db:migrate                 # applies the Prisma migrations and generates the Prisma client
pnpm seed                       # 6 courts, Fours/Pairs, Monday + Wednesday seasons, draws, tonight's session

# 4. Run
pnpm dev                        # server http://localhost:3000, web http://localhost:5173
```

Then run the demo night:

1. Open http://localhost:5173/admin and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`
   (defaults `admin@example.com` / `change-me-admin-password`).
2. **Live** → tonight's session is prepared by the seed → **Go live** → **Start** each clock
   (set a clock's mode to *Auto* and tick *Pairs wait for Fours* to run the whole night unattended).
3. Open http://localhost:5173/scoreboard in another window, pick a court: the clock is counting.
4. Open http://localhost:5173/controller (a phone or a narrow window), enter `CONTROLLER_PIN`
   (default `1234`), pick the same court and tap the score buttons: the scoreboard follows.
5. http://localhost:5173/ladders shows the public ladders; results arrive as games end.

Shortcut for developers: `pnpm --filter @scoreboard/server dev:live go` takes tonight's session
live and starts every clock without touching the UI (`end`, `reset`, `status` also exist).

### If a step fails

| Symptom | Cause and fix |
|---------|---------------|
| `pnpm db:local start` → `port 54329 is already in use` | Another copy of this project is running its own cluster. Stop it with `pnpm db:local stop` in that folder, or start this one elsewhere with `PGPORT_LOCAL=54330 pnpm db:local start` and change the port in `DATABASE_URL` in `.env`. |
| `pg_ctl: could not start server` with no explanation | Read `.local.nosync/postgres.log`; the script prints its last lines for you. |
| `Environment variable not found: DATABASE_URL` | `.env` is missing at the repository root: `cp .env.example .env`. The Prisma CLI is run through `scripts/with-env.mjs`, which loads that file. |
| `@prisma/client did not initialize yet` | The client has not been generated for this checkout: run `pnpm db:migrate` (or `pnpm db:generate`). |
| `pnpm db:local start` → `pg_ctl not found` | PostgreSQL 16 is not installed or not on `PATH`: `brew install postgresql@16`. |

Production deployment (Docker Compose + Caddy with automatic HTTPS) is in `docs/DEPLOY.md`;
kiosk and tablet setup in `docs/KIOSK-SETUP.md`.

## Repository layout

```
apps/server      Fastify + Socket.IO + Prisma (REST routes, live clock service, gateway, seed, load test)
apps/web         React 19 SPA: /controller, /scoreboard, /admin, public pages (Vite, Tailwind, PWA)
packages/shared  Pure domain logic: types, Zod schemas, clock reducer, ladder engine, draw generator,
                 clash validator, finals resolver, Excel row parser (>90 % coverage)
e2e/             Playwright: controller smoke, network drop, full AUTO night, accessibility
docker/          Caddyfile and container entrypoint;  Dockerfile + docker-compose.yml at the root
docs/            ARCHITECTURE, DECISIONS, PROGRESS, KIOSK-SETUP, DEPLOY, RECOVERY, fixtures-template.xlsx
scripts/         db-local.sh (private PostgreSQL), e2e-server.sh, icon generation
```

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Server and web in watch mode |
| `pnpm build` | Production build (web dist + server bundle) |
| `pnpm typecheck` | `tsc` across all packages |
| `pnpm lint` | ESLint + Prettier check (`pnpm lint:fix` to fix) |
| `pnpm test` | Vitest: shared (with coverage thresholds), server integration tests on a real PostgreSQL test DB, web component tests |
| `pnpm test:e2e` | Playwright suite against a built app on its own `scoreboard_e2e` database |
| `pnpm seed` | Demo venue (`SEED_RESET=true pnpm seed` wipes venue data first) |
| `pnpm db:migrate` / `pnpm db:generate` | Prisma migrate / client generation |
| `pnpm db:local {start,stop,status,reset}` | Project-private PostgreSQL without Docker (data in `.local.nosync/`) |
| `pnpm --filter @scoreboard/server load:test` | 150-client load test against a running server (`LOAD_URL`) |

## Documentation

- `docs/ARCHITECTURE.md` — system shape, clock reducer contract, real-time sequence diagram, client design.
- `docs/DECISIONS.md` — every judgement call made during the build (D-001 …).
- `docs/PROGRESS.md` — phase status, measurements (load, Lighthouse, accessibility), known gaps.
- `docs/DEPLOY.md` — cloud host with HTTPS, environment variables, backups, upgrades, on-premises fallback, Facebook.
- `docs/KIOSK-SETUP.md` — Windows 10 IoT + Edge kiosk mode, autoplay and wake-lock notes.
- `docs/RECOVERY.md` — what to do when the dev machine's iCloud Drive evicts project files.
