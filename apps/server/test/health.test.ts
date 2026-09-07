import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helpers.js';

describe('health and error shapes', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('reports ok with the database reachable', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('returns the JSON error body for unknown routes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('sets security headers', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/healthz' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('blocks cross-origin requests from other origins', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/public/version',
      headers: { origin: 'https://evil.example' },
    });
    expect(res.statusCode).toBe(500);
    const ok = await ctx.app.inject({
      method: 'GET',
      url: '/api/public/version',
      headers: { origin: ctx.config.APP_ORIGIN },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['access-control-allow-origin']).toBe(ctx.config.APP_ORIGIN);
  });
});
