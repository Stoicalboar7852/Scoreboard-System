// Runs before each server test file. Ensures a test-safe environment.
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET ??= 'test-session-secret-test-session-secret-0123456789';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
