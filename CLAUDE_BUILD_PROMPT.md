# Build Prompt — Time-Based Volleyball Scoreboard & Competition System

> Paste everything below this line into a fresh Claude Code session opened in the
> `Scoreboard System` folder. Everything the session creates must live inside that folder.

---

## 1. Your role

You are a senior full-stack software architect and engineer specialising in real-time web
applications, distributed clock synchronisation, and sports competition management.
You own this project end to end: architecture, implementation, automated tests, seed data,
deployment configuration and documentation.

Build production-quality software, not a prototype. Make routine decisions yourself using
the decisions in section 11. Stop to ask a question only when something is genuinely
blocking and not covered anywhere in this document.

## 2. Mission

Build a web-based, multi-court scoreboard and competition-management system for a
volleyball venue that plays **time-based** volleyball (fixed-length halves on a shared
clock, not sets to 25). The system has four user-facing surfaces backed by one
cloud-hosted server:

1. **Controller** — a touch web app used by the referee on each court (tablet or phone).
2. **Scoreboard** — a read-only full-screen display for each court (Windows kiosk PC).
3. **Admin panel** — a multi-page web app for office staff: live clock control,
   competition and team setup, fixture entry and import, automated season draw
   generation with clash avoidance, results, and configurable ladders.
4. **Public pages** — live ladders and draws that anyone can open from a link.

The number of courts, game formats, competitions, nights, half lengths, and ladder rules
must all be data, never hard-coded.

## 3. Context you must design around

### 3.1 The sport as played at this venue

- A game is **Half 1 → Half time → Half 2**, run on a clock. Multiple courts run at once.
- Two game formats exist today. Both must be editable and more must be addable:

| Format | Half length | Half time | Gap between games | Time out |
|--------|-------------|-----------|-------------------|----------|
| Fours  | 20 min      | 1 min     | 1 min             | 1 min    |
| Pairs  | 14 min      | 1 min     | 1 min             | 1 min    |

- **Time outs** are called by the referee from the controller. They last one minute,
  are shown on the controller and scoreboard *instead of* the game clock while active,
  and **do not pause the game clock**, which keeps running underneath.
- On nights where Pairs and Fours run at the same time, the shorter Pairs games must
  **wait for the Fours games to finish** before the next Pairs game starts, so both
  formats start each new game together. On Pairs-only nights, Pairs runs on its own
  cadence. This is switched on per night by an admin checkbox.
- Several competitions ("grades") play on the same night and share the courts. Example
  today: Monday has five pairs grades; Wednesday and Thursday each have mixed pairs and
  fours grades. Names and counts do not matter — they are configured in the admin panel.
- **Player clashes**: a person may play in two competitions on the same night (for
  example C-grade mixed fours and B-grade mixed pairs). Their two teams must never be
  scheduled in the same time slot.
- **Season structure**: each competition plays one night a week. Every team plays once per
  night. The season length in weeks is chosen when generating the draw. After the regular
  season come finals:
  - Finals week 1: 1st vs 2nd (SF1) and 3rd vs 4th (SF2) in the same slot, then a
    preliminary final in the next slot: loser of SF1 vs winner of SF2.
  - Finals week 2: Grand final: winner of SF1 vs winner of the preliminary final.
- **Ladder points today**: 6 for a win, 4 for a draw, 2 for a loss, plus 1 bonus point for
  every 10 points the team scored in the game (a win scoring 40 points earns 6 + 4 = 10).
  The venue may switch to a conventional wins / for-and-against system later, so the
  scoring rule must be configurable per competition without code changes.

### 3.2 Users, devices and where each surface runs

| Surface     | Who            | Hardware                                   | Delivery                                  |
|-------------|----------------|--------------------------------------------|-------------------------------------------|
| Controller  | Referee        | iPad, Android tablet, or phone             | Browser / installable PWA, touch-first    |
| Scoreboard  | Spectators     | Windows 10 IoT Enterprise LTSC PC per court | Browser in kiosk mode, full screen, no input |
| Admin panel | Office staff   | Windows 11 laptop                          | Browser (no desktop app needed; heavy work runs on the server) |
| Public      | Players/public | Anything                                   | Browser, no login                         |
| Server + DB | —              | Cloud (venue network reliability is unknown) | Docker image that can also run on-premises if they ever want to |

### 3.3 Network reality

The venue Wi-Fi is not trusted. The server is the single source of truth, but every
client must keep working sensibly through short disconnects: clocks keep counting
locally from the last known server state, score taps are queued and replayed, and every
screen shows its connection status. See section 6.

## 4. Technical constraints (non-negotiable)

### 4.1 Stack

