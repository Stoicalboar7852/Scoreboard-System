# Progress

Status of each implementation phase. Updated at the end of every phase with the exact
results of `pnpm typecheck`, `pnpm lint` and `pnpm test`.

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 0 | Scaffold | done | pnpm workspace, Fastify /healthz, Vite placeholder, Docker/Compose/Caddy, local Postgres script |
| 1 | Shared domain package | done | 224 tests, 97% statements / 91% branches coverage |
| 2 | Database and REST API | done | Prisma schema + init migration, auth, CRUD, ladders, import/export, audit, 30 integration tests |
| 3 | Real-time layer | done | Socket.IO gateway, LiveService + scheduler, persistence, chronological restart replay, 15 live tests |
| 4 | Web app shell | done | Router, theme tokens, socket client + time sync, live store, offline queue, error boundaries, PWA, wake lock, version reload |
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

### Phase 3 — Real-time layer
- `LiveService`: server-authoritative clocks and court states; every command runs through a queue,
  every change is persisted (`Clock`, `CourtLiveState`) before it is emitted. Effects from the shared
  reducer drive fixture LIVE/COMPLETED transitions, slot assignment, linked-clock notifications.
- Scheduler: one `setTimeout` per running clock/time-out plus a 1 s safety sweep. Restart recovery
  replays missed expiries across all clocks in chronological order (so "Pairs wait for Fours" resolves
  exactly as it would have live), finalising results and assigning slots as it goes.
- Socket.IO gateway: handshake auth (admin cookie or device token), Zod validation of every payload,
  acks `{ ok, state } | { ok, error }`, idempotent `actionId` cache (5 min), rooms
  `court:{id}` / `clock:{id}` / `session:{id}` / `admin` with snapshots on join, `time:ping`/`time:pong`,
  `app:version` on connect, controller `courtId` verification, heartbeat "last seen" tracking.
- Tests: 12 fake-timer flows (go live, full AUTO night incl. auto-finalise and next-slot assignment,
  pause/resume/adjust, linked waiting + joint restart, unlinked cadence, time outs, admin overrides,
  single mode + advance slot, end night, warnings) + 2 restart-recovery tests (mid-half crash, paused
  clock) + 3 socket tests (ping/version, validation/auth acks, full controller/scoreboard/admin flow
  with an idempotent retry). Server suite: 10 files, 45 tests. Root: 270 tests, typecheck and lint pass.

### Phase 4 — Web app shell
- Vite + React 19 + Tailwind 4 with the §10 tokens as CSS variables (`@theme`), overridden at runtime
  from the venue's accent settings by `<ThemeProvider>`.
- React Router 7 routes for every surface with a route-level `<ErrorBoundary>` (fault banner + retry /
  reload, never a blank page) and lazy route modules.
- `liveSocket()`: one Socket.IO connection per app (device token or admin cookie), Socket.IO
  auto-reconnect, status connected / reconnecting / offline (after 10 s), `time:ping` burst then every
  60 s with a 5-sample median offset (`TimeSync`), acked emits with an 8 s timeout, `app:version`.
- Zustand live store (snapshot + versioned updates), `OfflineQueue` (localStorage-backed, ordered,
  re-entrancy safe) for Phase 5's controller taps, TanStack Query client with typed `ApiError`.
- `<Countdown>` writes digits from requestAnimationFrame straight to the DOM (no React renders while a
  clock runs); `useWakeLock`, `useVersionReload` (scoreboards auto-reload, others prompt via toast),
  PWA manifest + service worker registration.
- Verified in the browser: `/scoreboard/:courtId` joins the court, shows offset ≈ 1 ms / RTT 3 ms,
  renders the live Half 1 countdown after `pnpm --filter @scoreboard/server dev:live go`, and after
  killing and restarting the server it reconnects and continues from the persisted clock.
- Web tests: 5 files, 14 tests (time sync median, offline queue, live store versions, connection badge,
  error boundary, home). Root: typecheck, lint (1 fast-refresh warning), 283 tests pass.
- Noted: one intermittent failure of `test/sessions.test.ts` ("creates a session…") in a full-suite run
  that did not reproduce in three reruns; tracked below.

## Known gaps / TODO register

- T-001: intermittent `apps/server/test/sessions.test.ts` failure seen once in a full run (Phase 4);
  passes in isolation and on reruns. Investigate if it recurs (suspect cross-file DB timing).

## Phase logs

### Phase 0 — Scaffold
- Toolchain on this machine: Node 22.23.2 (Homebrew keg `node@22`), pnpm 11.24.0, PostgreSQL 16.15
  (Homebrew, run project-locally via `pnpm db:local`). Docker is not installed on the dev machine, so
  the Docker image is built and verified in Phase 12 documentation terms only unless Docker is added.
- `pnpm typecheck`: pass (3 packages). `pnpm lint`: pass (ESLint + Prettier). `pnpm test`: 3 files,
  3 tests pass. `pnpm build`: web dist (PWA precache 9 entries) + server bundle.
- `pnpm dev`: server on :3000 (`/healthz` 200), web on :5173 (proxy to server verified).
- Deferred: Playwright browsers are installed on first `pnpm test:e2e` (`pnpm exec playwright install chromium`).
