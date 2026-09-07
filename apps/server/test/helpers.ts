import { PrismaClient } from '@prisma/client';
import { type FastifyInstance, type InjectOptions, type LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config.js';
import { SESSION_COOKIE } from '../src/plugins/auth.js';
import { hashPassword } from '../src/services/auth.service.js';

export interface TestContext {
  app: FastifyInstance;
  db: PrismaClient;
  config: AppConfig;
  /** Fake time that tests can move. */
  clock: { nowMs: number };
  admin: { email: string; password: string; cookie: string };
  /** Performs an admin-authenticated request. */
  asAdmin: (opts: InjectOptions) => Promise<LightMyRequestResponse>;
  /** Performs a controller (device token) request. */
  asController: (opts: InjectOptions) => Promise<LightMyRequestResponse>;
  controllerToken: string;
  close: () => Promise<void>;
}

const TABLES = [
  'AuditLog',
  'CourtLiveState',
  'Clock',
  'Fixture',
  'Session',
  'LadderAdjustment',
  'FinalsSeed',
  'TeamClashLink',
  'TeamPlayer',
  'Player',
  'Team',
  'Competition',
  'Season',
  'DeviceToken',
  'AdminSession',
  'User',
  'CourtFormat',
  'Court',
  'GameFormat',
  'Settings',
];

let shared: PrismaClient | null = null;

export function testDb(): PrismaClient {
  if (!shared)
    shared = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  return shared;
}

export async function resetDb(db: PrismaClient = testDb()): Promise<void> {
  await db.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

/** Builds an app on the test DB with a seeded admin, settings (PIN 2468) and one device token. */
export async function createTestContext(
  options: { seedAdmin?: boolean; startMs?: number } = {},
): Promise<TestContext> {
  const db = testDb();
  await resetDb(db);
  const config = loadConfig({ ...process.env, NODE_ENV: 'test' });
  const clock = { nowMs: options.startMs ?? Date.UTC(2026, 1, 2, 8, 0, 0) };
  const app = await buildApp({ config, db, now: () => clock.nowMs });
  await app.ready();

  const admin = { email: config.ADMIN_EMAIL, password: config.ADMIN_PASSWORD, cookie: '' };
  await db.user.create({
    data: {
      email: admin.email,
      name: 'Test Admin',
      passwordHash: await hashPassword(admin.password),
    },
  });
  await app.services.settings.ensure();

  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: admin.email, password: admin.password },
  });
  if (login.statusCode !== 200) throw new Error(`login failed in test setup: ${login.body}`);
  const setCookie = login.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const match = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(raw ?? '');
  admin.cookie = `${SESSION_COOKIE}=${match?.[1] ?? ''}`;

  const pin = await app.inject({
    method: 'POST',
    url: '/api/auth/controller',
    payload: { pin: config.CONTROLLER_PIN, deviceName: 'Test Tablet' },
  });
  if (pin.statusCode !== 200) throw new Error(`PIN exchange failed in test setup: ${pin.body}`);
  const controllerToken = (pin.json() as { token: string }).token;

  const withHeaders = (opts: InjectOptions, headers: Record<string, string>): InjectOptions => ({
    ...opts,
    headers: { ...(opts.headers as Record<string, string> | undefined), ...headers },
  });

  return {
    app,
    db,
    config,
    clock,
    admin,
    controllerToken,
    asAdmin: (opts) => app.inject(withHeaders(opts, { cookie: admin.cookie })),
    asController: (opts) =>
      app.inject(withHeaders(opts, { authorization: `Bearer ${controllerToken}` })),
    close: async () => {
      await app.close();
    },
  };
}

const VENUE_TABLES = TABLES.filter(
  (t) => !['User', 'AdminSession', 'DeviceToken', 'Settings', 'AuditLog'].includes(t),
);

/**
 * Clears venue data (courts, formats, seasons, fixtures…) but keeps accounts, devices and
 * settings. Uses DELETE in dependency order rather than TRUNCATE … CASCADE so device tokens
 * (which reference courts) survive.
 */
export async function resetVenue(db: PrismaClient = testDb()): Promise<void> {
  for (const table of VENUE_TABLES) await db.$executeRawUnsafe(`DELETE FROM "${table}"`);
}