- **Language**: TypeScript everywhere, `strict: true`, no `any` without a comment.
- **Runtime**: Node.js 22 LTS. Package manager: pnpm workspaces (monorepo).
- **Server**: Fastify 5 (REST) + Socket.IO 4 (real-time; rooms, auto-reconnect, polling
  fallback) + Prisma 6 ORM + PostgreSQL 16. Zod for all input validation. pino logging.
- **Web client**: one React 19 + Vite SPA serving all four surfaces by route.
  Tailwind CSS 4 with CSS-variable design tokens for the dark theme. React Router 7.
  Zustand for live socket state, TanStack Query for REST data, react-hook-form + Zod for
  admin forms. PWA manifest and service worker for the controller.
- **Spreadsheets**: `exceljs` for import and export.
- **Dates**: store UTC in the database; venue timezone is a setting (default
  `Australia/Sydney`); use `date-fns` + `date-fns-tz`.
- **Auth**: argon2 password hashes, secure HTTP-only cookie sessions for admin, a
  venue-wide controller PIN that exchanges for a device token stored on the tablet.
- **Testing**: Vitest for unit and integration tests; Playwright for a small end-to-end
  smoke suite. ESLint + Prettier enforced.
- **Deployment**: multi-stage Dockerfile, `docker-compose.yml` (app + PostgreSQL +
  Caddy for automatic HTTPS), `.env.example`, `/healthz` endpoint, migrations applied on
  boot. HTTPS is mandatory (PWA install and the Screen Wake Lock API require it).

### 4.2 Repository layout

```
Scoreboard System/
├── apps/
│   ├── server/          # Fastify + Socket.IO + Prisma
│   └── web/             # React SPA: /controller, /scoreboard, /admin, /ladders
├── packages/
│   └── shared/          # Pure, framework-free TypeScript: types, Zod schemas,
│                        #   clock state machine, ladder engine, draw generator,
│                        #   clash validator, finals resolver. 100% unit tested.
├── docs/                # ARCHITECTURE.md, DECISIONS.md, PROGRESS.md, KIOSK-SETUP.md, DEPLOY.md
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── package.json / pnpm-workspace.yaml / tsconfig.base.json
└── README.md
```

All business rules (clock transitions, ladder maths, draw generation) live in
`packages/shared` as pure functions with no I/O so they can be tested with fake time
and reused by both server and client.

### 4.3 Coding standards

- Small modules with one responsibility. No file over ~400 lines without a reason.
- Every socket event and REST route has a Zod schema shared between client and server.
- Server-authoritative state: clients never compute a score or clock phase and send it;
  they send *intents* (`+1`, `pause`, `call time out`) and render whatever the server
  broadcasts.
- IDs are UUIDs. Every live-state record carries a monotonically increasing `version`.
- No silent failures: every caught error is either handled and logged with context, or
  re-thrown as a typed error.

### 4.4 Error handling and resilience requirements

**Server**
- One central Fastify error handler mapping typed errors (`ValidationError`,
  `NotFoundError`, `ConflictError`, `AuthError`, `RuleViolationError`) to HTTP codes
  with a JSON body `{ error: { code, message, details? } }`. Never leak stack traces.
- Every socket handler validates its payload with Zod and replies with an ack
  `{ ok: true, state } | { ok: false, error }`. A bad payload never crashes the process.
- Mutating socket messages carry a client-generated `actionId`; the server keeps a
  short-lived cache of processed ids so retries after reconnect are idempotent.
- All multi-row writes (imports, draw commits, finals generation) run in one database
  transaction: all rows or none.
- Live clock and court state is persisted on every change. On restart the server reloads
  it and fast-forwards any phases that expired while it was down, using their real
  timestamps, so a running clock survives a redeploy or crash.
- Graceful shutdown on SIGTERM: stop accepting connections, flush state, exit.
- Structured logs with request ids; an append-only `AuditLog` of every score change
  and admin action (who, when, what, from which device).

**Clients**
- Every screen shows a connection indicator (connected / reconnecting / offline).
- Clocks render from the last server state plus the locally measured elapsed time
  (`performance.now()` deltas), so they keep counting during a disconnect and snap to
  the server on resync without visible jumps of more than the true correction.
- Controller score taps are applied optimistically, queued while offline, replayed in
  order on reconnect, then reconciled against the server snapshot.
- React error boundaries on every route; a controller or scoreboard must never show a
  blank page — it shows the last good state plus a fault banner.
- Admin forms show field-level validation errors and toast notifications on failures.
- Scoreboard auto-reloads when it detects a new app build; controller prompts.

### 4.5 Security

