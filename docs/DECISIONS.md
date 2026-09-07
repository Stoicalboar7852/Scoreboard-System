# Decisions

Architecture and product decisions for the Scoreboard System. Numbered decisions 1–12 were
made by the owner before the build started; later entries are judgement calls made during
implementation and are open for the owner to overturn.

## Owner decisions (fixed)

1. Web apps for all four surfaces (controller, scoreboard, admin, public); no desktop app.
   Draw generation runs on the server.
2. Cloud-hosted server delivered as a Docker image that can equally run on a venue PC.
3. One shared clock per game format per night. Ad-hoc per-court clocks remain possible.
4. "Pairs wait for Fours": after Pairs Half 2 ends, the Pairs clock waits until the Fours
   clock's Half 2 ends, then both run the same between-games gap and start Half 1
   together. If the Fours clock has no more games, Pairs continues at its own cadence.
5. Idle screen when the next game is more than the highlight window away: court name in
   large text, next game time and teams in small text ("No more games tonight" if none).
6. Time outs can only be called while a half is running; they never pause the clock.
7. Scores are finalised automatically when Half 2 ends; admin can reopen or amend.
8. A drawn finals game is won by the higher seed (configurable in the template later).
9. Bye = win points, no bonus, by default; configurable in the ladder rule.
10. Single admin login seeded from environment variables; controllers use a venue PIN.
11. Timezone default `Australia/Sydney`, editable in Settings.
12. Facebook publishing is an optional later phase behind a feature flag.

## Open questions for the owner (proceeding with the defaults shown)

| # | Question | Default in use |
|---|----------|----------------|
| Q1 | Idle-screen content when the next game is more than 30 minutes away | Decision 5 |
| Q2 | Are time outs limited per team per game? | Unlimited; every call is audited |
| Q3 | Exact bye and forfeit ladder points | Bye 6 (win, no bonus), forfeit win 6, forfeit loss 0 |
| Q4 | Finals tie-break rule; do all competitions share one finals format? | Higher seed wins a draw; one template per season applies to all its competitions |
| Q5 | Venue timezone; will more than one venue ever share a server? | Australia/Sydney; one venue per server |

## Implementation decisions (made during the build)

- D-001 (Phase 0): `@scoreboard/shared` is consumed from TypeScript source by every
  consumer (Vite, tsx, Vitest) and bundled into the server with esbuild for production.
  Rationale: no build-order coupling in dev, one artefact in Docker, no path-mapping hacks.
- D-002 (Phase 0): PostgreSQL for local development can run either via `docker compose`
  or via `pnpm db:local` (a project-private cluster in `.local/postgres` on port 54329)
  because the development machine may not have Docker.
- D-003 (Phase 0): Version pins stay inside the majors the brief mandates (Fastify 5,
  Socket.IO 4, Prisma 6, React 19, React Router 7, Tailwind 4) even where newer majors
  exist on npm; TypeScript stays on 5.x, Vite on 7.x, Vitest on 4.x, ESLint on 9.x for
  ecosystem compatibility.
- D-004 (Phase 0): Zod 4 is used (current stable major); schemas live in `packages/shared`.
- D-005 (Phase 0): The folder was not a git repository; one was initialised so every phase can be
  committed as the brief requests. No remote is configured.
- D-006 (Phase 1): Ladder "played" counts games actually played (wins + draws + losses, including
  forfeits); byes are shown in their own column and are not counted as played.
- D-007 (Phase 1): Ladder percentage is `for / against × 100`, rounded to 2 decimals. When nothing has
  been conceded it is `for × 100` (finite, sorts above everything) and 0 for 0/0, so it survives JSON.
- D-008 (Phase 1): While a clock is WAITING_FOR_LINKED its status is IDLE with a zero duration; the
  scheduler arms no timer for it and displays show the linked clock's remaining time.
- D-009 (Phase 1): `adjust(±seconds)` changes the phase duration while running (so
  `phaseStartedAtMs` stays truthful), the stored remaining time while paused, and the upcoming half
  length in PRE_GAME. Remaining time never drops below zero; a negative adjustment past zero expires
  the phase on the next sweep.
- D-010 (Phase 1): Skipping a phase from PAUSED resumes into the next phase; "end game" from any half
  behaves exactly like Half 2 expiring at that moment.
- D-011 (Phase 1): The draw generator opens no extra slots by default (§8.2). Each night has an
  `extraSlots` allowance the admin can raise in the season wizard; the conflict report suggests it.
- D-012 (Phase 1): Circle-method rounds are numbered per competition; when the season is longer than
  one cycle the cycle repeats with home/away flipped, and the generator warns when it is shorter.
- D-013 (Phase 1): Finals participants are resolved from a template each time results change rather
  than being written once, so a corrected semi-final score re-resolves the grand final automatically.