/** Creates a minimal venue: two formats, N courts, one season with one competition and teams. */
export async function seedMiniVenue(
  db: PrismaClient,
  options: { courts?: number; teams?: number; nightOfWeek?: number } = {},
) {
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
  for (let i = 1; i <= (options.courts ?? 2); i++) {
    courts.push(
      await db.court.create({
        data: {
          name: `Court ${i}`,
          displayOrder: i,
          supportedFormats: { create: [{ formatId: fours.id }, { formatId: pairs.id }] },
        },
      }),
    );
  }
  const season = await db.season.create({
    data: {
      name: 'Test Season',
      startDate: '2026-02-02',
      regularWeeks: 5,
      finalsTemplate: { weeks: [], drawResolution: 'HIGHER_SEED' } as object,
      status: 'PUBLISHED',
    },
  });
  const competition = await db.competition.create({
    data: {
      seasonId: season.id,
      name: 'A Grade',
      nightOfWeek: options.nightOfWeek ?? 1,
      formatId: pairs.id,
      ladderRule: {
        kind: 'RESULT_POINTS',
        win: 6,
        draw: 4,
        loss: 2,
        bye: 6,
        forfeitWin: 6,
        forfeitLoss: 0,
        bonus: { perScorePoints: 10, points: 1, cap: null },
        tiebreakers: ['LADDER_POINTS', 'WINS', 'POINTS_DIFF', 'POINTS_FOR', 'NAME'],
      },
      published: true,
      teams: {
        create: ['Aces', 'Blockers', 'Crushers', 'Diggers']
          .slice(0, options.teams ?? 4)
          .map((name) => ({ name, shortName: name })),
      },
    },
    include: { teams: { orderBy: { name: 'asc' } } },
  });
  return { fours, pairs, courts, season, competition, teams: competition.teams };
}

/**
 * A night with two formats on two courts and two slots (linked): Fours on court 1 in both
 * slots, Pairs on court 2 in both slots. Returns ids for driving the live service.
 */
export async function seedLiveNight(
  db: PrismaClient,
  options: { date?: string; linked?: boolean } = {},
) {
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
  const court1 = await db.court.create({
    data: {
      name: 'Court 1',
      displayOrder: 1,
      supportedFormats: { create: [{ formatId: fours.id }, { formatId: pairs.id }] },
    },
  });
  const court2 = await db.court.create({
    data: {
      name: 'Court 2',
      displayOrder: 2,
      supportedFormats: { create: [{ formatId: fours.id }, { formatId: pairs.id }] },
    },
  });
  const season = await db.season.create({
    data: {
      name: 'Live Season',
      startDate: '2026-02-02',
      regularWeeks: 4,
      finalsTemplate: { weeks: [], drawResolution: 'HIGHER_SEED' } as object,
      status: 'PUBLISHED',
    },
  });
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
  const foursComp = await db.competition.create({
    data: {
      seasonId: season.id,
      name: 'Fours Comp',
      nightOfWeek: 1,
      formatId: fours.id,
      ladderRule: rule,
      published: true,
      teams: { create: ['F1', 'F2', 'F3', 'F4'].map((name) => ({ name, shortName: name })) },
    },
    include: { teams: { orderBy: { name: 'asc' } } },
  });
  const pairsComp = await db.competition.create({
    data: {
      seasonId: season.id,
      name: 'Pairs Comp',
      nightOfWeek: 1,
      formatId: pairs.id,
      ladderRule: rule,
      published: true,
      teams: { create: ['P1', 'P2', 'P3', 'P4'].map((name) => ({ name, shortName: name })) },
    },
    include: { teams: { orderBy: { name: 'asc' } } },
  });
  const session = await db.session.create({
    data: {
      seasonId: season.id,
      date: options.date ?? '2026-02-02',
      nightOfWeek: 1,
      firstSlotTime: '18:30',
      slotLengthMinutes: 42,
      slotCount: 2,
      linkShorterToLonger: options.linked ?? true,
      published: true,
    },
  });
  const ft = foursComp.teams;
  const pt = pairsComp.teams;
  const fx = async (
    competitionId: string,
    courtId: string,
    slotIndex: number,
    home: { id: string },
    away: { id: string },
  ) =>
    db.fixture.create({
      data: {
        seasonId: season.id,
        competitionId,
        sessionId: session.id,
        roundNumber: 1,
        slotIndex,
        courtId,
        homeTeamId: home.id,
        awayTeamId: away.id,
      },
    });
  const fixtures = {
    fours0: await fx(foursComp.id, court1.id, 0, ft[0]!, ft[1]!),
    fours1: await fx(foursComp.id, court1.id, 1, ft[2]!, ft[3]!),
    pairs0: await fx(pairsComp.id, court2.id, 0, pt[0]!, pt[1]!),
    pairs1: await fx(pairsComp.id, court2.id, 1, pt[2]!, pt[3]!),
  };
  return { fours, pairs, court1, court2, season, foursComp, pairsComp, session, fixtures };
}
