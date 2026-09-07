import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, seedMiniVenue, type TestContext } from './helpers.js';

describe('sessions and the grid editor', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('creates a session, saves a grid with validation, publishes and deletes', async () => {
    const { courts, competition, teams } = await seedMiniVenue(ctx.db);
    const [c1, c2] = courts as unknown as [{ id: string }, { id: string }];
    const [a, b, c, d] = teams as unknown as [
      { id: string },
      { id: string },
      { id: string },
      { id: string },
    ];

    const created = await ctx.asAdmin({
      method: 'POST',
      url: '/api/sessions',
      payload: { date: '2026-02-02', firstSlotTime: '18:30', slotLengthMinutes: 30, slotCount: 2 },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ nightOfWeek: 1, status: 'PLANNED', published: false });
    const sessionId = created.json().id as string;

    // Double booking: two fixtures in the same cell.
    const clash = await ctx.asAdmin({
      method: 'PUT',
      url: `/api/sessions/${sessionId}/grid`,
      payload: {
        slotCount: 2,
        fixtures: [
          {
            competitionId: competition.id,
            homeTeamId: a.id,
            awayTeamId: b.id,
            slotIndex: 0,
            courtId: c1.id,
          },
          {
            competitionId: competition.id,
            homeTeamId: c.id,
            awayTeamId: d.id,
            slotIndex: 0,
            courtId: c1.id,
          },
        ],
      },
    });
    expect(clash.statusCode).toBe(200);
    expect(clash.json().issues.map((i: { code: string }) => i.code)).toEqual([
      'CELL_DOUBLE_BOOKED',
    ]);
    expect(clash.json().fixtures).toHaveLength(2);

    // Fix by moving the second fixture to court 2, keeping ids.
    const ids = clash.json().fixtures.map((f: { id: string }) => f.id) as [string, string];
    const fixed = await ctx.asAdmin({
      method: 'PUT',
      url: `/api/sessions/${sessionId}/grid`,
      payload: {
        slotCount: 2,
        fixtures: [
          {
            id: ids[0],
            competitionId: competition.id,
            homeTeamId: a.id,
            awayTeamId: b.id,
            slotIndex: 0,
            courtId: c1.id,
          },
          {
            id: ids[1],
            competitionId: competition.id,
            homeTeamId: c.id,
            awayTeamId: d.id,
            slotIndex: 0,
            courtId: c2.id,
          },
        ],
      },
    });
    expect(fixed.json().issues).toEqual([]);
    expect(fixed.json().fixtures[0]).toMatchObject({
      homeTeamName: 'Aces',
      awayTeamName: 'Blockers',
      courtName: 'Court 1',
      competitionName: 'A Grade',
      formatName: 'Pairs',
    });

    const validate = await ctx.asAdmin({
      method: 'GET',
      url: `/api/sessions/${sessionId}/validate`,
    });
    expect(validate.json().issues).toEqual([]);

    const list = await ctx.asAdmin({
      method: 'GET',
      url: '/api/sessions?from=2026-02-01&to=2026-02-03',
    });
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0].fixtureCount).toBe(2);

    const published = await ctx.asAdmin({
      method: 'POST',
      url: `/api/sessions/${sessionId}/publish`,
      payload: { published: true },
    });
    expect(published.json().published).toBe(true);

    const today = await ctx.asAdmin({ method: 'GET', url: '/api/sessions/today' });
    expect(today.json().date).toBe('2026-02-02');
    expect(today.json().sessions).toHaveLength(1);

    const removedOne = await ctx.asAdmin({
      method: 'PUT',
      url: `/api/sessions/${sessionId}/grid`,
      payload: {
        slotCount: 1,
        fixtures: [
          {
            id: ids[0],
            competitionId: competition.id,
            homeTeamId: a.id,
            awayTeamId: b.id,
            slotIndex: 0,
            courtId: c1.id,
          },
        ],
        deleteFixtureIds: [ids[1]],
      },
    });
    expect(removedOne.json().fixtures).toHaveLength(1);
    expect(removedOne.json().session.slotCount).toBe(1);

    const del = await ctx.asAdmin({ method: 'DELETE', url: `/api/sessions/${sessionId}` });
    expect(del.statusCode).toBe(200);
    expect(await ctx.db.fixture.count()).toBe(0);
  });

  it('flags clash-link violations and unsupported courts in the grid', async () => {
    const { courts, competition, teams, fours } = await seedMiniVenue(ctx.db);
    const [c1, c2] = courts as unknown as [{ id: string }, { id: string }];
    const [a, b, c, d] = teams as unknown as [
      { id: string },
      { id: string },
      { id: string },
      { id: string },
    ];
    await ctx.db.teamClashLink.create({ data: { teamAId: a.id, teamBId: c.id } });
    await ctx.db.courtFormat.deleteMany({ where: { courtId: c2.id, formatId: { not: fours.id } } });
    const session = await ctx.db.session.create({
      data: {
        date: '2026-02-09',
        nightOfWeek: 1,
        firstSlotTime: '18:30',
        slotLengthMinutes: 30,
        slotCount: 1,
      },
    });
    const res = await ctx.asAdmin({
      method: 'PUT',
      url: `/api/sessions/${session.id}/grid`,
      payload: {
        slotCount: 1,
        fixtures: [
          {
            competitionId: competition.id,
            homeTeamId: a.id,
            awayTeamId: b.id,
            slotIndex: 0,
            courtId: c1.id,
          },
          {
            competitionId: competition.id,
            homeTeamId: c.id,
            awayTeamId: d.id,
            slotIndex: 0,
            courtId: c2.id,
          },
        ],
      },
    });
    expect(
      res
        .json()
        .issues.map((i: { code: string }) => i.code)
        .sort(),
    ).toEqual(['CLASH_LINK', 'COURT_FORMAT_UNSUPPORTED']);
  });
});