- Admin routes and admin socket events require a valid session. Controller events
  require a device token and the server verifies the `courtId` in every payload.
  Scoreboards and public ladders are read-only and unauthenticated.
- Rate limit public and auth endpoints. Helmet-style headers. CORS locked to the app origin.
- Secrets only via environment variables; `.env.example` documents every variable.

### 4.6 Performance and scale targets

- At least 30 courts and 150 concurrent clients on one small server instance.
- Clock/score change visible on every subscribed screen within 250 ms of the server
  accepting it; displays on different devices agree to within 100 ms after time sync.
- Season draw generation for 10 competitions × 12 teams × 20 weeks completes in under
  10 seconds and never loops forever (bounded attempts, then a report).
- Scoreboard page stays smooth at 1080p and 4K on a low-end kiosk PC (no heavy
  animation; timer updates via `requestAnimationFrame`, text scaled with `clamp()`).

### 4.7 Testing requirements

- `packages/shared`: unit tests for every transition of the clock state machine (with
  fake time), ladder engine (including the bonus example: win with 40 points = 10 ladder
  points, and a wins/for-against configuration), draw generator invariants (every team
  plays exactly once per night, no court double-booked, no clash-link violation, round
  robin completeness, byes for odd team counts), finals resolution, and the Excel row
  parser.
- `apps/server`: integration tests for the socket flows using fake timers: start clock →
  Half 1 → Half time → Half 2 → between games → next fixture auto-assigned; pause/resume;
  linked Pairs-waits-for-Fours behaviour; restart recovery.
- `apps/web`: component tests for controller and scoreboard rendering of each phase.
- Playwright smoke: referee increments a score on the controller and the scoreboard
  page shows it.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` must all pass at the end of every phase.

## 5. Domain model (Prisma)

Design these entities; add fields as needed but keep these names.

- **Settings** (singleton): venue name, timezone, controller PIN hash, next-game
  highlight window (default 30 min), default time-out length, sound on/off.
- **Court**: name, display order, active flag, supported format ids (default all).
- **GameFormat**: name, half seconds, half-time seconds, between-games seconds,
  time-out seconds, colour accent.
- **Season**: name, start date, regular-season weeks, skipped dates, finals template
  (JSON), status (DRAFT / PUBLISHED / FINALS / COMPLETE).
- **Competition**: season id, name, night of week, format id, ladder rule (JSON, see §9),
  display order, published flag.
- **Team**: competition id, name, short name, optional colour.
- **Player** and **TeamPlayer**: optional rosters. A player linked to teams in two
  competitions automatically creates a clash constraint between those teams.
- **TeamClashLink**: explicit "these two teams must not play in the same slot" link, for
  venues that do not enter rosters.
- **Session** (one night of play): date, night of week, first-slot start time,
  slot length minutes, "Pairs wait for Fours" link flag, status
  (PLANNED / LIVE / COMPLETE).
- **Fixture**: season, competition (nullable for ad-hoc games), session, round number,
  slot index, court, home team, away team (or ad-hoc names), stage
  (REGULAR / SF1 / SF2 / PF / GF), placeholder refs for finals (e.g. `winnerOf: SF1`),
  status (SCHEDULED / LIVE / COMPLETED / FORFEIT / BYE / CANCELLED), home score,
  away score, completed at, result notes.
- **Clock**: persisted live clock state (see §6).
- **CourtLiveState**: court id, current fixture id, next fixture id, home/away score,
  time-out state, active clock id, version, last controller seen, last scoreboard seen.
- **LadderAdjustment**: competition, team, points delta, reason, created by.
- **User**: admin accounts. **DeviceToken**: controller devices.
- **AuditLog**: actor, device, action, payload, timestamp.

## 6. Real-time clock architecture (the heart of the system)

### 6.1 One clock per format per night

Games on a night run on **shared clocks**: by default one clock per game format that has
fixtures in tonight's session (e.g. a Fours clock and a Pairs clock). Every court is
attached to the clock matching its current fixture's format. Admin may also create an
ad-hoc clock for a single court.

### 6.2 Clock state shape (persisted, broadcast verbatim)

```ts
type ClockPhase  = 'PRE_GAME' | 'HALF_1' | 'HALF_TIME' | 'HALF_2' | 'BETWEEN_GAMES' | 'WAITING_FOR_LINKED' | 'FINISHED';
type ClockStatus = 'IDLE' | 'RUNNING' | 'PAUSED';
type ClockMode   = 'SINGLE' | 'AUTO';

