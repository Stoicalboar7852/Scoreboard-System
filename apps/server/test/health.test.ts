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

describe('security review (§4.5)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('sends the expected security headers on API responses', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/public/version' });
    expect(res.headers['content-security-policy']).toMatch(/frame-ancestors 'none'/);
    expect(res.headers['content-security-policy']).toMatch(/object-src 'none'/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['referrer-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sets HttpOnly, SameSite and signed session cookies', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: ctx.admin.email, password: ctx.admin.password },
    });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/sb_session=[^;]+\.[^;]+/); // value.signature
  });

  it('never exposes password hashes, PIN hashes or device token hashes', async () => {
    const settings = await ctx.asAdmin({ method: 'GET', url: '/api/settings' });
    expect(settings.body).not.toMatch(/argon2|controllerPinHash/);
    const devices = await ctx.asAdmin({ method: 'GET', url: '/api/auth/devices' });
    expect(devices.body).not.toMatch(/tokenHash/);
    const me = await ctx.asAdmin({ method: 'GET', url: '/api/auth/me' });
    expect(me.body).not.toMatch(/passwordHash/);
  });

  it('rate-limits public endpoints per IP', async () => {
    let limited = false;
    for (let i = 0; i < 130; i++) {
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/public/version',
        remoteAddress: '10.7.7.7',
      });
      if (res.statusCode === 429) {
        limited = true;
        expect(res.json().error.code).toBe('RATE_LIMITED');
        break;
      }
    }
    expect(limited).toBe(true);
  });

  it('rejects oversized bodies and malformed JSON with typed errors', async () => {
    const big = await ctx.asAdmin({
      method: 'PUT',
      url: '/api/settings',
      payload: { venueName: 'x'.repeat(3 * 1024 * 1024) },
    });
    expect(big.statusCode).toBe(413);
    const bad = await ctx.asAdmin({
      method: 'PUT',
      url: '/api/settings',
      payload: '{not json',
      headers: { 'content-type': 'application/json' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBeDefined();
    expect(bad.body).not.toMatch(/at .*\.js:\d+/);
  });
});
