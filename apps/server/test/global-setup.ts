import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/** Applies migrations to the test database once before the server test files run. */
export default async function globalSetup(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const rootEnv = resolve(here, '../../../.env');
  if (existsSync(rootEnv)) dotenv.config({ path: rootEnv });
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL (or DATABASE_URL) must be set to run server tests');
  if (!/_test\b|test/i.test(url)) {
    throw new Error(
      `Refusing to run tests against a database that is not named like a test DB: ${url}`,
    );
  }
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = url;
  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(here, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