interface ClockState {
  id: string; sessionId: string; formatId: string;
  mode: ClockMode; status: ClockStatus; phase: ClockPhase;
  phaseDurationMs: number;
  phaseStartedAtMs: number | null;     // server epoch ms
  remainingAtPauseMs: number | null;
  linkedClockId: string | null;        // "wait for this clock" (Pairs → Fours)
  slotIndex: number;                   // which slot of the session is on this clock
  version: number;
}
// remaining(now) = status === 'RUNNING'
//   ? max(0, phaseDurationMs - (now - phaseStartedAtMs))
//   : (remainingAtPauseMs ?? phaseDurationMs)
```

Clients never receive a "seconds remaining" tick stream. They receive the state above
and compute the display locally from synchronised server time.

### 6.3 Transitions (implement as a pure reducer in `packages/shared`)

| From | Event | To |
|------|-------|----|
| IDLE / PRE_GAME | admin `start` | RUNNING / HALF_1 (format half length) |
| HALF_1 expires | — | HALF_TIME |
| HALF_TIME expires | — | HALF_2 |
| HALF_2 expires, mode SINGLE | — | FINISHED (status IDLE). Court fixtures on this clock are finalised. |
| HALF_2 expires, mode AUTO, linked clock still in HALF_1 / HALF_TIME / HALF_2 | — | WAITING_FOR_LINKED (no duration; display shows linked clock's remaining time) |
| HALF_2 expires, mode AUTO, otherwise | — | BETWEEN_GAMES if more fixtures exist for this clock in the session, else FINISHED |
| Linked clock enters BETWEEN_GAMES | — | Waiting clock enters BETWEEN_GAMES with the **same** `phaseStartedAtMs` so both start Half 1 together |
| BETWEEN_GAMES expires | — | `slotIndex + 1`; assign each court its fixture for that slot (matching format); HALF_1 |
| RUNNING | admin `pause` | PAUSED (store remaining) |
| PAUSED | admin `resume` | RUNNING (`phaseStartedAtMs = now - (duration - remaining)`) |
| any | admin `adjust(±seconds)`, `skipPhase`, `reset`, `setMode`, `setLink` | as named; `reset` never touches scores |

When a court's clock leaves HALF_2 (expiry or admin "end game"), that court's LIVE
fixture becomes COMPLETED with the current scores, the ladder cache for that competition
is invalidated, and the controller shows FINAL with buttons disabled until the next
fixture is assigned. Admin can reopen or amend any result.

### 6.4 Time outs (per court, independent of the clock)

`{ active, startedAtMs, durationMs, calledBy: 'HOME' | 'AWAY' | null }`. Allowed only
while the court's clock is RUNNING in HALF_1 or HALF_2. While active, controller and
scoreboard replace the clock block with a red **TIME OUT** label and the time-out
countdown; the game clock keeps running underneath and reappears when the time out ends.
The time-out button reads "End time out" while one is active. Expiry is scheduled and
broadcast by the server.

### 6.5 Server scheduler

A `ClockScheduler` service arms one `setTimeout` per RUNNING clock for its phase end,
re-armed on every state change, plus a 1-second safety sweep that expires anything
overdue. On boot it reloads all clocks and fast-forwards missed transitions using real
timestamps.

### 6.6 Time synchronisation

On connect and every 60 s the client sends `time:ping { clientSentMs }`; the server
replies `{ serverNowMs }`; the client keeps the median offset of the last five samples
and uses `Date.now() + offset` as server time. Show a warning badge if round-trip time
exceeds 2 s.

### 6.7 Rooms and events (Socket.IO)

Rooms: `court:{id}`, `clock:{id}`, `session:{id}`, `admin`. Joining any room sends a full
snapshot. Server → client: `court:state`, `clock:state`, `session:state`,
`time:pong`, `app:version`. Client → server (all with `actionId`, all acked):

- Controller: `controller:join { courtId }`, `controller:score { courtId, team, delta }`
  (score never below 0), `controller:timeout { courtId, team? }`,
  `controller:endTimeout { courtId }`.
- Admin: `clock:start | pause | resume | adjust | skipPhase | reset | setMode | setLink`,
  `court:assignFixture`, `court:setScore`, `court:endGame`, `court:reopenGame`,
  `session:goLive`, `session:advanceSlot`.

## 7. Functional specification by surface

### 7.1 Controller (`/controller` → court picker → `/controller/:courtId`)

- First load shows a grid of court cards; the chosen court is remembered on the device.
  A gear icon (top-right, requires the controller PIN if set) lets a referee switch
  courts, so any tablet can serve any court.
- Layout (landscape and portrait variants), matching this exactly:

```
┌──────────────────────────────────────────────────────────┐
│                    COURT NAME (accent colour)            │
│   HOME TEAM NAME        HALF 1 (phase label)   AWAY TEAM NAME
│        21                   12:34 (clock)          18    │
│   [  +  ] [  −  ]         [ TIME OUT ]        [  +  ] [  −  ]
│  connection • competition • next: Team C vs Team D 8:15pm │
└──────────────────────────────────────────────────────────┘
```

  Team name sits above its score; two buttons under each score (increase, decrease);
  the time-out button centred between the two button pairs; the phase label sits above
  the clock. Buttons are at least 72 px tall, debounced against double taps.
- Phase label text and colour: Half 1, Half time, Half 2, Next game in (between games),
  Waiting for Fours (or whichever linked format), Time out, Final, Paused.
- During a time out the centre block shows the time-out countdown instead of the game
  clock (see §6.4).
- **Idle screen** (no live fixture on this court: before the night, during
  BETWEEN_GAMES / WAITING, or after the last game):
  - If the next fixture on this court starts within the configured window (default
    30 min): show the two team names and the court name in large text, plus the
    scheduled start time and, when applicable, the between-games countdown.
  - Otherwise: show the court name in large text and the next fixture's time and teams
    in small text (or "No more games tonight").
- Keeps the screen awake (Wake Lock API), installable as a PWA, works offline as per §4.4.

### 7.2 Scoreboard (`/scoreboard/:courtId`, kiosk)

Identical information to the controller with **no buttons**, scaled for a TV: court name,
team names, scores, phase label, clock or time-out countdown, idle screen rules,
connection badge (small, corner). `/scoreboard` without an id shows a one-time court
picker that stores the choice. Hides the cursor, requests full screen and wake lock,
auto-reloads on new builds. Optional horn sound at the end of each phase
(setting, default off). Write `docs/KIOSK-SETUP.md` for Edge kiosk mode on Windows 10
IoT LTSC.

### 7.3 Admin — Live control (`/admin/live`)

- Tonight's session header: date, status, Go live / End night, "Pairs wait for Fours"
  checkbox (links the shorter clock to the longer one; must be set before starting auto).
- One card per clock: format, mode toggle (Single game / Auto), phase, big clock, slot
  cursor ("Slot 3 of 6"), buttons Start, Pause, Resume, +30 s, −30 s, Skip phase, Reset.
  In SINGLE mode the clock runs Half 1 → Half time → Half 2 once and stops; in AUTO mode
  it waits the between-games gap and starts the next slot automatically until the
  session's fixtures are exhausted.
- Court grid: court name, current fixture, editable scores, time-out indicator,
  controller and scoreboard last-seen indicators, Assign/override fixture, End game,
  Reopen, and a "Quick game" action to run an unscheduled game with typed team names
  (not counted on any ladder).
- Warnings surface here: a court still busy when its next fixture is due, a clock with no
  fixtures, a controller offline.

### 7.4 Admin — Setup (`/admin/settings`, `/admin/courts`, `/admin/formats`, `/admin/competitions`, `/admin/seasons`)

- CRUD for courts, formats, seasons, competitions, teams, players, clash links.
- Competition editor includes night of week, format, ladder rule editor (presets
  "Venue points system", "Wins / for-and-against", "Custom") and publish toggle.
- Settings: venue name, timezone, controller PIN, admin password change, next-game
  window, sounds.

### 7.5 Admin — Fixtures and sessions (`/admin/sessions`, `/admin/sessions/:id`)

- Session list by date; create a session manually or from the generated draw.
- Session editor is a grid of slots × courts. Three ways to fill it:
  1. **Manual entry**: pick competition, home, away per cell; add or remove slots.
  2. **Excel import**: download a template (`Date, Start Time or Slot, Court,
     Competition, Home Team, Away Team, Round`), upload `.xlsx` or `.csv`, see a
     row-by-row validation preview (unknown team, unknown court, duplicate booking,
     clash violation), optionally auto-create missing teams, then commit in one
     transaction.
  3. **From the draw**: pull the generated fixtures for that date.
- Live validation badges on every cell (double booking, clash-link violation, court not
  supporting the format). Publish button makes the night visible to controllers,
  scoreboards and public pages.
- Export a session or a whole season to Excel and to a printable page.

### 7.6 Admin — Results and ladders (`/admin/results`, `/admin/ladders`)

- Results table filterable by competition/round; edit scores, mark forfeits, add notes;
  every edit is audited.
- Ladder view per competition with manual adjustments (± points with reason), CSV
  export, downloadable PNG snapshot of the ladder, and a copy-link button for the public
  page.
- "Lock ladder and generate finals" action at the end of the regular season (see §8.4).

### 7.7 Public pages (no login)

- `/ladders`: every published competition's ladder, grouped by night, auto-refreshing.
- `/ladders/:competitionId`: full ladder, last round's results, next round's fixtures.
- `/draw/:competitionId`: the season draw.
- `/tonight`: live scores for all courts (read-only overview).

Facebook: a pinned post cannot embed live content. Support the venue by (a) giving
them the stable public `/ladders` URL to pin, and (b) the ladder PNG snapshot they can
post manually. Provide an optional, feature-flagged "post snapshot to Facebook Page"
integration via the Graph API as a later phase; do not block on it.

## 8. Draw generator specification (`packages/shared/draw`)

### 8.1 Inputs

Season (weeks `W`, start date, skipped dates), competitions with teams and night of week,
per-night court list and first-slot time, formats, clash constraints (from rosters and
explicit links), an optional random seed for reproducibility.

### 8.2 Algorithm

1. **Pairings per competition**: circle-method round robin. Odd team count → a BYE
   fixture each round. If `W > N-1`, repeat the cycle with home/away flipped; if
   `W < N-1`, truncate and warn that not every pair meets.
2. **Slot planning per night**: slot length = longest format's
   `half*2 + halfTime + betweenGames` among formats playing that night (that is what makes
   "Pairs wait for Fours" work). Slots needed = `ceil(fixtures that night / courts)`.
3. **Assignment per (week, night)**: place every fixture into a (slot, court) cell.
   - Hard constraints: one fixture per cell; a team appears at most once per night; teams
     connected by a clash constraint are never in the same slot; a court only hosts
     formats it supports; if the session is *not* linked, a court hosts one format for
     the whole night.
   - Soft constraints (scored): each team's early/late slot counts stay balanced across
     the season; competitions are spread rather than stacked; consecutive-week slot
     variety.
   - Method: greedy placement ordered by most-constrained fixture first, then bounded
     local search (swap moves) to improve the soft score, with randomised restarts. Hard
     limit on iterations. If no feasible assignment exists, return a structured report
     naming the conflicting fixtures and suggesting fixes (add a slot, add a court, remove
     a clash link) instead of a partial result.
4. **Output**: fixtures with week, date, session, slot index, court, teams — held as a
   DRAFT the admin can review in the session grid, edit by hand (with re-validation),
   regenerate per week, and then publish.

### 8.3 Invariants to test

Every team plays exactly once per night it competes; no cell is double-booked; no clash
violation; every pair of teams meets the expected number of times; byes are distributed
evenly; the generator is deterministic for a given seed.

### 8.4 Finals

Finals are generated from a template stored on the season (JSON). Default template:

```json
{
  "weeks": [
    { "name": "Semi finals", "matches": [
      { "key": "SF1", "home": { "seed": 1 }, "away": { "seed": 2 }, "slotOffset": 0 },
      { "key": "SF2", "home": { "seed": 3 }, "away": { "seed": 4 }, "slotOffset": 0 },
      { "key": "PF",  "home": { "loserOf": "SF1" }, "away": { "winnerOf": "SF2" }, "slotOffset": 1 } ] },
    { "name": "Grand final", "matches": [
      { "key": "GF", "home": { "winnerOf": "SF1" }, "away": { "winnerOf": "PF" }, "slotOffset": 0 } ] }
  ]
}
```

Seeds come from the locked ladder. Placeholder participants ("Winner SF2") display on
controllers and scoreboards until the referenced result is entered, then resolve
automatically. Finals fixtures go through the same clash-aware slot assignment.

## 9. Ladder engine specification (`packages/shared/ladder`)

A pure function: `(completedFixtures, teams, rule, adjustments) → LadderRow[]`.

```ts
type LadderRule = {
  kind: 'RESULT_POINTS';
  win: number; draw: number; loss: number;
  bye: number; forfeitWin: number; forfeitLoss: number;
  bonus: { perScorePoints: number; points: number; cap: number | null } | null;
  tiebreakers: Array<'LADDER_POINTS' | 'WINS' | 'PERCENTAGE' | 'POINTS_DIFF' | 'POINTS_FOR' | 'HEAD_TO_HEAD' | 'NAME'>;
};
```

- Venue default: `win 6, draw 4, loss 2, bye 6, forfeitWin 6, forfeitLoss 0,
  bonus { perScorePoints: 10, points: 1, cap: null }`, tiebreakers
  `LADDER_POINTS, WINS, POINTS_DIFF, POINTS_FOR, NAME`.
- "Wins / for-and-against" preset: `win 2, draw 1, loss 0, bonus null`, tiebreakers
  `LADDER_POINTS, PERCENTAGE, POINTS_DIFF, NAME`.
- Row fields: played, won, drawn, lost, byes, forfeits, points for, points against,
  difference, percentage, bonus points, adjustments, ladder points, position.
- Model `LadderRule` as a Zod discriminated union on `kind` so new rule kinds can be added
  later without touching existing data. Ladders are computed on demand and cached per
  competition; the cache is invalidated when any of its fixtures or adjustments change.

## 10. Visual theme

- Dark backgrounds (near-black `#0B0F14`, surfaces `#161B22` / `#1F2937`) with
  high-contrast text; every text/background pair meets WCAG AA (4.5:1).
