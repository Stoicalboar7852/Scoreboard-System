#!/usr/bin/env node
/**
 * Runs a command with the monorepo's `.env` loaded.
 *
 * The application code loads the nearest `.env` walking up from the working directory
 * (`src/config.ts`), but the Prisma CLI only looks in its own working directory and next to
 * `schema.prisma`. Without this wrapper `pnpm db:migrate` fails on a fresh clone with
 * "Environment variable not found: DATABASE_URL" even though the root `.env` exists (D-056).
 *
 *   node scripts/with-env.mjs prisma migrate dev
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';

function loadNearestDotEnv() {
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('usage: node scripts/with-env.mjs <command> [args...]');
  process.exit(1);
}

loadNearestDotEnv();

const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
if (result.error) {
  console.error(`with-env: could not run "${command}": ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
