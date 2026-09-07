import { type FastifyInstance } from 'fastify';
import { formatTimeOfDay, nightName, resolveTheme, slotStartMinutes } from '@scoreboard/shared';
import { NotFoundError } from '../errors.js';
import { param } from '../lib/validate.js';
import { mapCompetition, mapCourt, mapFormat } from '../mappers/index.js';
import { PUBLIC_RATE_LIMIT } from '../plugins/security.js';
import { type Services } from '../services/index.js';
import {
  SessionsService,
  fixtureInclude,
  mapFixtureWithNames,
} from '../services/sessions.service.js';

/** Read-only, unauthenticated endpoints for scoreboards and public pages. */
export function registerPublicRoutes(app: FastifyInstance, s: Services): void {
  const sessions = new SessionsService(s.db, s.clashes, s.ladders);
  const opts = { config: { rateLimit: PUBLIC_RATE_LIMIT } };

  app.get('/api/public/settings', opts, async () => {
    const settings = await s.settings.get();
    return {
      venueName: settings.venueName,
      timezone: settings.timezone,
      nextGameWindowMinutes: settings.nextGameWindowMinutes,
      soundEnabled: settings.soundEnabled,
      theme: resolveTheme(settings.accentOverrides),
      appVersion: s.config.APP_VERSION,
    };
  });

  app.get('/api/public/version', opts, async () => ({ version: s.config.APP_VERSION }));

  app.get('/api/public/courts', opts, async () => {
    const rows = await s.db.court.findMany({
      where: { active: true },
      include: { supportedFormats: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(mapCourt);
  });

  app.get('/api/public/formats', opts, async () => {
    const rows = await s.db.gameFormat.findMany({ orderBy: { displayOrder: 'asc' } });
    return rows.map(mapFormat);
  });

  /** Published competitions grouped by night. */
  app.get('/api/public/competitions', opts, async () => {
    const rows = await s.db.competition.findMany({
      where: { published: true, season: { status: { in: ['PUBLISHED', 'FINALS', 'COMPLETE'] } } },
      include: { season: true, format: true },
      orderBy: [{ nightOfWeek: 'asc' }, { displayOrder: 'asc' }, { name: 'asc' }],
    });
    const nights = new Map<
      number,
      Array<ReturnType<typeof mapCompetition> & { seasonName: string; formatName: string }>
    >();
    for (const r of rows) {
      const list = nights.get(r.nightOfWeek) ?? [];
      list.push({ ...mapCompetition(r), seasonName: r.season.name, formatName: r.format.name });
      nights.set(r.nightOfWeek, list);
    }
    return [...nights.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([nightOfWeek, competitions]) => ({
        nightOfWeek,
        nightName: nightName(nightOfWeek),
        competitions,
      }));
  });

  app.get('/api/public/ladders', opts, async () => {
    const rows = await s.db.competition.findMany({
      where: { published: true, season: { status: { in: ['PUBLISHED', 'FINALS', 'COMPLETE'] } } },
      orderBy: [{ nightOfWeek: 'asc' }, { displayOrder: 'asc' }, { name: 'asc' }],
    });
    const ladders = await Promise.all(rows.map((r) => s.ladders.get(r.id)));
    return rows.map((r, i) => ({
      competitionId: r.id,
      competitionName: r.name,
      nightOfWeek: r.nightOfWeek,
      nightName: nightName(r.nightOfWeek),
      ladder: ladders[i],
    }));
  });

  app.get('/api/public/ladders/:competitionId', opts, async (request) => {
    const competitionId = param(request.params, 'competitionId');
    const competition = await s.db.competition.findUnique({
      where: { id: competitionId },
      include: { season: true, format: true },
    });
    if (!competition || !competition.published)
      throw new NotFoundError('Competition', competitionId);
    const ladder = await s.ladders.get(competitionId);
    const fixtures = await s.db.fixture.findMany({
      where: { competitionId },
      include: { ...fixtureInclude, session: true },
    });
    const played = fixtures.filter((f) => f.status === 'COMPLETED' || f.status === 'FORFEIT');
    const lastRound = played.length ? Math.max(...played.map((f) => f.roundNumber ?? 0)) : null;
    const upcoming = fixtures.filter(
      (f) => f.status === 'SCHEDULED' || f.status === 'LIVE' || f.status === 'BYE',
    );
    const nextRound = upcoming.length
      ? Math.min(...upcoming.map((f) => f.roundNumber ?? Number.MAX_SAFE_INTEGER))
      : null;
    const withTime = (list: typeof fixtures) =>
      list
        .sort(
          (a, b) =>
            (a.session?.date ?? '').localeCompare(b.session?.date ?? '') ||
            (a.slotIndex ?? 0) - (b.slotIndex ?? 0),
        )
        .map((f) => ({
          ...mapFixtureWithNames(f),
          sessionDate: f.session?.date ?? null,
          startTime:
            f.session && f.slotIndex !== null
              ? formatTimeOfDay(
                  slotStartMinutes(
                    f.session.firstSlotTime,
                    f.session.slotLengthMinutes,
                    f.slotIndex,
                  ),
                )
              : null,
        }));
    return {
      competition: {
        ...mapCompetition(competition),
        seasonName: competition.season.name,
        formatName: competition.format.name,
        nightName: nightName(competition.nightOfWeek),
      },
      ladder,
      lastRound:
        lastRound === null
          ? null
          : {
              round: lastRound,
              fixtures: withTime(played.filter((f) => f.roundNumber === lastRound)),
            },
      nextRound:
        nextRound === null || nextRound === Number.MAX_SAFE_INTEGER
          ? null
          : {
              round: nextRound,
              fixtures: withTime(upcoming.filter((f) => f.roundNumber === nextRound)),
            },
    };
  });

  app.get('/api/public/draw/:competitionId', opts, async (request) => {
    const competitionId = param(request.params, 'competitionId');
    const competition = await s.db.competition.findUnique({
      where: { id: competitionId },
      include: { season: true, format: true },
    });
    if (!competition || !competition.published)
      throw new NotFoundError('Competition', competitionId);
    const fixtures = await s.db.fixture.findMany({
      where: { competitionId, session: { published: true } },
      include: { ...fixtureInclude, session: true },
      orderBy: [{ roundNumber: 'asc' }, { slotIndex: 'asc' }],
    });
    const rounds = new Map<number, ReturnType<typeof mapFixtureWithNames>[]>();
    const dates = new Map<number, string | null>();
    for (const f of fixtures) {
      const round = f.roundNumber ?? 0;
      const list = rounds.get(round) ?? [];
      list.push({
        ...mapFixtureWithNames(f),
        ...({
          startTime:
            f.session && f.slotIndex !== null
              ? formatTimeOfDay(
                  slotStartMinutes(
                    f.session.firstSlotTime,
                    f.session.slotLengthMinutes,
                    f.slotIndex,
                  ),
                )
              : null,
        } as object),
      });
      rounds.set(round, list);
      dates.set(round, f.session?.date ?? null);
    }
    return {
      competition: {
        ...mapCompetition(competition),
        seasonName: competition.season.name,
        formatName: competition.format.name,
        nightName: nightName(competition.nightOfWeek),
      },
      rounds: [...rounds.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([round, list]) => ({ round, date: dates.get(round) ?? null, fixtures: list })),
    };
  });

  /** Today's published sessions with fixtures; live scores arrive over the socket. */
  app.get('/api/public/tonight', opts, async () => {
    const settings = await s.settings.get();
    const today = sessions.todayIn(settings.timezone, s.now());
    const rows = await s.db.session.findMany({
      where: { date: today, OR: [{ published: true }, { status: 'LIVE' }] },
      include: { fixtures: { include: fixtureInclude, orderBy: [{ slotIndex: 'asc' }] } },
      orderBy: { firstSlotTime: 'asc' },
    });
    const courts = await s.db.court.findMany({
      where: { active: true },
      include: { supportedFormats: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
    return {
      date: today,
      courts: courts.map(mapCourt),
      sessions: rows.map((r) => ({
        id: r.id,
        date: r.date,
        nightOfWeek: r.nightOfWeek,
        firstSlotTime: r.firstSlotTime,
        slotLengthMinutes: r.slotLengthMinutes,
        slotCount: r.slotCount,
        status: r.status,
        fixtures: r.fixtures.map((f) => ({
          ...mapFixtureWithNames(f),
          startTime:
            f.slotIndex !== null
              ? formatTimeOfDay(slotStartMinutes(r.firstSlotTime, r.slotLengthMinutes, f.slotIndex))
              : null,
        })),
      })),
    };
  });
}
