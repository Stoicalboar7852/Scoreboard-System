import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestContext, seedMiniVenue, type TestContext } from './helpers.js';

// 1×1 transparent PNG.
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('facebook integration (disabled by default)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('reports the feature as disabled and refuses to post', async () => {
    const status = await ctx.asAdmin({ method: 'GET', url: '/api/integrations' });
    expect(status.json()).toEqual({
      facebook: { enabled: false, misconfigured: false, pageId: null },
    });
    const venue = await seedMiniVenue(ctx.db);
    const res = await ctx.asAdmin({
      method: 'POST',
      url: `/api/integrations/facebook/ladder/${venue.competition.id}`,
      payload: { imageDataUrl: PNG_DATA_URL },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('RULE_VIOLATION');
  });

  it('flags a half-configured environment as misconfigured', async () => {
    const half = await createTestContext({
      configOverrides: { FACEBOOK_ENABLED: true, FACEBOOK_PAGE_ID: '123' },
    });
    try {
      const status = await half.asAdmin({ method: 'GET', url: '/api/integrations' });
      expect(status.json().facebook).toEqual({ enabled: false, misconfigured: true, pageId: null });
    } finally {
      await half.close();
    }
  });
});

describe('facebook integration (enabled)', () => {
  const TOKEN = 'EAAB-secret-page-token';
  let ctx: TestContext;
  let competitionId: string;
  const calls: Array<{ url: string; form: FormData }> = [];
  let nextResponse: () => Response = () =>
    new Response(JSON.stringify({ id: '9', post_id: '123_9' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), form: init?.body as FormData });
    return nextResponse();
  }) as unknown as typeof fetch;

  beforeAll(async () => {
    ctx = await createTestContext({
      configOverrides: {
        FACEBOOK_ENABLED: true,
        FACEBOOK_PAGE_ID: '123',
        FACEBOOK_PAGE_ACCESS_TOKEN: TOKEN,
      },
      fetchImpl,
    });
    const venue = await seedMiniVenue(ctx.db);
    competitionId = venue.competition.id;
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('is reported as enabled without exposing the token', async () => {
    const status = await ctx.asAdmin({ method: 'GET', url: '/api/integrations' });
    expect(status.json().facebook).toEqual({ enabled: true, misconfigured: false, pageId: '123' });
    expect(status.body).not.toContain(TOKEN);
  });

  it('uploads the PNG to the page with a default caption and audits the post', async () => {
    const res = await ctx.asAdmin({
      method: 'POST',
      url: `/api/integrations/facebook/ladder/${competitionId}`,
      payload: { imageDataUrl: PNG_DATA_URL },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ postId: '123_9', url: 'https://www.facebook.com/123_9' });

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe('https://graph.facebook.com/v21.0/123/photos');
    expect(call.form.get('access_token')).toBe(TOKEN);
    expect(call.form.get('published')).toBe('true');
    const caption = String(call.form.get('caption'));
    expect(caption).toContain('ladder');
    expect(caption).toContain(`/ladders/${competitionId}`);
    const source = call.form.get('source') as File;
    expect(source.type).toBe('image/png');
    expect(source.size).toBeGreaterThan(8);

    const audit = await ctx.db.auditLog.findFirst({ where: { action: 'facebook.post' } });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit!.payload)).not.toContain(TOKEN);
    expect(audit!.payload).toMatchObject({ competitionId, postId: '123_9' });
  });

  it('uses a custom caption when given', async () => {
    const res = await ctx.asAdmin({
      method: 'POST',
      url: `/api/integrations/facebook/ladder/${competitionId}`,
      payload: { imageDataUrl: PNG_DATA_URL, caption: '  Round 5 ladder  ' },
    });
    expect(res.statusCode).toBe(200);
    expect(calls.at(-1)!.form.get('caption')).toBe('Round 5 ladder');
  });

  it('rejects data that is not a PNG', async () => {
    const res = await ctx.asAdmin({
      method: 'POST',
      url: `/api/integrations/facebook/ladder/${competitionId}`,
      payload: { imageDataUrl: 'data:image/png;base64,aGVsbG8gd29ybGQ=' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION');
  });

  it('maps a Graph API rejection to a 502 UPSTREAM error without leaking the token', async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({ error: { message: 'Invalid OAuth access token', code: 190 } }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    const res = await ctx.asAdmin({
      method: 'POST',
      url: `/api/integrations/facebook/ladder/${competitionId}`,
      payload: { imageDataUrl: PNG_DATA_URL },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toMatchObject({
      code: 'UPSTREAM',
      message: 'Facebook rejected the post: Invalid OAuth access token',
      details: { status: 400, code: 190 },
    });
    expect(res.body).not.toContain(TOKEN);
  });

  it('requires an admin session', async () => {
    const res = await ctx.asController({
      method: 'POST',
      url: `/api/integrations/facebook/ladder/${competitionId}`,
      payload: { imageDataUrl: PNG_DATA_URL },
    });
    expect(res.statusCode).toBe(401);
  });
});