- D-014 (Phase 2): Calendar dates (`Session.date`, `Season.startDate`, skipped dates) are stored as
  `YYYY-MM-DD` strings interpreted in the venue timezone; instants (completedAt, phaseStartedAt) are
  `timestamptz`. This keeps "tonight" unambiguous regardless of where the server runs.
- D-015 (Phase 2): Admin sessions are rows in `AdminSession` referenced by a signed HTTP-only cookie, so
  logout and password changes can revoke them server-side. Controller device tokens are stored hashed.
- D-016 (Phase 2): Import previews live in server memory for 30 minutes (single-instance deployment);
  commit re-reads exactly the previewed rows so what the admin saw is what gets written.
- D-017 (Phase 2): Finals seeds are frozen in a `FinalsSeed` table when finals are generated; placeholder
  participants are re-resolved from that table plus finals results on every result edit.
- D-018 (Phase 2): Teams auto-created by an import get a short name derived from the first 12 characters;
  the admin can rename it later.
- D-019 (Phase 2): The seed prepares "tonight" on any weekday by copying the Wednesday week-1 fixtures into
  a session dated today so the demo can run immediately; those results do count on the Wednesday ladders.
- D-020 (Phase 3): One in-memory `LiveService` per server process holds live state and serialises
  commands through a queue. This assumes a single server instance (decision 2, one venue); horizontal
  scaling would need a shared store, which is out of scope.
- D-021 (Phase 3): Restart recovery is a chronological replay of missed expiries across all clocks
  rather than per-clock fast-forward, so linked clocks see each other's historical state correctly.
- D-022 (Phase 3): Score taps persist to both `CourtLiveState` and the `Fixture` row immediately, so a
  crash between taps loses nothing and results never depend on the in-memory state.
- D-023 (Phase 3): Admin "assign fixture" while the court's clock is mid-game marks the fixture LIVE
  straight away; otherwise it waits for the clock's next game start.
- D-024 (Phase 3): Quick games are fixtures with no competition and an explicit `formatId`; they attach
  to that format's clock (created in SINGLE mode if the night has none) and never reach a ladder.
- D-025 (Phase 4): Theme tokens are Tailwind `@theme` variables so utilities such as `text-court` work,
  and `<ThemeProvider>` rewrites the same variables on `:root` from `/api/public/settings`; no rebuild
  is needed when the venue changes an accent colour.
- D-026 (Phase 4): The whole SPA shares one Socket.IO connection. Rooms are joined per route (court,
  session, admin) and re-joined on every reconnect; the server answers each join with a snapshot.
- D-027 (Phase 4): Countdown digits are painted from `requestAnimationFrame` directly into the DOM and
  only when the text changes, keeping kiosk CPU usage low at 4K.
- D-028 (Phase 4): Scoreboards reload 3 s after a new build is announced; controllers and admin show a
  "Reload" toast and never reload on their own (a referee may be mid-tap).
- D-029 (Phase 5): Switching courts from the gear always asks for the PIN when one is configured (the
  bootstrap says whether one exists); when no PIN is set the picker opens directly.
- D-030 (Phase 5): Score taps within 220 ms of the previous tap on the same button are ignored as
  double taps; the Playwright test spaces its taps accordingly.
- D-031 (Phase 5): A definitive server rejection of a queued tap (rule violation, auth, validation)
  drops that tap and shows the reason; transport failures keep it queued for the next reconnect.
- D-032 (Phase 5): The controller shows FINAL (with disabled buttons) only while the completed fixture
  is still the court's current fixture; once the clock moves to the gap the idle screen takes over.
- D-033 (Phase 6): The horn is synthesised with Web Audio rather than shipped as an mp3, so it works
  offline and needs no asset; it stays silent until the browser allows audio (gesture or kiosk flag).
- D-034 (Phase 6): A 2-second press-and-hold anywhere on the scoreboard reopens the court picker, so a
  kiosk can be re-pointed without a keyboard while the page itself has no visible controls.
- D-035 (Phase 7): The live page can create tonight's session on the spot (date, first slot, slot
  length, slot count, link flag) so an operator can run an unscheduled night with Quick games before
  the Phase 8 grid editor exists; fixtures for such a night come from Quick game or Assign.
- D-036 (Phase 7): Game formats are edited in minutes (halves, half time, gap) and stored in seconds;
  time outs stay in seconds.
- D-037 (Phase 7): The finals template is edited as JSON validated by the shared schema rather than a
  bespoke form, since the default template covers the venue and custom brackets are rare.
- D-038 (Phase 8): The grid editor keeps a local draft and validates it with the shared validator on
  every change; the server re-validates on save and returns its issues, so badges never depend on a
  round trip but the server stays authoritative.
- D-039 (Phase 8): Import previews check incoming rows against fixtures already in the target session,
  so a re-import cannot double-book what the admin entered by hand.
- D-040 (Phase 8): Fixtures that have been played can only be moved between cells in the grid; scores
  and teams are edited on the Results page so an accidental grid edit cannot change a result.