- Not everything is white. Use distinct accents: court name in gold/amber, team names in
  a cool light tone, scores in bright white with tabular numerals, phase labels coloured
  by phase — Half 1 green, Half time amber, Half 2 sky blue, Between games violet,
  Waiting slate, Time out red, Final white on a subtle panel, Paused pulsing amber.
- Define all colours once as CSS variables in `packages/shared` or a theme file and use
  them across controller, scoreboard, admin, and public pages. Expose the accent
  colours in Settings so the venue can tweak them.
- Scoreboard and controller text scales with the viewport (`clamp()`), no horizontal
  scrolling on any surface, admin pages are responsive down to a 13-inch laptop.

## 11. Decisions already made (do not re-ask; record in `docs/DECISIONS.md`)

1. Web apps for all four surfaces; no desktop app. Draw generation runs on the server.
2. Cloud-hosted server delivered as a Docker image that can equally run on a venue PC.
3. Shared clock per format per night (§6.1), not one independent clock per court.
   Ad-hoc per-court clocks are still possible.
4. "Pairs wait for Fours" means: after Pairs Half 2 ends, the Pairs clock waits until the
   Fours clock's Half 2 ends, then both run the same between-games gap and start Half 1
   together. If the Fours clock has no more games, Pairs continues at its own cadence.
