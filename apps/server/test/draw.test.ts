import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, resetVenue, type TestContext } from './helpers.js';

/** The §14 demo venue: Monday 3×6 pairs, Wednesday fours + pairs of 8 with two shared players. */
async function seedDemoVenue(db: TestContext['db']) {
  await resetVenue(db);
  const fours = await db.gameFormat.create({
    data: {
      name: 'Fours',
      halfSeconds: 1200,
      halfTimeSeconds: 60,
      betweenGamesSeconds: 60,
      timeoutSeconds: 60,
      colour: '#38BDF8',
    },
  });
  const pairs = await db.gameFormat.create({
    data: {
      name: 'Pairs',
      halfSeconds: 840,
      halfTimeSeconds: 60,
      betweenGamesSeconds: 60,
      timeoutSeconds: 60,
      colour: '#A78BFA',
      displayOrder: 1,
    },
  });
  const courts = [];
  for (let i = 1; i <= 6; i++)
    courts.push(
      await db.court.create({
        data: {
          name: `Court ${i}`,
          displayOrder: i,
          supportedFormats: { create: [{ formatId: fours.id }, { formatId: pairs.id }] },
        },
      }),
    );
  const rule = {
    kind: 'RESULT_POINTS',
    win: 6,
    draw: 4,
    loss: 2,
    bye: 6,
    forfeitWin: 6,
    forfeitLoss: 0,
    bonus: { perScorePoints: 10, points: 1, cap: null },
    tiebreakers: ['LADDER_POINTS', 'WINS', 'POINTS_DIFF', 'POINTS_FOR', 'NAME'],
  };
  const teams = (p: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ name: `${p} ${i + 1}`, shortName: `${p}${i + 1}` }));
  const monday = await db.season.create({
    data: {
      name: 'Monday',
      startDate: '2026-02-02',
      regularWeeks: 10,
      finalsTemplate: {
        weeks: [
          {
            name: 'Semi finals',
            matches: [
              { key: 'SF1', home: { seed: 1 }, away: { seed: 2 }, slotOffset: 0 },
              { key: 'SF2', home: { seed: 3 }, away: { seed: 4 }, slotOffset: 0 },
              { key: 'PF', home: { loserOf: 'SF1' }, away: { winnerOf: 'SF2' }, slotOffset: 1 },
            ],
          },
          {
            name: 'Grand final',
            matches: [
              { key: 'GF', home: { winnerOf: 'SF1' }, away: { winnerOf: 'PF' }, slotOffset: 0 },
            ],
          },
        ],
        drawResolution: 'HIGHER_SEED',
      } as object,
    },
  });
  for (const [i, name] of ['A Grade', 'B Grade', 'C Grade'].entries()) {
    await db.competition.create({
      data: {
        seasonId: monday.id,
        name,
        nightOfWeek: 1,
        formatId: pairs.id,
        ladderRule: rule,
        displayOrder: i,
        published: true,
        teams: { create: teams(name[0] as string, 6) },
      },
    });
  }
  const wednesday = await db.season.create({
    data: {
      name: 'Wednesday',
      startDate: '2026-02-02',
      regularWeeks: 10,
      finalsTemplate: { weeks: [], drawResolution: 'HIGHER_SEED' } as object,
    },
  });
  const wf = await db.competition.create({
    data: {
      seasonId: wednesday.id,
      name: 'Mixed Fours',
      nightOfWeek: 3,
      formatId: fours.id,
      ladderRule: rule,
      published: true,
      teams: { create: teams('F', 8) },
    },
    include: { teams: true },
  });
  const wp = await db.competition.create({
    data: {
      seasonId: wednesday.id,
      name: 'Mixed Pairs',
      nightOfWeek: 3,
      formatId: pairs.id,
      ladderRule: rule,
      published: true,
      teams: { create: teams('P', 8) },
    },
    include: { teams: true },
  });
  await db.player.create({
    data: {
      name: 'Sam',
      teams: { create: [{ teamId: wf.teams[0]!.id }, { teamId: wp.teams[2]!.id }] },
    },
  });
  await db.player.create({
    data: {
      name: 'Jordan',
      teams: { create: [{ teamId: wf.teams[4]!.id }, { teamId: wp.teams[6]!.id }] },
    },
  });
  return { fours, pairs, courts, monday, wednesday, wf, wp };
}

