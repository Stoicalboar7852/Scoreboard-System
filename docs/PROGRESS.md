# Progress

Status of each implementation phase. Updated at the end of every phase with the exact
results of `pnpm typecheck`, `pnpm lint` and `pnpm test`.

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 0 | Scaffold | done | pnpm workspace, Fastify /healthz, Vite placeholder, Docker/Compose/Caddy, local Postgres script |
| 1 | Shared domain package | not started | |
| 2 | Database and REST API | not started | |
| 3 | Real-time layer | not started | |
| 4 | Web app shell | not started | |
| 5 | Controller | not started | |
| 6 | Scoreboard | not started | |
| 7 | Admin: live control and setup | not started | |
| 8 | Admin: sessions, manual entry, Excel import/export | not started | |
| 9 | Draw generation and finals | not started | |
| 10 | Results, ladders, public pages | not started | |
| 11 | Hardening | not started | |
| 12 | Deployment and hand-over | not started | |

## Known gaps / TODO register

None yet.

## Phase logs

### Phase 0 — Scaffold
- Toolchain on this machine: Node 22.23.2 (Homebrew keg `node@22`), pnpm 11.24.0, PostgreSQL 16.15
  (Homebrew, run project-locally via `pnpm db:local`). Docker is not installed on the dev machine, so
  the Docker image is built and verified in Phase 12 documentation terms only unless Docker is added.
- `pnpm typecheck`: pass (3 packages). `pnpm lint`: pass (ESLint + Prettier). `pnpm test`: 3 files,
  3 tests pass. `pnpm build`: web dist (PWA precache 9 entries) + server bundle.
- `pnpm dev`: server on :3000 (`/healthz` 200), web on :5173 (proxy to server verified).
- Deferred: Playwright browsers are installed on first `pnpm test:e2e` (`pnpm exec playwright install chromium`).
