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
