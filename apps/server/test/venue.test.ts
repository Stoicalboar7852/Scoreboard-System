import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helpers.js';

describe('settings, courts and formats', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('reads and updates settings without exposing the PIN', async () => {
    const before = await ctx.asAdmin({ method: 'GET', url: '/api/settings' });
    expect(before.json()).toMatchObject({ hasControllerPin: true, nextGameWindowMinutes: 30 });
    const res = await ctx.asAdmin({
      method: 'PUT',
      url: '/api/settings',
      payload: {
        nextGameWindowMinutes: 45,
        accentOverrides: { court: '#FF0000' },
        controllerPin: '9999',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      nextGameWindowMinutes: 45,
      accentOverrides: { court: '#FF0000' },
      hasControllerPin: true,
    });
    expect(JSON.stringify(res.json())).not.toContain('9999');
    const pin = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/controller',
      payload: { pin: '9999', deviceName: 'New tablet' },
    });
    expect(pin.statusCode).toBe(200);
    const bad = await ctx.asAdmin({
      method: 'PUT',
      url: '/api/settings',
      payload: { accentOverrides: { court: 'red' } },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('creates formats and courts, defaulting courts to all formats', async () => {
    const fours = await ctx.asAdmin({
      method: 'POST',
      url: '/api/formats',
      payload: {
        name: 'Fours',
        halfSeconds: 1200,
        halfTimeSeconds: 60,
        betweenGamesSeconds: 60,
        timeoutSeconds: 60,
        colour: '#38BDF8',
      },
    });
    expect(fours.statusCode).toBe(201);
    const court = await ctx.asAdmin({
      method: 'POST',
      url: '/api/courts',
      payload: { name: 'Court 1' },
    });
    expect(court.statusCode).toBe(201);
    expect(court.json().supportedFormatIds).toEqual([fours.json().id]);

    const pairs = await ctx.asAdmin({
      method: 'POST',
      url: '/api/formats',
      payload: {
        name: 'Pairs',
        halfSeconds: 840,
        halfTimeSeconds: 60,
        betweenGamesSeconds: 60,
        timeoutSeconds: 60,
        colour: '#A78BFA',
      },
    });
    const courts = await ctx.asAdmin({ method: 'GET', url: '/api/courts' });
    expect(courts.json()[0].supportedFormatIds.sort()).toEqual(
      [fours.json().id, pairs.json().id].sort(),
    );

    const updated = await ctx.asAdmin({
      method: 'PUT',
      url: `/api/courts/${court.json().id}`,
      payload: { supportedFormatIds: [pairs.json().id], displayOrder: 3 },
    });
    expect(updated.json()).toMatchObject({
      supportedFormatIds: [pairs.json().id],
      displayOrder: 3,
    });

    const dup = await ctx.asAdmin({
      method: 'POST',
      url: '/api/courts',
      payload: { name: 'Court 1' },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('CONFLICT');

    const missing = await ctx.asAdmin({
      method: 'PUT',
      url: '/api/courts/00000000-0000-4000-8000-000000000000',
      payload: { name: 'X' },
    });
    expect(missing.statusCode).toBe(404);

    const invalid = await ctx.asAdmin({
      method: 'POST',
      url: '/api/formats',
      payload: { name: 'Bad', halfSeconds: -1 },
    });
    expect(invalid.statusCode).toBe(400);

    const del = await ctx.asAdmin({ method: 'DELETE', url: `/api/formats/${pairs.json().id}` });
    expect(del.statusCode).toBe(200);
    const list = await ctx.asAdmin({ method: 'GET', url: '/api/formats' });
    expect(list.json()).toHaveLength(1);
  });
});
