import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, seedMiniVenue, type TestContext } from './helpers.js';

describe('seasons, competitions, teams, players, clash links', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('runs the season → competition → team lifecycle', async () => {
    const { pairs } = await seedMiniVenue(ctx.db);
    const season = await ctx.asAdmin({
      method: 'POST',
      url: '/api/seasons',
      payload: {
        name: 'Winter',
        startDate: '2026-06-01',
        regularWeeks: 12,
        skippedDates: ['2026-06-08'],
      },
    });
    expect(season.statusCode).toBe(201);
    expect(season.json().finalsTemplate.weeks).toHaveLength(2);
    expect(season.json().status).toBe('DRAFT');

    const comp = await ctx.asAdmin({
      method: 'POST',
      url: '/api/competitions',
      payload: { seasonId: season.json().id, name: 'B Grade', nightOfWeek: 2, formatId: pairs.id },
    });
    expect(comp.statusCode).toBe(201);
    expect(comp.json().ladderRule.kind).toBe('RESULT_POINTS');
    expect(comp.json().ladderRule.win).toBe(6);

    const badNight = await ctx.asAdmin({
      method: 'POST',
      url: '/api/competitions',
      payload: { seasonId: season.json().id, name: 'X', nightOfWeek: 8, formatId: pairs.id },
    });
    expect(badNight.statusCode).toBe(400);

    const team = await ctx.asAdmin({
      method: 'POST',
      url: '/api/teams',
      payload: { competitionId: comp.json().id, name: 'Northern Beaches Spikers' },
    });
    expect(team.statusCode).toBe(201);
    expect(team.json().shortName).toBe('NBS');
    const dupTeam = await ctx.asAdmin({
      method: 'POST',
      url: '/api/teams',
      payload: { competitionId: comp.json().id, name: 'Northern Beaches Spikers' },
    });
    expect(dupTeam.statusCode).toBe(409);

    const rule = {
      kind: 'RESULT_POINTS',
      win: 2,
      draw: 1,
      loss: 0,
      bye: 2,
      forfeitWin: 2,
      forfeitLoss: 0,
      bonus: null,
      tiebreakers: ['LADDER_POINTS', 'PERCENTAGE', 'NAME'],
    };
    const updated = await ctx.asAdmin({
      method: 'PUT',
      url: `/api/competitions/${comp.json().id}`,
      payload: { ladderRule: rule, published: true },
    });
    expect(updated.json()).toMatchObject({ published: true, ladderRule: rule });

    const detail = await ctx.asAdmin({ method: 'GET', url: `/api/seasons/${season.json().id}` });
    expect(detail.json().competitions).toHaveLength(1);

    const del = await ctx.asAdmin({ method: 'DELETE', url: `/api/seasons/${season.json().id}` });
    expect(del.statusCode).toBe(200);
    const gone = await ctx.asAdmin({ method: 'GET', url: `/api/competitions/${comp.json().id}` });
    expect(gone.statusCode).toBe(404);
  });

  it('derives clash constraints from players in two teams and from explicit links', async () => {
    const { teams } = await seedMiniVenue(ctx.db);
    const [a, b, c, d] = teams as unknown as [
      { id: string },
      { id: string },
      { id: string },
      { id: string },
    ];
    const player = await ctx.asAdmin({
      method: 'POST',
      url: '/api/players',
      payload: { name: 'Sam', teamIds: [a.id, b.id] },
    });
    expect(player.statusCode).toBe(201);
    expect(player.json().teamIds).toEqual(expect.arrayContaining([a.id, b.id]));

    const link = await ctx.asAdmin({
      method: 'POST',
      url: '/api/clash-links',
      payload: { teamAId: d.id, teamBId: c.id, reason: 'Shared coach' },
    });
    expect(link.statusCode).toBe(201);
    const self = await ctx.asAdmin({
      method: 'POST',
      url: '/api/clash-links',
      payload: { teamAId: c.id, teamBId: c.id },
    });
    expect(self.statusCode).toBe(400);

    const effective = await ctx.asAdmin({ method: 'GET', url: '/api/clash-links/effective' });
    expect(effective.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'LINK' }),
        expect.objectContaining({ source: 'PLAYER', playerName: 'Sam' }),
      ]),
    );

    const moved = await ctx.asAdmin({
      method: 'PUT',
      url: `/api/players/${player.json().id}`,
      payload: { teamIds: [a.id] },
    });
    expect(moved.json().teamIds).toEqual([a.id]);
    const after = await ctx.asAdmin({ method: 'GET', url: '/api/clash-links/effective' });
    expect(after.json()).toHaveLength(1);

    const byTeam = await ctx.asAdmin({ method: 'GET', url: `/api/players?teamId=${a.id}` });
    expect(byTeam.json()).toHaveLength(1);
    const teamsWithPlayers = await ctx.asAdmin({
      method: 'GET',
      url: `/api/teams?competitionId=${(teams[0] as { competitionId: string }).competitionId}`,
    });
    expect(teamsWithPlayers.json().find((t: { id: string }) => t.id === a.id).players).toEqual([
      { id: player.json().id, name: 'Sam' },
    ]);

    const unlink = await ctx.asAdmin({
      method: 'DELETE',
      url: `/api/clash-links/${link.json().id}`,
    });
    expect(unlink.statusCode).toBe(200);
    const removed = await ctx.asAdmin({
      method: 'DELETE',
      url: `/api/players/${player.json().id}`,
    });
    expect(removed.statusCode).toBe(200);
  });
});
