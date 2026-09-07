# Scoreboard System

Multi-court scoreboard and competition management for time-based volleyball: referee
controllers, kiosk scoreboards, an admin panel with live clock control, fixtures, draw
generation and configurable ladders, plus public ladder pages.

## Quick start (development)

Requirements: Node.js 22 LTS, pnpm 10+, PostgreSQL 16 (Docker or a local install).

```bash
pnpm install
cp .env.example .env            # edit passwords / secrets
pnpm db:local start             # or: docker compose up -d db
pnpm db:migrate                 # applies Prisma migrations (from Phase 2)
pnpm seed                       # demo venue (from Phase 2)
pnpm dev                        # server on :3000, web on :5173
```

Open http://localhost:5173. Health check: http://localhost:3000/healthz

## Repository layout

```
apps/server     Fastify + Socket.IO + Prisma
apps/web        React SPA: /controller, /scoreboard, /admin, /ladders
packages/shared Pure domain logic: types, schemas, clock, ladder, draw
docs/           ARCHITECTURE, DECISIONS, PROGRESS, KIOSK-SETUP, DEPLOY
```

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Run server and web in watch mode |
| `pnpm typecheck` | `tsc` across all packages |
| `pnpm lint` | ESLint + Prettier check |
| `pnpm test` | Vitest across all packages |
| `pnpm test:e2e` | Playwright smoke suite |
| `pnpm build` | Production build (web dist + server bundle) |
| `pnpm db:local {start,stop,status,reset}` | Project-private PostgreSQL without Docker |

## Documentation

See `docs/`.