describe('draw generation', () => {
  let ctx: TestContext;
  let venue: Awaited<ReturnType<typeof seedDemoVenue>>;
  beforeAll(async () => {
    ctx = await createTestContext();
    venue = await seedDemoVenue(ctx.db);
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('previews the Wednesday season with zero conflicts and a valid layout', async () => {
    const courtIds = venue.courts.map((c) => c.id);
    const res = await ctx.asAdmin({
      method: 'POST',
      url: '/api/draw/preview',
      payload: {
        seasonId: venue.wednesday.id,
        nights: [{ nightOfWeek: 3, courtIds, firstSlotTime: '18:30', linkShorterToLonger: true }],
        seed: 7,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.seed).toBe(7);
    expect(body.sessions).toHaveLength(10);
    expect(body.sessions[0]).toMatchObject({
      date: '2026-02-04',
      weekNumber: 1,
      slotCount: 2,
      slotLengthMinutes: 42,
      fixtures: 8,
      byes: 0,
    });
    expect(body.sessions[0].competitions.sort()).toEqual(['Mixed Fours', 'Mixed Pairs']);
    expect(body.stats.elapsedMs).toBeLessThan(10_000);
  });

  it('reports conflicts instead of committing a partial draw', async () => {
    const res = await ctx.asAdmin({
      method: 'POST',
      url: '/api/draw/preview',
      payload: {
        seasonId: venue.wednesday.id,
        nights: [{ nightOfWeek: 1, courtIds: [venue.courts[0]!.id], firstSlotTime: '18:30' }],
        seed: 1,
      },
    });
    expect(res.json().ok).toBe(false);
    expect(res.json().conflicts[0].reason).toMatch(/no courts/i);
    const commit = await ctx.asAdmin({
      method: 'POST',
      url: '/api/draw/commit',
      payload: {
        seasonId: venue.wednesday.id,
        nights: [{ nightOfWeek: 1, courtIds: [venue.courts[0]!.id], firstSlotTime: '18:30' }],
        seed: 1,
      },
    });
    expect(commit.statusCode).toBe(422);
    expect(await ctx.db.session.count({ where: { seasonId: venue.wednesday.id } })).toBe(0);
  });

  it('commits the draw, validates every night, regenerates one week and publishes', async () => {
    const courtIds = venue.courts.map((c) => c.id);
    const nights = [
      { nightOfWeek: 3, courtIds, firstSlotTime: '18:30', linkShorterToLonger: true },
    ];
    const commit = await ctx.asAdmin({
      method: 'POST',
      url: '/api/draw/commit',
      payload: { seasonId: venue.wednesday.id, nights, seed: 7 },
    });
    expect(commit.statusCode).toBe(200);
    expect(commit.json()).toMatchObject({
      sessionsCreated: 10,
      fixturesCreated: 80,
      sessionsReplaced: 0,
    });

    const sessions = await ctx.asAdmin({
      method: 'GET',
      url: `/api/sessions?seasonId=${venue.wednesday.id}`,
    });
    expect(sessions.json()).toHaveLength(10);
    for (const s of sessions.json() as Array<{ id: string }>) {
      const v = await ctx.asAdmin({ method: 'GET', url: `/api/sessions/${s.id}/validate` });
      expect(v.json().issues).toEqual([]);
    }
    // Every team plays exactly once per night.
    const detail = await ctx.asAdmin({
      method: 'GET',
      url: `/api/sessions/${sessions.json()[0].id}`,
    });
    const teamsSeen = detail
      .json()
      .fixtures.flatMap((f: { homeTeamId: string; awayTeamId: string | null }) =>
        [f.homeTeamId, f.awayTeamId].filter(Boolean),
      );
    expect(new Set(teamsSeen).size).toBe(16);

    const again = await ctx.asAdmin({
      method: 'POST',
      url: '/api/draw/commit',
      payload: { seasonId: venue.wednesday.id, nights, seed: 7 },
    });
    expect(again.statusCode).toBe(422);

    const week3 = await ctx.asAdmin({
      method: 'POST',
      url: '/api/draw/commit',
      payload: {
        seasonId: venue.wednesday.id,
        nights,
        seed: 99,
        onlyWeeks: [3],
        replaceExisting: true,
      },
    });
    expect(week3.json()).toMatchObject({
      sessionsCreated: 0,
      sessionsReplaced: 1,
      fixturesCreated: 8,
    });
    expect(await ctx.db.fixture.count({ where: { seasonId: venue.wednesday.id } })).toBe(80);

    const publish = await ctx.asAdmin({
      method: 'POST',
      url: `/api/seasons/${venue.wednesday.id}/publish`,
      payload: { published: true },
    });
    expect(publish.json().status).toBe('PUBLISHED');
    expect(
      await ctx.db.session.count({ where: { seasonId: venue.wednesday.id, published: true } }),
    ).toBe(10);
  });

  it('generates the Monday season (three grades, one format) in one pass', async () => {
    const courtIds = venue.courts.map((c) => c.id);
    const res = await ctx.asAdmin({
      method: 'POST',
      url: '/api/draw/commit',
      payload: {
        seasonId: venue.monday.id,
        nights: [{ nightOfWeek: 1, courtIds, firstSlotTime: '18:30' }],
        seed: 3,
      },
    });
    expect(res.json()).toMatchObject({ sessionsCreated: 10, fixturesCreated: 90 });
  });
});

describe('finals', () => {
  let ctx: TestContext;
  let venue: Awaited<ReturnType<typeof seedDemoVenue>>;
  let comp: { id: string; teams: Array<{ id: string; name: string }> };
  beforeAll(async () => {
    ctx = await createTestContext();
    venue = await seedDemoVenue(ctx.db);
    comp = await ctx.db.competition.findFirstOrThrow({
      where: { seasonId: venue.monday.id, name: 'A Grade' },
      include: { teams: { orderBy: { name: 'asc' } } },
    });
    // A short regular season: team 1 beats everyone, team 2 beats the rest, etc. → clear ladder order.
    const session = await ctx.db.session.create({
      data: {
        seasonId: venue.monday.id,
        date: '2026-02-02',
        nightOfWeek: 1,
        firstSlotTime: '18:30',
        slotLengthMinutes: 30,
        slotCount: 3,
      },
    });
    let slot = 0;
    for (let i = 0; i < comp.teams.length; i++) {
      for (let j = i + 1; j < comp.teams.length; j++) {
        await ctx.db.fixture.create({
          data: {
            seasonId: venue.monday.id,
            competitionId: comp.id,
            sessionId: session.id,
            roundNumber: 1,
            slotIndex: slot % 3,
            courtId: venue.courts[slot % 6]!.id,
            homeTeamId: comp.teams[i]!.id,
            awayTeamId: comp.teams[j]!.id,
            status: 'COMPLETED',
            homeScore: 30 - i,
            awayScore: 10 + j,
            completedAt: new Date(),
          },
        });
        slot += 1;
      }
    }
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('locks the ladder, seeds the semis and leaves placeholders for later rounds', async () => {
    const courtIds = venue.courts.slice(0, 2).map((c) => c.id);
    const res = await ctx.asAdmin({
      method: 'POST',
      url: '/api/finals/generate',
      payload: {
        competitionId: comp.id,
        nights: [
          { weekIndex: 0, date: '2026-04-13', courtIds, firstSlotTime: '18:30' },
          { weekIndex: 1, date: '2026-04-20', courtIds, firstSlotTime: '18:30' },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ fixturesCreated: 4, sessionsCreated: 2 });
    expect(res.json().seeds.map((s: { teamName: string }) => s.teamName)).toEqual([
      'A 1',
      'A 2',
      'A 3',
      'A 4',
    ]);

    const status = await ctx.asAdmin({ method: 'GET', url: `/api/finals/${comp.id}` });
    const matches = status.json().matches as Array<{
      key: string;
      home: { label: string; teamId: string | null };
      away: { label: string };
      date: string;
      status: string;
    }>;
    expect(matches.map((m) => m.key)).toEqual(['SF1', 'SF2', 'PF', 'GF']);
    expect(matches[0]).toMatchObject({
      home: { label: 'A 1' },
      away: { label: 'A 2' },
      date: '2026-04-13',
      status: 'SCHEDULED',
    });
    expect(matches[2]).toMatchObject({
      home: { label: 'Loser SF1', teamId: null },
      away: { label: 'Winner SF2' },
    });
    expect(matches[3]).toMatchObject({ date: '2026-04-20', home: { label: 'Winner SF1' } });
    const season = await ctx.db.season.findUniqueOrThrow({ where: { id: venue.monday.id } });
    expect(season.status).toBe('FINALS');

    const twice = await ctx.asAdmin({
      method: 'POST',
      url: '/api/finals/generate',
      payload: {
        competitionId: comp.id,
        nights: [
          { weekIndex: 0, date: '2026-04-13', courtIds, firstSlotTime: '18:30' },
          { weekIndex: 1, date: '2026-04-20', courtIds, firstSlotTime: '18:30' },
        ],
      },
    });
    expect(twice.statusCode).toBe(422);
  });

  it('resolves placeholders automatically as results are entered, drawn games to the higher seed', async () => {
    const finals = await ctx.db.fixture.findMany({
      where: { competitionId: comp.id, stage: { not: 'REGULAR' } },
    });
    const byKey = (k: string) => finals.find((f) => f.finalsKey === k)!;
    // SF1 drawn → seed 1 (A 1) wins; SF2: A 4 beats A 3.
    await ctx.asAdmin({
      method: 'PUT',
      url: `/api/fixtures/${byKey('SF1').id}/result`,
      payload: { homeScore: 20, awayScore: 20, status: 'COMPLETED' },
    });
    await ctx.asAdmin({
      method: 'PUT',
      url: `/api/fixtures/${byKey('SF2').id}/result`,
      payload: { homeScore: 10, awayScore: 25, status: 'COMPLETED' },
    });
    let status = await ctx.asAdmin({ method: 'GET', url: `/api/finals/${comp.id}` });
    let matches = status.json().matches as Array<{
      key: string;
      home: { label: string };
      away: { label: string };
    }>;
    expect(matches[2]).toMatchObject({ home: { label: 'A 2' }, away: { label: 'A 4' } });
    expect(matches[3]).toMatchObject({ home: { label: 'A 1' }, away: { label: 'Winner PF' } });
    const pf = await ctx.db.fixture.findUniqueOrThrow({ where: { id: byKey('PF').id } });
    expect(pf.homeTeamId).toBe(comp.teams[1]!.id);
    expect(pf.homeName).toBe('A 2');

    await ctx.asAdmin({
      method: 'PUT',
      url: `/api/fixtures/${byKey('PF').id}/result`,
      payload: { homeScore: 5, awayScore: 9, status: 'COMPLETED' },
    });
    status = await ctx.asAdmin({ method: 'GET', url: `/api/finals/${comp.id}` });
    matches = status.json().matches;
    expect(matches[3]).toMatchObject({ home: { label: 'A 1' }, away: { label: 'A 4' } });

    // Correcting SF2 flips the preliminary and grand finals.
    await ctx.asAdmin({
      method: 'PUT',
      url: `/api/fixtures/${byKey('SF2').id}/result`,
      payload: { homeScore: 30, awayScore: 5, status: 'COMPLETED' },
    });
    status = await ctx.asAdmin({ method: 'GET', url: `/api/finals/${comp.id}` });
    matches = status.json().matches;
    expect(matches[2]).toMatchObject({ home: { label: 'A 2' }, away: { label: 'A 3' } });

    const unlock = await ctx.asAdmin({ method: 'POST', url: `/api/finals/${comp.id}/unlock` });
    expect(unlock.statusCode).toBe(422);
  });

  it('refuses finals when the ladder has too few teams', async () => {
    const small = await ctx.db.competition.create({
      data: {
        seasonId: venue.monday.id,
        name: 'Tiny',
        nightOfWeek: 1,
        formatId: venue.pairs.id,
        ladderRule: {
          kind: 'RESULT_POINTS',
          win: 2,
          draw: 1,
          loss: 0,
          bye: 2,
          forfeitWin: 2,
          forfeitLoss: 0,
          bonus: null,
          tiebreakers: ['LADDER_POINTS', 'NAME'],
        },
        teams: {
          create: [
            { name: 'X', shortName: 'X' },
            { name: 'Y', shortName: 'Y' },
          ],
        },
      },
    });
    const res = await ctx.asAdmin({
      method: 'POST',
      url: '/api/finals/generate',
      payload: {
        competitionId: small.id,
        nights: [
          {
            weekIndex: 0,
            date: '2026-05-04',
            courtIds: [venue.courts[0]!.id],
            firstSlotTime: '18:30',
          },
          {
            weekIndex: 1,
            date: '2026-05-11',
            courtIds: [venue.courts[0]!.id],
            firstSlotTime: '18:30',
          },
        ],
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toMatch(/needs 4 teams/);
  });
});
