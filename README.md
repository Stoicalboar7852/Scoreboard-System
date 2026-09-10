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

**Contents**

1. [Ten-minute quick start](#ten-minute-quick-start)
2. [Tutorial part 1 — get the code onto a computer](#tutorial-part-1--get-the-code-onto-a-computer)
3. [Tutorial part 2 — install the prerequisites](#tutorial-part-2--install-the-prerequisites)
4. [Tutorial part 3 — first-time setup](#tutorial-part-3--first-time-setup)
5. [Tutorial part 4 — starting and stopping](#tutorial-part-4--starting-and-stopping)
6. [Tutorial part 5 — set up your venue](#tutorial-part-5--set-up-your-venue)
7. [Tutorial part 6 — build a season and a draw](#tutorial-part-6--build-a-season-and-a-draw)
8. [Tutorial part 7 — prepare a night](#tutorial-part-7--prepare-a-night)
9. [Tutorial part 8 — run the night](#tutorial-part-8--run-the-night)
10. [Tutorial part 9 — after the night](#tutorial-part-9--after-the-night)
11. [Tutorial part 10 — finals](#tutorial-part-10--finals)
12. [Tutorial part 11 — public pages and Facebook](#tutorial-part-11--public-pages-and-facebook)
13. [Saving your own changes back to GitHub](#saving-your-own-changes-back-to-github)
14. [Troubleshooting](#troubleshooting)
15. [Repository layout](#repository-layout), [Scripts](#scripts), [Documentation](#documentation)

---

## Ten-minute quick start

For someone who already has the tools installed. Everyone else should start at
[part 1](#tutorial-part-1--get-the-code-onto-a-computer).

```bash
git clone https://github.com/Stoicalboar7852/Scoreboard-System.git scoreboard && cd scoreboard
pnpm install
cp .env.example .env            # defaults are fine for local development
pnpm db:local start             # private PostgreSQL on port 54329, no Docker needed
pnpm db:migrate                 # applies migrations and generates the Prisma client
pnpm seed                       # demo venue: 6 courts, two seasons, draws, tonight's session
pnpm dev                        # server http://localhost:3000, web http://localhost:5173
```

Then open http://localhost:5173/admin, sign in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` from
`.env` (defaults `admin@example.com` / `change-me-admin-password`), and jump to
[part 8](#tutorial-part-8--run-the-night) to run the demo night.

---

# Full tutorial

This walks from a bare computer to running a real competition night, and covers every feature in
the admin panel. Follow it in order the first time.

## Tutorial part 1 — get the code onto a computer

The project lives at **https://github.com/Stoicalboar7852/Scoreboard-System**. Cloning means
downloading your own working copy that stays linked to GitHub, so you can pull updates later.

### Option A — GitHub Desktop (what you used to publish it)

1. Install [GitHub Desktop](https://desktop.github.com) and sign in to your GitHub account.
2. **File → Clone repository**.
3. Pick the **GitHub.com** tab, choose **Stoicalboar7852/Scoreboard-System** from the list.
   If it is not listed, open the **URL** tab and paste
   `https://github.com/Stoicalboar7852/Scoreboard-System`.
4. **Local path** is the folder the copy will live in. Avoid iCloud-synced folders such as
   Desktop or Documents: iCloud can evict files and make builds hang. Something like
   `/Users/you/Projects` or `/Users/you/Movies` is safer.
5. Click **Clone**. When it finishes, **Repository → Open in Terminal** puts you in the right
   folder for the commands in part 3.

### Option B — the command line

```bash
cd ~/Projects                   # any folder outside iCloud-synced Desktop/Documents
git clone https://github.com/Stoicalboar7852/Scoreboard-System.git scoreboard
cd scoreboard
```

If GitHub asks for a password, note that account passwords no longer work for Git. Either use
GitHub Desktop, which handles sign-in for you, or create a personal access token and use that as
the password.

### Getting later updates

- **GitHub Desktop:** open the repository and click **Fetch origin**, then **Pull origin** if it
  offers changes.
- **Command line:** `git pull`.

After any update, run `pnpm install` and `pnpm db:migrate` again in case dependencies or the
database schema changed.

## Tutorial part 2 — install the prerequisites

You need three things: **Node.js 22**, **pnpm 11**, and **PostgreSQL 16**.

### macOS

```bash
# Homebrew itself, if you do not have it: https://brew.sh
brew install node@22 postgresql@16
corepack enable && corepack prepare pnpm@11.24.0 --activate
```

Homebrew installs `node@22` "keg-only", which means it is not on your `PATH` by default. Add it
once so every new terminal can see it:

```bash
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Check everything is visible:

```bash
node --version      # v22.x
pnpm --version      # 11.x
pg_ctl --version    # postgres (PostgreSQL) 16.x
```

If `pg_ctl` is not found, add PostgreSQL to your `PATH` the same way, using
`/opt/homebrew/opt/postgresql@16/bin`.

### Windows

Install [Node.js 22 LTS](https://nodejs.org) and
[PostgreSQL 16](https://www.postgresql.org/download/windows/) with their installers, then run
`corepack enable` in PowerShell. The `pnpm db:local` helper script is written for macOS and
Linux; on Windows use the PostgreSQL service the installer sets up, or Docker
(`docker compose up -d db`), and point `DATABASE_URL` in `.env` at it.

### Docker instead of a local PostgreSQL

If you have Docker, you can skip installing PostgreSQL: `docker compose up -d db` starts one, and
you then change the port in `DATABASE_URL` in `.env` from `54329` to `5432`.

## Tutorial part 3 — first-time setup

Run these once, from inside the project folder.

```bash
pnpm install                    # downloads dependencies (a few minutes the first time)
cp .env.example .env            # your local configuration; never gets committed
pnpm db:local start             # starts a PostgreSQL just for this project on port 54329
pnpm db:migrate                 # creates the tables and generates the database client
pnpm seed                       # optional: fills a demo venue so you can explore
```

`pnpm db:local start` keeps its data inside the project at `.local.nosync/postgres`, separate
from any other PostgreSQL on your machine, and creates three databases: `scoreboard` (real),
`scoreboard_test` and `scoreboard_e2e` (used by the test suites).

### What is in `.env`

The file is commented, but these are the ones that matter day to day:

| Setting | What it does |
|---------|--------------|
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | The office login. Created on first start if it does not exist. |
| `CONTROLLER_PIN` | The PIN referees type once per tablet. Change it later in Settings. |
| `VENUE_NAME`, `VENUE_TIMEZONE` | Shown on every page; the timezone drives dates and slot times. |
| `DATABASE_URL` | Where PostgreSQL is. Matches `pnpm db:local` out of the box. |
| `PORT` | The server port, 3000 by default. |
| `ADMIN_PASSWORD_RESET` | Leave `false`. Set to `true` for one restart if you forget the admin password. |

Once you are past experimenting, change `ADMIN_PASSWORD` and `CONTROLLER_PIN` to real values.

### Starting from empty instead of the demo

`pnpm seed` is only for exploring. To start with nothing but your admin account, skip it — the
server creates the account and the settings row on its own the first time it starts. If you
already seeded and want to wipe the demo data, run `SEED_RESET=true pnpm seed` and then delete
what you do not need, or drop and recreate the database with `pnpm db:local reset` followed by
`pnpm db:migrate`.

## Tutorial part 4 — starting and stopping

```bash
pnpm db:local start             # the database must be running first
pnpm dev                        # starts the server and the web app together
```

- Admin panel: http://localhost:5173/admin
- Referee controller: http://localhost:5173/controller
- Kiosk scoreboard: http://localhost:5173/scoreboard
- Public pages: http://localhost:5173/tonight and http://localhost:5173/ladders

Stop the app with `Ctrl+C` in the terminal running `pnpm dev`. Stop the database with
`pnpm db:local stop`. The database keeps its data between runs; nothing is lost by stopping it.

**Using it in the venue.** `pnpm dev` is for development on one machine. To have tablets and
kiosks around the venue reach it, deploy it properly — `docs/DEPLOY.md` covers a cloud host with
HTTPS and an on-premises PC, and `docs/KIOSK-SETUP.md` covers the kiosk displays. Tablets and
kiosks need HTTPS for the offline and full-screen features to work.

## Tutorial part 5 — set up your venue

Sign in at http://localhost:5173/admin. The left-hand navigation is:
**Live, Sessions, Seasons, Competitions, Results, Ladders, Courts, Formats, Settings**.

Work through the bottom four first, because everything else depends on them.

### Settings

Venue name and timezone, and:

- **Controller PIN** — what referees type on a tablet the first time. Changing it does not sign
  out tablets that already registered.
- **Next-game highlight window (minutes)** — how far ahead a scoreboard shows the upcoming game
  while a court is idle.
- **Default time-out length (seconds)** — used when a format does not set its own.
- **Sound the horn at the end of each phase on scoreboards** — an optional end-of-phase tone.
- **Accent colours** — the colours used across scoreboards and public pages.
- **Change admin password** — changes your own password and signs out your other sessions.
- **Registered controller devices** — every tablet that has used the PIN, when it was last seen,
  and a **Revoke** button for one that is lost or no longer yours.

### Courts

One row per physical court. Each has a name, a display order (the order scoreboards and grids use)
and an active flag. **Supported formats** controls which formats may be scheduled on that court,
which is what stops the draw generator putting a Fours game on a court that cannot host one.

### Formats

A format is the shape of a game. For each one you set the **half** length, **half time**, the
**slot** length (half + half time + half + the gap before the next game), the **time out** length
and a **colour** used on displays. Typical setup: Fours as two eighteen-minute halves, Pairs as
two twelve-minute halves.

### Competitions and teams

**Seasons** come first: a name, a start date, how many **weeks**, any skipped dates such as public
holidays, and the finals template. A season is `DRAFT` until you publish it.

**Competitions** are the grades inside a season. Each has a **night**, a **format**, a
**ladder rule**, and its **teams**. Open a competition to reach:

- **Teams** — add, rename and remove them.
- **Players (optional rosters)** — only needed if you want clashes detected automatically.
- **Clash links** — two teams that must never play at the same time. Add them explicitly, and any
  two teams that share a player are linked for you.

**Ladder rules** are configurable per competition. Choose a preset, or set points for a win, a
draw, a loss, a bye and a forfeit, plus bonus points (for example one bonus point for every ten
score points, with an optional cap per game), and the order of tie-breakers.

## Tutorial part 6 — build a season and a draw

Open **Seasons**, then the draw wizard for a season. It has four steps.

1. **Nights and courts.** For each night of play, choose which courts are available, the time the
   **first slot starts**, and how many **extra slots** the generator may use if it cannot fit
   everything. Tick **shorter games wait for the longest** if you want the shorter format's clock
   to wait so that all courts change games together.
2. **Generate.** Press **Preview draw**. Nothing is saved yet. A **seed** makes the result
   reproducible: leave it blank for a random draw, or keep the number shown to regenerate exactly
   the same draw later. If the generator cannot place everything it shows a conflict report saying
   what failed and why — no court supports that format, no free cell, or the night ran out of
   slots — so you can add a court or a slot and try again.
3. **Review sessions.** The generated weeks are listed. **Save draw as draft sessions** writes
   them as sessions you can still edit. To redo one week only, set **only regenerate week** and
   tick **replace existing sessions on these dates**.
4. **Finals.** Comes later in the season — see [part 10](#tutorial-part-10--finals).

**Publish season** makes the draw visible on the public pages at `/draw/:competitionId`.

## Tutorial part 7 — prepare a night

**Sessions** lists every night. Each is `PLANNED`, `LIVE` or `COMPLETE`, with its date, first slot
time, number of slots and fixtures. Open one to reach the editor: a grid of **slots down, courts
across**, one cell per game.

- **Click a cell** to set the competition, home team, away team and an optional round number.
  You can also correct the court and slot there, or **Remove** the fixture.
- **Validation issues** appear as you edit: a team playing twice in one slot, a clash-linked pair
  scheduled together, a format on a court that does not support it. Fix them before going live.
- **Import spreadsheet** brings a night in from Excel. **Download template** gives you the right
  column layout (there is also a sample at `docs/fixtures-template.xlsx`). You get a preview with
  per-row errors and warnings before anything is written, and **create missing teams** will add
  teams the spreadsheet mentions but the competition does not have yet.
- **Save changes** writes the grid. **Publish** makes the night public. **Print** opens a
  printable sheet, and **Export .xlsx** downloads it as a spreadsheet.

## Tutorial part 8 — run the night

Open **Live**. This is the only page you need while games are on.

### Going live

The header shows tonight's planned session. Press **Go live** to start it. If there is no session
for tonight, **Create tonight's session** makes an ad-hoc one where you set the number of slots,
the slot length and the start time. When the night is over, **End night** closes it — a completed
session cannot be taken live again, so only press it when you mean it.

### Clocks

Each clock drives one or more courts and moves through these phases:

`PRE_GAME → HALF_1 → HALF_TIME → HALF_2 → BETWEEN_GAMES → (next game)`

- **Single game** stops after one game. **Auto** rolls straight into the next slot all night.
- **Start**, **Pause** and **Resume** do what they say.
- **+30 s** and **−30 s** nudge the current phase when something ran late.
- **Skip phase** jumps to the next phase immediately.
- **End game** finishes the current game now and records the scores that are on the board.
- **Next slot** moves to the following slot's fixtures.
- **Reset** returns the clock to `PRE_GAME`.

When one format is shorter than another, the shorter clock shows `WAITING_FOR_LINKED` while it
waits for the longer one, so every court changes game together.

The server owns the clock, not the browsers. Every display works out the time remaining from the
phase's start and length against the server's clock, so all screens agree, and closing a laptop or
losing wifi does not stop or desynchronise anything.

### Courts

Below the clocks, one card per court shows the current fixture and score. From here you can:

- Type into **Home score** and **Away score** to correct a score.
- **Assign** a different scheduled fixture to this court.
- **Quick game** puts an unscheduled game on the court — pick the format and the two teams.
- **End game**, or **Reopen** one that was ended too early.
- **End time out** when a referee's time out should stop early.
- **Clear** the court.

**Warnings** flags three things worth acting on: a clock that has no fixtures on any court, a
court still showing a live game after its clock has moved on, and a court with no referee
controller connected.

### Referee tablets

On each tablet open `/controller`. The first time it asks for the **PIN** and a **device name**;
after that the tablet is remembered and never asks again. The referee picks a court and sees a
large layout with:

- **+1** and **−1** for each team.
- **Time out** (which becomes **End time out** while one is running).
- The clock, the phase and the next game.
- The court switcher in the corner.

Taps apply instantly on screen. If the wifi drops, the controller keeps working: the clock keeps
counting and taps are queued in order, then replayed automatically when it reconnects, so nothing
is lost and nothing is double-counted.

### Kiosk scoreboards

On each display open `/scoreboard` and pick its court once; it remembers. The page scales to the
screen, keeps the display awake, and reloads itself when you deploy a new version. Between games
it shows the next fixture for that court. `docs/KIOSK-SETUP.md` covers running it full screen and
unattended on a Windows display.

## Tutorial part 9 — after the night

### Results

**Results** lists fixtures with filters for round, and it separates finals and unnumbered games.
Open one to change the score, set its **status** (completed, forfeit, bye, cancelled), record
**forfeited by** for a forfeit, and add **notes**. Every change is written to an audit log with
who made it. Ladders recalculate automatically.

### Ladders

**Ladders** shows one competition at a time: played, won, drawn, lost, byes, forfeits, points for
and against, difference, percentage, bonus, adjustments and total points, with finals qualifiers
highlighted, and a summary of the rule being applied.

- **Adjustments** add or subtract ladder points, and a reason is required. They are audited and
  can be removed.
- **CSV** downloads the ladder.
- **PNG snapshot** renders an image to post or print.
- **Copy public link** copies the public URL for that ladder, once the competition is published.

## Tutorial part 10 — finals

When the regular season is done, open the season's draw wizard and go to step 4, **Finals**.

**Lock ladder and generate finals** freezes the ladder, works out the seeds from it, and creates
the finals fixtures on the date, courts, first slot and starting slot you choose. The template on
the season decides the shape; by default semi finals of first versus fourth and second versus
third, with the winners meeting in a grand final.

Placeholders such as "winner of semi final 1" turn into real teams as those games finish. If you
later correct a regular-season result, the seeds re-resolve automatically. **Unlock and remove
finals** undoes the whole thing if you locked too early.

## Tutorial part 11 — public pages and Facebook

Four pages need no login and are safe to share:

| Page | Shows |
|------|-------|
| `/tonight` | Tonight's schedule, and live scores and clocks once the night is running |
| `/ladders` | Every published competition's ladder, grouped by night |
| `/ladders/:competitionId` | One full ladder, last round's results and next round's fixtures |
| `/draw/:competitionId` | The whole season draw |

A pinned Facebook post cannot show live content, so the supported approach is to pin the
`/ladders` link and post the **PNG snapshot** each week. If you want the server to post that
snapshot to a Facebook Page for you, `docs/DEPLOY.md` section 8 explains the feature flag and the
Page access token it needs; the button only appears once it is configured.

## Saving your own changes back to GitHub

If you edit anything, commit and push it so the work is not stranded on one machine.

**GitHub Desktop:** your changes appear in the **Changes** tab. Type a summary, click **Commit to
main**, then **Push origin**.

**Command line:**

```bash
git add -A
git commit -m "Describe what you changed"
git push
```

Never commit `.env` — it holds your passwords, and `.gitignore` already excludes it.

---

## Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| `pnpm db:local start` → `port 54329 is already in use` | Another copy of this project is running its own database. Stop it with `pnpm db:local stop` in that folder, or start this one elsewhere with `PGPORT_LOCAL=54330 pnpm db:local start` and change the port in `DATABASE_URL` in `.env`. |
| `pg_ctl: could not start server` | The script prints the last lines of `.local.nosync/postgres.log`; read them. If you moved the project folder, just run `pnpm db:local start` again — it re-points the database at the new location. |
| `Environment variable not found: DATABASE_URL` | `.env` is missing at the top of the project: `cp .env.example .env`. |
| `@prisma/client did not initialize yet` | The database client has not been generated for this copy: run `pnpm db:migrate` (or `pnpm db:generate`). |
| `pnpm db:local start` → `pg_ctl not found` | PostgreSQL 16 is not installed or not on `PATH`: `brew install postgresql@16`. |
| `pnpm: command not found` or `node: command not found` | The toolchain is not on your `PATH`; see [part 2](#tutorial-part-2--install-the-prerequisites). |
| You forgot the admin password | Set `ADMIN_PASSWORD` in `.env` to a new value, set `ADMIN_PASSWORD_RESET=true`, restart the server, then set it back to `false`. |
| Referees cannot register a tablet | No controller PIN is set. Set one in Settings. |
| The scoreboard shows an old version | Deploy bumped `APP_VERSION`, or reload the page; kiosks reload themselves when the version changes. |
| Countdowns disagree between devices | The server machine's clock is wrong. Every display trusts the server, so fix the clock there. |
| Builds or Git hang on macOS for no reason | The project is probably inside an iCloud-synced folder that is evicting files. See `docs/RECOVERY.md`; move it somewhere outside Desktop and Documents. |

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
| `pnpm --filter @scoreboard/server dev:live go\|end\|reset\|status` | Take tonight's session live from the terminal, for testing |
| `pnpm --filter @scoreboard/server load:test` | 150-client load test against a running server (`LOAD_URL`) |

## Documentation

- `docs/ARCHITECTURE.md` — system shape, clock reducer contract, real-time sequence diagram, client design.
- `docs/DECISIONS.md` — every judgement call made during the build (D-001 …).
- `docs/PROGRESS.md` — phase status, measurements (load, Lighthouse, accessibility), known gaps.
- `docs/DEPLOY.md` — cloud host with HTTPS, environment variables, backups, upgrades, on-premises fallback, Facebook.
- `docs/KIOSK-SETUP.md` — Windows 10 IoT + Edge kiosk mode, autoplay and wake-lock notes.
- `docs/RECOVERY.md` — what to do when the dev machine's iCloud Drive evicts project files.
