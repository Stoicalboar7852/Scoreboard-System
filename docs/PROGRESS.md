# Progress

Status of each implementation phase. Updated at the end of every phase with the exact
results of `pnpm typecheck`, `pnpm lint` and `pnpm test`.

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 0 | Scaffold | done | pnpm workspace, Fastify /healthz, Vite placeholder, Docker/Compose/Caddy, local Postgres script |
| 1 | Shared domain package | done | 224 tests, 97% statements / 91% branches coverage |
| 2 | Database and REST API | done | Prisma schema + init migration, auth, CRUD, ladders, import/export, audit, 30 integration tests |
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

### Phase 1 — Shared domain package
- Modules: domain enums/entities/live-state/inputs (Zod), socket event registry, clock reducer +
  fast-forward + display helper, time-out and score helpers, ladder rule (discriminated union) and
  engine, draw generator (round robin, dates, DFS + local search assignment, conflict report), clash
  validator, finals template + resolver, Excel row parser, theme tokens + WCAG contrast check, time
  formatting, idle-screen logic.
- `pnpm --filter @scoreboard/shared test:coverage`: 18 files, 224 tests pass. Coverage 97.38%
  statements, 91.03% branches, 98.19% functions, 98.82% lines (threshold 90/85/90/90 enforced).
- Draw performance test (10 competitions × 12 teams × 20 weeks, 4 nights, 10 courts, clash links)
  runs in about 1 s on the dev laptop against the 10 s target.
- `pnpm typecheck` and `pnpm lint`: pass.

### Phase 2 — Database and REST API
- Prisma schema for every §5 entity plus `AdminSession`, `CourtFormat`, `FinalsSeed`; one `init` migration
  applied on boot by the Docker entrypoint (`prisma migrate deploy`).
- Fastify app: cookie sessions (argon2 password, signed HTTP-only cookie, DB-backed sessions), venue PIN →
  device token (sha256 hashed), helmet CSP, CORS locked to `APP_ORIGIN`, global + per-route rate limits,
  central error handler (`{ error: { code, message, details? } }`), append-only audit log.
- Routes: settings, audit, courts, formats, seasons, competitions, teams, players, clash links (explicit +
  derived from shared players), sessions (list/today/detail/validate/grid save/publish/delete), fixtures,
  results, adjustments, ladders (cached), import (template/preview/commit in one transaction), export
  (session xlsx, season xlsx, printable JSON, ladder CSV), public read-only endpoints, controller bootstrap.
- `pnpm seed` builds the §14 demo venue (6 courts, Fours/Pairs, Monday 3×6 pairs, Wednesday fours+pairs
  8 teams with two shared players, two generated 10-week draws, tonight's session, admin from `.env`).
- `pnpm --filter @scoreboard/server test`: 8 files, 30 tests pass against `scoreboard_test`.
- Root: `pnpm typecheck`, `pnpm lint`, `pnpm test` (224 shared + 30 server + 1 web) pass.
- Verified manually: server boots on the seeded DB; `/healthz` reports database ok; public tonight/ladders,
  login, admin settings, typed 401 and SPA fallback all respond correctly.

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