5. Idle screen fallback when the next game is more than the window away: court name
   large, next game time and teams small (the original request cut off here).
6. Time outs can only be called while a half is running; they never pause the clock.
7. Scores are finalised automatically when Half 2 ends; admin can reopen or amend.
8. A drawn finals game is won by the higher seed (configurable in the template later).
9. Bye = win points, no bonus, by default; configurable in the ladder rule.
10. Single admin login seeded from environment variables; controllers use a venue PIN.
11. Timezone default `Australia/Sydney`, editable in Settings.
12. Facebook publishing is an optional later phase behind a feature flag.

## 12. Open questions for the owner (proceed with the defaults above; list them in `docs/DECISIONS.md` for confirmation)

- Idle-screen content when the next game is more than 30 minutes away (default in 11.5).
- Whether time-outs are limited per team per game (default: unlimited, tracked in audit).
- Exact bye and forfeit ladder points (defaults in 11.9 and §9).
- Finals tie-break rule (default in 11.8) and whether all competitions use the same
  finals format.
- Venue timezone and whether more than one venue will ever share a server (default: one).

## 13. Step-by-step implementation plan

Work through the phases in order. Each phase ends with `pnpm typecheck && pnpm lint &&
pnpm test` passing, `docs/PROGRESS.md` updated, and (if the folder is a git repository)
one commit per phase. Do not start a phase by stubbing later ones.

