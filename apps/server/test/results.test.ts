import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, seedMiniVenue, type TestContext } from './helpers.js';

describe('results, ladders and adjustments', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('edits a result, updates the ladder with bonus points, and audits the change', async () => {
    const { courts, competition, teams, season } = await seedMiniVenue(ctx.db);
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
      },
    });
    const f1 = await ctx.asAdmin({
      method: 'POST',
      url: '/api/fixtures',
      payload: {
        seasonId: season.id,
        competitionId: competition.id,
        sessionId: session.id,
        roundNumber: 1,
        slotIndex: 0,
        courtId: (courts[0] as { id: string }).id,
        homeTeamId: a.id,
        awayTeamId: b.id,
      },
    });
    expect(f1.statusCode).toBe(201);
    const f2 = await ctx.asAdmin({
      method: 'POST',
      url: '/api/fixtures',
      payload: {
        seasonId: season.id,
        competitionId: competition.id,
        sessionId: session.id,
        roundNumber: 1,
        slotIndex: 0,
        courtId: (courts[1] as { id: string }).id,
        homeTeamId: c.id,
        awayTeamId: d.id,
      },
    });

    const empty = await ctx.asAdmin({ method: 'GET', url: `/api/ladders/${competition.id}` });
    expect(empty.json().rows.every((r: { played: number }) => r.played === 0)).toBe(true);

    // The brief's example: a win scoring 40 points earns 6 + 4 = 10 ladder points.
    const res = await ctx.asAdmin({
      method: 'PUT',
      url: `/api/fixtures/${f1.json().id}/result`,
      payload: { homeScore: 40, awayScore: 30, status: 'COMPLETED' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'COMPLETED', homeScore: 40, awayScore: 30 });
    expect(res.json().completedAtMs).toBe(ctx.clock.nowMs);

    const ladder = await ctx.asAdmin({ method: 'GET', url: `/api/ladders/${competition.id}` });
    const rowA = ladder.json().rows.find((r: { teamId: string }) => r.teamId === a.id);
    expect(rowA).toMatchObject({
      position: 1,
      played: 1,
      won: 1,
      pointsFor: 40,
      bonusPoints: 4,
      ladderPoints: 10,
    });

    const forfeit = await ctx.asAdmin({
      method: 'PUT',
      url: `/api/fixtures/${f2.json().id}/result`,
      payload: { homeScore: 0, awayScore: 0, status: 'FORFEIT', forfeitBy: 'AWAY' },
    });
    expect(forfeit.statusCode).toBe(200);
    const ladder2 = await ctx.asAdmin({ method: 'GET', url: `/api/ladders/${competition.id}` });
    expect(ladder2.json().rows.find((r: { teamId: string }) => r.teamId === c.id)).toMatchObject({
      won: 1,
      ladderPoints: 6,
    });
    expect(ladder2.json().rows.find((r: { teamId: string }) => r.teamId === d.id)).toMatchObject({
      forfeits: 1,
      ladderPoints: 0,
    });

    const missingForfeitBy = await ctx.asAdmin({
      method: 'PUT',
      url: `/api/fixtures/${f2.json().id}/result`,
      payload: { homeScore: 0, awayScore: 0, status: 'FORFEIT' },
    });
    expect(missingForfeitBy.statusCode).toBe(400);

    const reopened = await ctx.asAdmin({
      method: 'PUT',
      url: `/api/fixtures/${f1.json().id}/result`,
      payload: { homeScore: 40, awayScore: 30, status: 'SCHEDULED' },
    });
    expect(reopened.json()).toMatchObject({ status: 'SCHEDULED', completedAtMs: null });
    const ladder3 = await ctx.asAdmin({ method: 'GET', url: `/api/ladders/${competition.id}` });
    expect(ladder3.json().rows.find((r: { teamId: string }) => r.teamId === a.id).played).toBe(0);

    const audit = await ctx.asAdmin({ method: 'GET', url: '/api/audit?action=result.edit' });
    expect(audit.json().length).toBe(3);
    expect(audit.json()[0].payload).toMatchObject({
      fixtureId: f1.json().id,
      before: { status: 'COMPLETED' },
      after: { status: 'SCHEDULED' },
    });

    const list = await ctx.asAdmin({
      method: 'GET',
      url: `/api/fixtures?competitionId=${competition.id}&round=1`,
    });
    expect(list.json()).toHaveLength(2);
    expect(list.json()[0].sessionDate).toBe('2026-02-02');
  });

  it('applies manual adjustments and exports the ladder as CSV', async () => {
    const { competition, teams } = await seedMiniVenue(ctx.db);
    const a = teams[0] as { id: string };
    const adj = await ctx.asAdmin({
      method: 'POST',
      url: '/api/adjustments',
      payload: {
        competitionId: competition.id,
        teamId: a.id,
        pointsDelta: -2,
        reason: 'Late team sheet',
      },
    });
    expect(adj.statusCode).toBe(201);
    expect(adj.json()).toMatchObject({
      teamName: 'Aces',
      pointsDelta: -2,
      createdBy: ctx.admin.email,
    });
    const zero = await ctx.asAdmin({
      method: 'POST',
      url: '/api/adjustments',
      payload: { competitionId: competition.id, teamId: a.id, pointsDelta: 0, reason: 'x' },
    });
    expect(zero.statusCode).toBe(400);

    const ladder = await ctx.asAdmin({ method: 'GET', url: `/api/ladders/${competition.id}` });
    expect(ladder.json().rows.find((r: { teamId: string }) => r.teamId === a.id)).toMatchObject({
      adjustments: -2,
      ladderPoints: -2,
      position: 4,
    });

    const csv = await ctx.asAdmin({
      method: 'GET',
      url: `/api/export/ladders/${competition.id}.csv`,
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body.split('\n')[0]).toBe(
      'Pos,Team,P,W,D,L,Byes,Forfeits,For,Against,Diff,%,Bonus,Adj,Points',
    );
    expect(csv.body).toContain('4,Aces,0,0,0,0,0,0,0,0,0,0,0,-2,-2');

    const del = await ctx.asAdmin({ method: 'DELETE', url: `/api/adjustments/${adj.json().id}` });
    expect(del.statusCode).toBe(200);
    const after = await ctx.asAdmin({ method: 'GET', url: `/api/ladders/${competition.id}` });
    expect(after.json().rows.find((r: { teamId: string }) => r.teamId === a.id).ladderPoints).toBe(
      0,
    );
  });

  it('refuses to delete or re-team a live fixture', async () => {
    const { competition, teams, courts } = await seedMiniVenue(ctx.db);
    const [a, b] = teams as unknown as [{ id: string }, { id: string }];
    const live = await ctx.db.fixture.create({
      data: {
        competitionId: competition.id,
        homeTeamId: a.id,
        awayTeamId: b.id,
        courtId: (courts[0] as { id: string }).id,
        status: 'LIVE',
      },
    });
    const del = await ctx.asAdmin({ method: 'DELETE', url: `/api/fixtures/${live.id}` });
    expect(del.statusCode).toBe(422);
    expect(del.json().error.code).toBe('RULE_VIOLATION');
    const reteam = await ctx.asAdmin({
      method: 'PUT',
      url: `/api/fixtures/${live.id}`,
      payload: { homeTeamId: b.id },
    });
    expect(reteam.statusCode).toBe(422);
    const move = await ctx.asAdmin({
      method: 'PUT',
      url: `/api/fixtures/${live.id}`,
      payload: { slotIndex: 1 },
    });
    expect(move.statusCode).toBe(200);
  });
});
