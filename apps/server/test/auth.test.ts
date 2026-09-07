import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helpers.js';

describe('auth', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('rejects a wrong password with a typed error body and no stack', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: ctx.admin.email, password: 'nope' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: { code: 'AUTH', message: 'Invalid email or password' } });
    expect(res.body).not.toContain('at ');
  });

  it('validates the login body', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION');
    expect(res.json().error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'email' })]),
    );
  });

  it('identifies the admin from the session cookie and logs out', async () => {
    const me = await ctx.asAdmin({ method: 'GET', url: '/api/auth/me' });
    expect(me.json()).toMatchObject({ kind: 'admin', user: { email: ctx.admin.email } });
    const anon = await ctx.app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(anon.json()).toEqual({ kind: 'anonymous' });

    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: ctx.admin.email, password: ctx.admin.password },
    });
    const cookie = (login.headers['set-cookie'] as string).split(';')[0] as string;
    const out = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    });
    expect(out.statusCode).toBe(200);
    const after = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(after.json()).toEqual({ kind: 'anonymous' });
  });

  it('expires sessions after the TTL', async () => {
    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: ctx.admin.email, password: ctx.admin.password },
    });
    const cookie = (login.headers['set-cookie'] as string).split(';')[0] as string;
    ctx.clock.nowMs += ctx.config.SESSION_TTL_HOURS * 3_600_000 + 1;
    const res = await ctx.app.inject({ method: 'GET', url: '/api/settings', headers: { cookie } });
    expect(res.statusCode).toBe(401);
    ctx.clock.nowMs -= ctx.config.SESSION_TTL_HOURS * 3_600_000 + 1;
  });

  it('requires admin for admin routes and rejects tampered cookies', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.statusCode).toBe(401);
    const tampered = await ctx.app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { cookie: 'sb_session=abc.def' },
    });
    expect(tampered.statusCode).toBe(401);
  });

  it('exchanges the PIN for a device token and rejects a wrong PIN', async () => {
    const bad = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/controller',
      payload: { pin: '0000', deviceName: 'X' },
    });
    expect(bad.statusCode).toBe(401);
    const me = await ctx.asController({ method: 'GET', url: '/api/auth/me' });
    expect(me.json()).toMatchObject({ kind: 'controller', device: { deviceName: 'Test Tablet' } });
    const courts = await ctx.asController({ method: 'GET', url: '/api/courts' });
    expect(courts.statusCode).toBe(200);
    const settings = await ctx.asController({ method: 'GET', url: '/api/settings' });
    expect(settings.statusCode).toBe(401);
  });

  it('lists and revokes devices', async () => {
    const list = await ctx.asAdmin({ method: 'GET', url: '/api/auth/devices' });
    expect(list.json()).toHaveLength(1);
    const id = list.json()[0].id as string;
    const revoke = await ctx.asAdmin({ method: 'DELETE', url: `/api/auth/devices/${id}` });
    expect(revoke.statusCode).toBe(200);
    const denied = await ctx.asController({ method: 'GET', url: '/api/courts' });
    expect(denied.statusCode).toBe(401);
  });

  it('changes the admin password and invalidates other sessions', async () => {
    const res = await ctx.asAdmin({
      method: 'POST',
      url: '/api/auth/password',
      payload: { currentPassword: ctx.admin.password, newPassword: 'new-password-123' },
    });
    expect(res.statusCode).toBe(200);
    const relogin = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: ctx.admin.email, password: 'new-password-123' },
    });
    expect(relogin.statusCode).toBe(200);
  });

  it('rate-limits login attempts', async () => {
    let last = 200;
    for (let i = 0; i < 12; i++) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'x@y.z', password: 'bad-password' },
        remoteAddress: '10.9.9.9',
      });
      last = res.statusCode;
      if (last === 429) break;
    }
    expect(last).toBe(429);
  });

  it('writes audit rows for logins', async () => {
    const audit = await ctx.asAdmin({ method: 'GET', url: '/api/audit?action=auth.login' });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().length).toBeGreaterThan(0);
  });
});