**Phase 0 — Scaffold**
Monorepo with pnpm workspaces, TypeScript base config, ESLint/Prettier, Vitest,
Playwright, Dockerfile, docker-compose (app, PostgreSQL, Caddy), `.env.example`,
`pnpm dev` that starts server and web together, README skeleton, `docs/` files.
Delete the empty `index.html`.
*Done when*: `pnpm install && pnpm dev` serves a placeholder page and `/healthz` returns 200.

**Phase 1 — Shared domain package**
Types and Zod schemas for every entity and event; the clock reducer (§6.3) with fake-time
tests; time-out logic; ladder engine (§9) with both presets tested; draw generator
(§8) with invariant tests; clash validator; finals resolver; Excel row parser.
*Done when*: coverage of `packages/shared` is above 90% and all §4.7 shared tests pass.

**Phase 2 — Database and REST API**
Prisma schema (§5), migrations, seed script; Fastify app with auth (admin session,
controller PIN → device token), CRUD routes for settings, courts, formats, seasons,
competitions, teams, players, clash links, sessions, fixtures, results, adjustments;
ladder endpoint; import preview/commit endpoints; export endpoints; central error handler;
audit logging; rate limiting.
*Done when*: every route has a Zod schema and an integration test; seed creates the demo
venue described in §14.

