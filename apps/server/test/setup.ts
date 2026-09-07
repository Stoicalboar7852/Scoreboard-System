import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(here, '../../../.env');
if (existsSync(rootEnv)) dotenv.config({ path: rootEnv });

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET ??= 'test-session-secret-test-session-secret-0123456789';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
process.env.APP_ORIGIN ??= 'http://localhost:5173';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'test-admin-password';
process.env.CONTROLLER_PIN = '2468';
