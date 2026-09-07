# Architecture

(Populated progressively; final version includes the clock sequence diagram.)

## Overview

One cloud-hosted Node.js server (Fastify 5 REST + Socket.IO 4 real-time + Prisma 6 on
PostgreSQL 16) serves a single React SPA. The SPA exposes four surfaces by route:

| Route | Surface | Auth |
|-------|---------|------|
| `/controller/:courtId` | Referee controller (PWA) | Device token (exchanged for the venue PIN) |
| `/scoreboard/:courtId` | Kiosk display | None (read-only) |
| `/admin/*` | Office staff | Cookie session |
| `/ladders`, `/draw/:id`, `/tonight` | Public | None |

All business rules live in `packages/shared` as pure functions.

## Shared domain package (`packages/shared`)

Pure TypeScript with no I/O. Layout:

| Path | Purpose |
|------|---------|
| `domain/` | Enums, entity schemas, live-state schemas (`ClockState`, `CourtLiveState`), REST input schemas |
| `events/socket.ts` | Registry of every socket event with its Zod schema, admin/controller classification, room names |
| `clock/reducer.ts` | `clockReducer(state, event, ctx)` → `{ ok, state, effects }`; `remainingMs`; `fastForward` for restart recovery |
| `clock/display.ts` | `describeClock` — one source of truth for phase labels, colours and which countdown to show |
| `timeout/`, `court/` | Time-out lifecycle and score intents |
| `ladder/` | `LadderRule` (discriminated union) with presets; `computeLadder` |
| `draw/` | Round robin, session dates, per-night assignment (DFS + local search), `generateDraw` |
| `clash/validate.ts` | Hard-constraint validator shared by the generator, the session grid and the importer |
| `finals/` | Finals template schema/default and placeholder resolver |
| `excel/rows.ts` | Spreadsheet row parser producing per-row errors and warnings |
| `theme/` | Colour tokens, CSS variable names, WCAG contrast helpers |

### Clock reducer contract

The server owns clock state and applies events through the reducer. Every successful
transition bumps `version` and returns ordered effects the server must perform:

- `GAME_STARTED { slotIndex }` — mark the courts' fixtures for this slot LIVE.
- `GAME_ENDED { slotIndex }` — finalise those fixtures with current scores, invalidate ladders.
- `SLOT_ADVANCED { slotIndex }` — assign each court its fixture for the new slot.
- `ENTERED_BETWEEN_GAMES { phaseStartedAtMs, phaseDurationMs }` — dispatch
  `LINKED_ENTERED_BETWEEN_GAMES` to clocks waiting on this one.
- `BECAME_UNAVAILABLE` — dispatch `LINKED_UNAVAILABLE` to clocks waiting on this one.

Expiry is anchored to the true phase end (`phaseStartedAtMs + phaseDurationMs`), not to the
moment the scheduler fired, so late timers never accumulate drift.

## Server (`apps/server`)

```
src/
  index.ts          bootstrap, graceful shutdown (SIGTERM/SIGINT)
  app.ts            buildApp({ config, db, now }) — plugins, services, routes, SPA static serving
  config.ts         Zod-validated environment (loads the nearest .env)
  errors.ts         AppError hierarchy + central error handler (never leaks stacks)
  plugins/          security (cookie, CORS, helmet, rate-limit), auth (request.admin / request.device)
  services/         auth, settings, ladder (cached), fixtures (results, finals), sessions (grid + validation),
                    clash (explicit + roster-derived), draw (generator I/O), import, export
  routes/           one file per resource; every body/query parsed with the shared Zod schemas
  mappers/          Prisma rows → shared entity shapes (dates → epoch ms)
prisma/             schema.prisma, migrations/, seed.ts
test/               integration tests on a real PostgreSQL test database
```

Authentication: `POST /api/auth/login` sets a signed HTTP-only cookie holding an `AdminSession` id;
`POST /api/auth/controller` exchanges the venue PIN for a device token returned once and stored hashed.
Every request resolves `request.admin` and `request.device`; routes declare `requireAdmin`,
`requireController` or `requireAdminOrController` pre-handlers. Public routes are unauthenticated,
rate-limited and read-only.
