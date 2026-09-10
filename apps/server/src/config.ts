import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Loads the nearest `.env` walking up from the working directory, so the root
 * `.env` of the monorepo is found whether the server starts from the repo root,
 * from `apps/server`, or from the Docker image (where there is none and env vars
 * come from the container).
 */
function loadDotEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
loadDotEnv();

const booleanString = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  TRUST_PROXY: booleanString,
  WEB_DIST_DIR: z.string().default('../web/dist'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TEST_DATABASE_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(72),
  ADMIN_EMAIL: z.string().email().default('admin@example.com'),
  ADMIN_PASSWORD: z.string().min(8).default('change-me-admin-password'),
  ADMIN_PASSWORD_RESET: booleanString,
  CONTROLLER_PIN: z.string().min(4).default('1234'),
  VENUE_NAME: z.string().default('Demo Volleyball Centre'),
  VENUE_TIMEZONE: z.string().default('Australia/Sydney'),
  APP_VERSION: z.string().default('dev'),
  FACEBOOK_ENABLED: booleanString,
  FACEBOOK_PAGE_ID: z.string().optional(),
  FACEBOOK_PAGE_ACCESS_TOKEN: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema> & { isProduction: boolean; isTest: boolean };

/** Parses process.env (or a given record) into a typed config. Throws on invalid values. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return {
    ...parsed.data,
    isProduction: parsed.data.NODE_ENV === 'production',
    isTest: parsed.data.NODE_ENV === 'test',
  };
}
