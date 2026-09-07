import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, seedMiniVenue, type TestContext } from './helpers.js';

describe('public endpoints', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('exposes settings, theme and version without login', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/public/settings' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ timezone: 'Australia/Sydney', theme: { court: '#FBBF24' } });
    expect(res.json()).not.toHaveProperty('hasControllerPin');
  });

  it('serves ladders, draw and tonight for published competitions only', async () => {
    const { season, competition, teams, courts } = await seedMiniVenue(ctx.db);
    const [a, b, c, d] = teams as unknown as [
      { id: string },
      { id: string },
      { id: string },
      { id: string },
    ];
    const session = await ctx.db.session.create({
      data: {
        seasonId: season.id,
        date: '2026-02-02',
        nightOfWeek: 1,
        firstSlotTime: '18:30',
        slotLengthMinutes: 30,
        slotCount: 1,
        published: true,
      },
    });
    await ctx.db.fixture.createMany({
      data: [
        {
          seasonId: season.id,
          competitionId: competition.id,
          sessionId: session.id,
          roundNumber: 1,
          slotIndex: 0,
          courtId: (courts[0] as { id: string }).id,
          homeTeamId: a.id,
          awayTeamId: b.id,
          status: 'COMPLETED',
          homeScore: 40,
          awayScore: 30,
          completedAt: new Date(),
        },
        {
          seasonId: season.id,
          competitionId: competition.id,
          sessionId: session.id,
          roundNumber: 2,
          slotIndex: 0,
          courtId: (courts[1] as { id: string }).id,
          homeTeamId: c.id,
          awayTeamId: d.id,
        },
      ],
    });

    const all = await ctx.app.inject({ method: 'GET', url: '/api/public/ladders' });
    expect(all.json()).toHaveLength(1);
    expect(all.json()[0]).toMatchObject({ competitionName: 'A Grade', nightName: 'Monday' });
    expect(all.json()[0].ladder.rows[0]).toMatchObject({ teamName: 'Aces', ladderPoints: 10 });

    const one = await ctx.app.inject({
      method: 'GET',
      url: `/api/public/ladders/${competition.id}`,
    });
    expect(one.json().lastRound).toMatchObject({ round: 1 });
    expect(one.json().lastRound.fixtures[0]).toMatchObject({
      homeTeamName: 'Aces',
      homeScore: 40,
      startTime: '18:30',
    });
    expect(one.json().nextRound).toMatchObject({ round: 2 });

    const draw = await ctx.app.inject({ method: 'GET', url: `/api/public/draw/${competition.id}` });
    expect(draw.json().rounds.map((r: { round: number }) => r.round)).toEqual([1, 2]);

    const tonight = await ctx.app.inject({ method: 'GET', url: '/api/public/tonight' });
    expect(tonight.json().date).toBe('2026-02-02');
    expect(tonight.json().sessions[0].fixtures).toHaveLength(2);

    const grouped = await ctx.app.inject({ method: 'GET', url: '/api/public/competitions' });
    expect(grouped.json()[0]).toMatchObject({ nightName: 'Monday' });

    await ctx.db.competition.update({ where: { id: competition.id }, data: { published: false } });
    const hidden = await ctx.app.inject({
      method: 'GET',
      url: `/api/public/ladders/${competition.id}`,
    });
    expect(hidden.statusCode).toBe(404);
    const none = await ctx.app.inject({ method: 'GET', url: '/api/public/ladders' });
    expect(none.json()).toEqual([]);
  });

  it('lists courts and formats for kiosks', async () => {
    const courts = await ctx.app.inject({ method: 'GET', url: '/api/public/courts' });
    expect(courts.statusCode).toBe(200);
    const formats = await ctx.app.inject({ method: 'GET', url: '/api/public/formats' });
    expect(formats.statusCode).toBe(200);
  });
});