**Phase 3 — Real-time layer**
Socket.IO gateway with rooms and snapshots (§6.7), `ClockScheduler` (§6.5), persistence
and restart fast-forward, time sync (§6.6), idempotent actions, linked-clock behaviour,
automatic fixture assignment on slot advance, automatic result finalisation.
*Done when*: the fake-timer integration tests in §4.7 pass, including kill-and-restart
mid-half recovery.

**Phase 4 — Web app shell**
Vite React app, routing for all surfaces, theme tokens (§10), socket client with
reconnect queue and time-sync hook, Zustand live store, TanStack Query API client,
connection indicator, error boundaries, PWA manifest, wake lock hook, build-version
auto-reload.
*Done when*: a blank court page connects, syncs time, and survives the server restarting.

**Phase 5 — Controller**
Court picker and switching, exact layout (§7.1), all phase states, time-out flow, idle
screen rules, optimistic scoring with offline queue, PIN gate, landscape/portrait.
*Done when*: component tests cover every phase and the Playwright smoke test passes.

**Phase 6 — Scoreboard**
Kiosk page (§7.2), scaling for 1080p and 4K, court picker, optional horn,
`docs/KIOSK-SETUP.md`.
*Done when*: it renders every state the controller can be in, with no interactive
elements.

**Phase 7 — Admin: live control and setup**
Login, layout/navigation, `/admin/live` (§7.3), settings/courts/formats/competitions/
teams/players/clash links/seasons (§7.4), ladder rule editor with presets.
*Done when*: an operator can create a night by hand and run it start to finish from the
browser with two controllers and two scoreboards attached.

**Phase 8 — Admin: sessions, manual entry, Excel import/export**
Session grid editor with validation badges, manual entry, template download, upload
preview and transactional commit, exports (§7.5), publish.
*Done when*: a sample spreadsheet with deliberate errors is rejected row by row and a
clean one imports in one transaction.

**Phase 9 — Draw generation and finals**
Season wizard (weeks, start date, skips, courts per night), generation with progress and
conflict report, draft review in the session grid, regenerate per week, publish, lock
ladder and generate finals with placeholder resolution (§8).
*Done when*: the seeded demo season (§14) generates with zero hard-constraint violations
and finals resolve automatically as results are entered.

**Phase 10 — Results, ladders, public pages**
Results editing with audit, adjustments, ladder pages, PNG snapshot, CSV export, public
`/ladders`, `/ladders/:id`, `/draw/:id`, `/tonight` (§7.6–7.7).
*Done when*: entering a result updates the public ladder within one refresh and the
bonus-point example from §3.1 is visible in the UI.

**Phase 11 — Hardening**
Load test with 30 simulated courts and 150 clients; network-drop tests (kill Wi-Fi mid
half on a controller: clock keeps counting, taps replay); server restart mid-night;
accessibility and contrast audit; Lighthouse PWA pass; security headers review;
Playwright end-to-end for a full night in AUTO mode with linked clocks.
*Done when*: all targets in §4.6 are measured and recorded in `docs/PROGRESS.md`.

**Phase 12 — Deployment and hand-over**
`docs/DEPLOY.md` (cloud Docker host with a domain and HTTPS, environment variables,
backups, upgrade procedure, on-premises fallback), `docs/KIOSK-SETUP.md`, README with a
ten-minute quick start, optional Facebook snapshot posting behind a feature flag.
*Done when*: a fresh machine can go from clone to a running demo night by following the
README alone.

## 14. Deliverables and definition of done

- Complete monorepo as laid out in §4.2, all phases finished, all checks green.
- `pnpm seed` creates a demo venue: 6 courts; Fours and Pairs formats; a Monday season
  with three pairs competitions of 6 teams; a Wednesday season with one fours and one
  pairs competition of 8 teams including two players who play in both; a generated draw;
  tonight's session prepared; admin user from `.env`.
- `README.md`, `docs/ARCHITECTURE.md` (with a sequence diagram of clock start → phase
  expiry → broadcast), `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/KIOSK-SETUP.md`,
  `docs/DEPLOY.md`, and a sample `fixtures-template.xlsx`.
- No TODOs left in code without an issue reference in `docs/PROGRESS.md`.

## 15. Working rules for this session

- Everything lives inside the `Scoreboard System` folder. Use pnpm, never npm or yarn.
- Prefer boring, well-supported libraries; pin exact versions.
- Keep business rules in `packages/shared` as pure functions; write the test before the
  implementation for the clock reducer, ladder engine and draw generator.
- After every phase: run typecheck, lint and tests; report results honestly, including
  anything skipped; update `docs/PROGRESS.md`.
- When you make a judgement call not covered here, add one line to `docs/DECISIONS.md`
  and continue. Ask the owner only if you are truly blocked.
- Never commit secrets. Never weaken a validation or a test to make it pass.
