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
