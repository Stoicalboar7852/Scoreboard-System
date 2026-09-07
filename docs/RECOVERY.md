# Environment note (2026-09-08): iCloud Drive evicted project files — resolved, but read this

## What happened

The project folder (`~/Documents/Scoreboard System`) is inside iCloud Drive ("Desktop & Documents
Folders" sync). The Mac's disk was 97% full (about 14 GiB free), so macOS "Optimise Mac Storage"
evicted most project files to iCloud, leaving placeholders (`ls -lO` shows the `dataless` flag):

- all of `node_modules` (31,000 files) — rebuilt, see below
- most of `.git/objects` (411 of 513) — git commits/checkouts will stall until restored
- all web sources (`apps/web/src`, 101 files), 18 shared sources, `docs/`, server tests and
  the Prisma schema/migrations

Reading an evicted file blocks until iCloud downloads it. During this session iCloud downloads
made no progress for many minutes (most likely digesting the 31k deleted placeholders), which
showed up as `import('date-fns')`, `find | cat`, and the load test hanging with 0% CPU.

Every file was still safe in iCloud (eviction only happens after upload). About 40 minutes after
the placeholders were deleted, iCloud restored every evicted source, doc and git object on its
own; `git fsck` is clean and the full test suite passes on the rebuilt environment.

## What was changed to cope

- pnpm's virtual store now lives in `.pnpm.nosync` (`virtualStoreDir` in `pnpm-workspace.yaml`,
  ignored by git). iCloud ignores `.nosync` names, so dependencies can never be evicted again.
  `node_modules` itself only holds symlinks.
- `node_modules` was rebuilt with `pnpm install --offline` from the pnpm store in `~/Library`.
- The project-local PostgreSQL cluster moved from `.local/` to `.local.nosync/` (iCloud had already
  written conflict copies inside the data directory). `pnpm db:local` uses the new path.

## If it happens again (owner action recommended regardless)

1. Free disk space (aim for well over 10% free) or switch off System Settings → Apple ID →
   iCloud → iCloud Drive → *Optimise Mac Storage*, or move this folder outside iCloud
   (e.g. `~/Projects`). Moving is the most reliable long-term fix.
2. Force the download of what is still evicted:
   ```bash
   cd "~/Documents/Scoreboard System"
   brctl download .git apps packages docs e2e scripts
   # progress:
   ls -lRO .git apps packages docs e2e scripts | grep -c dataless   # should reach 0
   ```
   (Right-clicking the folder in Finder → *Download Now* does the same.)
3. Once the count is 0: `pnpm install --offline --frozen-lockfile`, then
   `pnpm --filter @scoreboard/server db:generate`, then `pnpm typecheck && pnpm lint && pnpm test`.
4. If `.local.nosync/postgres` was moved, fix `unix_socket_directories` in its `postgresql.conf`.
