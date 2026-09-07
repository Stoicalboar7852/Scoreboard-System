import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type PrismaClient } from '@prisma/client';
import { type FastifyBaseLogger } from 'fastify';
import { remainingMs, type ClockState, type CourtLiveState } from '@scoreboard/shared';
import { loadConfig } from '../src/config.js';
import { AuditService } from '../src/lib/audit.js';
import { FixturesService } from '../src/services/fixtures.service.js';
import { LadderService } from '../src/services/ladder.service.js';
import { LiveService } from '../src/services/live/live.service.js';
import { SettingsService } from '../src/services/settings.service.js';
import { resetDb, seedLiveNight, testDb } from './helpers.js';

const MIN = 60_000;
const T0 = Date.UTC(2026, 1, 2, 7, 30, 0); // 18:30 Sydney time on 2026-02-02

const silentLog = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  fatal: () => undefined,
  child: () => silentLog,
  level: 'silent',
} as unknown as FastifyBaseLogger;

function makeLive(db: PrismaClient): LiveService {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test' });
  const ladders = new LadderService(db);
  const settings = new SettingsService(db, {
    venueName: config.VENUE_NAME,
    timezone: config.VENUE_TIMEZONE,
    controllerPin: null,
  });
  const fixtures = new FixturesService(db, ladders, () => Date.now());
  void new AuditService(db, silentLog);
  return new LiveService({
    db,
    now: () => Date.now(),
    log: silentLog,
    ladders,
    fixtures,
    settings,
  });
}

describe('LiveService (fake timers)', () => {
  const db = testDb();
  let live: LiveService;
  let night: Awaited<ReturnType<typeof seedLiveNight>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    await resetDb(db);
    night = await seedLiveNight(db);
    await db.settings.create({
      data: { id: 'singleton', venueName: 'Test', timezone: 'Australia/Sydney' },
    });
    live = makeLive(db);
    await live.start();
  });
  afterEach(async () => {
    await live.stop();
    vi.useRealTimers();
  });

  const clockFor = (formatId: string): ClockState => {
    const clock = live.listClocks().find((c) => c.formatId === formatId);
    if (!clock) throw new Error('clock missing');
    return clock;
  };
  const court = (id: string): CourtLiveState => live.getCourt(id) as CourtLiveState;
  /** Advances fake time in small steps, letting the scheduler's async DB work settle after each step. */
  const advance = async (ms: number) => {
    const step = 30_000;
    let remaining = ms;
    while (remaining > 0) {
      const chunk = Math.min(step, remaining);
      await vi.advanceTimersByTimeAsync(chunk);
      await live.idle();
      remaining -= chunk;
    }
    await vi.advanceTimersByTimeAsync(0);
    await live.idle();
  };

  it('goes live: one clock per format (linked), slot-0 fixtures assigned, and next fixtures known', async () => {
    const state = await live.goLive(night.session.id);
    expect(state.status).toBe('LIVE');
    expect(state.clockIds).toHaveLength(2);
    const fours = clockFor(night.fours.id);
    const pairs = clockFor(night.pairs.id);
    expect(fours).toMatchObject({
      phase: 'PRE_GAME',
      status: 'IDLE',
      mode: 'AUTO',
      linkedClockId: null,
      slotIndex: 0,
    });
    expect(pairs.linkedClockId).toBe(fours.id);
    const c1 = court(night.court1.id);
    expect(c1.current).toMatchObject({
      fixtureId: night.fixtures.fours0.id,
      status: 'SCHEDULED',
      homeName: 'F1',
      awayName: 'F2',
      formatName: 'Fours',
    });
    expect(c1.next?.fixtureId).toBe(night.fixtures.fours1.id);
    expect(c1.current?.scheduledStartMs).toBe(T0);
    expect(c1.next?.scheduledStartMs).toBe(T0 + 42 * MIN);
    expect(c1.clockId).toBe(fours.id);
    expect(court(night.court2.id).clockId).toBe(pairs.id);
    expect((await db.session.findUniqueOrThrow({ where: { id: night.session.id } })).status).toBe(
      'LIVE',
    );
  });

  it('runs a full AUTO night: start → halves → finalise → gap → next slot auto-assigned', async () => {
    await live.goLive(night.session.id);
    const fours = clockFor(night.fours.id);
    const courtEvents: CourtLiveState[] = [];
    live.events.on('court', (c: CourtLiveState) => courtEvents.push(c));

    const started = await live.clockAction(fours.id, 'start');
    expect(started).toMatchObject({ phase: 'HALF_1', status: 'RUNNING', phaseStartedAtMs: T0 });
    expect(court(night.court1.id).current?.status).toBe('LIVE');
    expect(
      (await db.fixture.findUniqueOrThrow({ where: { id: night.fixtures.fours0.id } })).status,
    ).toBe('LIVE');

    await live.score(night.court1.id, 'HOME', 1);
    await live.score(night.court1.id, 'HOME', 1);
    await live.score(night.court1.id, 'AWAY', 1);
    await live.score(night.court1.id, 'AWAY', -1);
    await live.score(night.court1.id, 'AWAY', -1);
    expect(court(night.court1.id)).toMatchObject({ homeScore: 2, awayScore: 0 });
    expect(
      (await db.fixture.findUniqueOrThrow({ where: { id: night.fixtures.fours0.id } })).homeScore,
    ).toBe(2);

    await advance(20 * MIN);
    expect(clockFor(night.fours.id)).toMatchObject({
      phase: 'HALF_TIME',
      status: 'RUNNING',
      phaseStartedAtMs: T0 + 20 * MIN,
    });
    await advance(1 * MIN);
    expect(clockFor(night.fours.id).phase).toBe('HALF_2');
    await live.score(night.court1.id, 'HOME', 1);

    await advance(20 * MIN);
    const gap = clockFor(night.fours.id);
    expect(gap).toMatchObject({ phase: 'BETWEEN_GAMES', status: 'RUNNING', slotIndex: 0 });
    const finalised = await db.fixture.findUniqueOrThrow({
      where: { id: night.fixtures.fours0.id },
    });
    expect(finalised).toMatchObject({ status: 'COMPLETED', homeScore: 3, awayScore: 0 });
    expect(finalised.completedAt?.getTime()).toBe(T0 + 41 * MIN);
    expect(court(night.court1.id).current?.status).toBe('COMPLETED');
    await expect(live.score(night.court1.id, 'HOME', 1)).rejects.toThrow(/No live game/);

    await advance(1 * MIN);
    const next = clockFor(night.fours.id);
    expect(next).toMatchObject({
      phase: 'HALF_1',
      status: 'RUNNING',
      slotIndex: 1,
      phaseStartedAtMs: T0 + 42 * MIN,
    });
    const c1 = court(night.court1.id);
    expect(c1.current).toMatchObject({
      fixtureId: night.fixtures.fours1.id,
      status: 'LIVE',
      homeName: 'F3',
    });
    expect(c1).toMatchObject({ homeScore: 0, awayScore: 0 });
    expect(c1.next).toBeNull();

    await advance(41 * MIN);
    expect(clockFor(night.fours.id)).toMatchObject({
      phase: 'FINISHED',
      status: 'IDLE',
      slotIndex: 1,
    });
    expect(
      (await db.fixture.findUniqueOrThrow({ where: { id: night.fixtures.fours1.id } })).status,
    ).toBe('COMPLETED');
    expect(courtEvents.length).toBeGreaterThan(5);
  });

  it('pause and resume keep the remaining time', async () => {
    await live.goLive(night.session.id);
    const id = clockFor(night.fours.id).id;
    await live.clockAction(id, 'start');
    await advance(5 * MIN);
    const paused = await live.clockAction(id, 'pause');
    expect(paused).toMatchObject({ status: 'PAUSED', remainingAtPauseMs: 15 * MIN });
    await advance(30 * MIN);
    expect(clockFor(night.fours.id).phase).toBe('HALF_1');
    const resumed = await live.clockAction(id, 'resume');
    expect(remainingMs(resumed, Date.now())).toBe(15 * MIN);
    await advance(15 * MIN);
    expect(clockFor(night.fours.id).phase).toBe('HALF_TIME');
    await live.clockAdjust(id, 30);
    expect(remainingMs(clockFor(night.fours.id), Date.now())).toBe(90_000);
    await expect(live.clockAction(id, 'resume')).rejects.toThrow();
  });

  it('Pairs waits for Fours and both start the next slot together', async () => {
    await live.goLive(night.session.id);
    const fours = clockFor(night.fours.id);
    const pairs = clockFor(night.pairs.id);
    await live.clockAction(fours.id, 'start');
    await live.clockAction(pairs.id, 'start');
    await advance(29 * MIN);
    expect(clockFor(night.pairs.id)).toMatchObject({ phase: 'WAITING_FOR_LINKED', status: 'IDLE' });
    expect(clockFor(night.fours.id).phase).toBe('HALF_2');
    expect(
      (await db.fixture.findUniqueOrThrow({ where: { id: night.fixtures.pairs0.id } })).status,
    ).toBe('COMPLETED');
    await advance(12 * MIN);
    const f = clockFor(night.fours.id);
    const p = clockFor(night.pairs.id);
    expect(f.phase).toBe('BETWEEN_GAMES');
    expect(p.phase).toBe('BETWEEN_GAMES');
    expect(p.phaseStartedAtMs).toBe(f.phaseStartedAtMs);
    await advance(1 * MIN);
    expect(clockFor(night.fours.id)).toMatchObject({ phase: 'HALF_1', slotIndex: 1 });
    expect(clockFor(night.pairs.id)).toMatchObject({ phase: 'HALF_1', slotIndex: 1 });
    expect(clockFor(night.pairs.id).phaseStartedAtMs).toBe(
      clockFor(night.fours.id).phaseStartedAtMs,
    );
    expect(court(night.court2.id).current?.fixtureId).toBe(night.fixtures.pairs1.id);
  });

  it('unlinked Pairs runs on its own cadence', async () => {
    await db.session.update({
      where: { id: night.session.id },
      data: { linkShorterToLonger: false },
    });
    await live.goLive(night.session.id);
    const pairs = clockFor(night.pairs.id);
    expect(pairs.linkedClockId).toBeNull();
    await live.clockAction(pairs.id, 'start');
    await advance(29 * MIN);
    expect(clockFor(night.pairs.id).phase).toBe('BETWEEN_GAMES');
    await advance(1 * MIN);
    expect(clockFor(night.pairs.id)).toMatchObject({ phase: 'HALF_1', slotIndex: 1 });
  });

  it('time outs are only allowed during a running half and expire on their own', async () => {
    await live.goLive(night.session.id);
    const id = clockFor(night.fours.id).id;
    await expect(live.callTimeout(night.court1.id, 'HOME')).rejects.toThrow(/half is running/);
    await live.clockAction(id, 'start');
    const t = await live.callTimeout(night.court1.id, 'HOME');
    expect(t.timeout).toMatchObject({ active: true, durationMs: 60_000, calledBy: 'HOME' });
    await expect(live.callTimeout(night.court1.id, 'AWAY')).rejects.toThrow(/already/);
    await advance(30_000);
    expect(court(night.court1.id).timeout.active).toBe(true);
    expect(clockFor(night.fours.id).status).toBe('RUNNING');
    await advance(30_000);
    expect(court(night.court1.id).timeout.active).toBe(false);
    await live.callTimeout(night.court1.id, null);
    const ended = await live.endTimeout(night.court1.id);
    expect(ended.timeout.active).toBe(false);
    await advance(19 * MIN + 30_000);
    expect(clockFor(night.fours.id).phase).toBe('HALF_TIME');
    await expect(live.callTimeout(night.court1.id, 'HOME')).rejects.toThrow();
  });

  it('admin can end, reopen, override scores, assign fixtures and run a quick game', async () => {
    await live.goLive(night.session.id);
    const id = clockFor(night.fours.id).id;
    await live.clockAction(id, 'start');
    await live.score(night.court1.id, 'HOME', 1);
    const ended = await live.endGame(night.court1.id);
    expect(ended.current?.status).toBe('COMPLETED');
    expect(
      (await db.fixture.findUniqueOrThrow({ where: { id: night.fixtures.fours0.id } })).status,
    ).toBe('COMPLETED');
    const reopened = await live.reopenGame(night.court1.id);
    expect(reopened.current?.status).toBe('LIVE');
    const set = await live.setScore(night.court1.id, 10, 7);
    expect(set).toMatchObject({ homeScore: 10, awayScore: 7 });
    expect(
      (await db.fixture.findUniqueOrThrow({ where: { id: night.fixtures.fours0.id } })).awayScore,
    ).toBe(7);

    const assigned = await live.assignFixture(night.court1.id, night.fixtures.fours1.id);
    expect(assigned.current).toMatchObject({ fixtureId: night.fixtures.fours1.id, status: 'LIVE' });
    await expect(
      live.assignFixture(night.court1.id, night.fixtures.pairs1.id),
    ).resolves.toMatchObject({ clockId: clockFor(night.pairs.id).id });

    const quick = await live.quickGame(night.court2.id, 'Walk-ins', 'Staff', night.fours.id);
    expect(quick.current).toMatchObject({
      homeName: 'Walk-ins',
      awayName: 'Staff',
      adHoc: true,
      status: 'LIVE',
      formatName: 'Fours',
    });
    expect(quick.clockId).toBe(id);
    const cleared = await live.assignFixture(night.court2.id, null);
    expect(cleared.current).toBeNull();
  });

  it('single mode stops after one game; advanceSlot moves on manually', async () => {
    await live.goLive(night.session.id);
    const id = clockFor(night.fours.id).id;
    await live.clockSetMode(id, 'SINGLE');
    await live.clockAction(id, 'start');
    await advance(41 * MIN);
    expect(clockFor(night.fours.id)).toMatchObject({ phase: 'FINISHED', slotIndex: 0 });
    const advanced = await live.clockAction(id, 'advanceSlot');
    expect(advanced).toMatchObject({ phase: 'PRE_GAME', slotIndex: 1 });
    expect(court(night.court1.id).current?.fixtureId).toBe(night.fixtures.fours1.id);
    await expect(live.clockAction(id, 'advanceSlot')).rejects.toThrow(/No fixtures/);
  });

  it('ends the night: live games finalised, courts cleared, session complete', async () => {
    await live.goLive(night.session.id);
    const id = clockFor(night.fours.id).id;
    await live.clockAction(id, 'start');
    await live.score(night.court1.id, 'AWAY', 1);
    await live.endSession(night.session.id);
    expect(live.listClocks()).toHaveLength(0);
    expect(court(night.court1.id)).toMatchObject({ sessionId: null, current: null, homeScore: 0 });
    expect(
      (await db.fixture.findUniqueOrThrow({ where: { id: night.fixtures.fours0.id } })).status,
    ).toBe('COMPLETED');
    expect((await db.session.findUniqueOrThrow({ where: { id: night.session.id } })).status).toBe(
      'COMPLETE',
    );
    await expect(live.goLive(night.session.id)).rejects.toThrow(/completed/);
  });

  it('reports warnings for offline controllers and empty clocks', async () => {
    await live.goLive(night.session.id);
    const warnings = live.warnings(night.session.id);
    expect(warnings.map((w) => w.code)).toContain('CONTROLLER_OFFLINE');
    live.seen(night.court1.id, 'CONTROLLER');
    live.seen(night.court2.id, 'CONTROLLER');
    expect(
      live.warnings(night.session.id).filter((w) => w.code === 'CONTROLLER_OFFLINE'),
    ).toHaveLength(0);
    await advance(61_000);
    expect(
      live.warnings(night.session.id).filter((w) => w.code === 'CONTROLLER_OFFLINE'),
    ).toHaveLength(2);
  });
});

describe('LiveService restart recovery', () => {
  const db = testDb();
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    await resetDb(db);
    await db.settings.create({
      data: { id: 'singleton', venueName: 'Test', timezone: 'Australia/Sydney' },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fast-forwards a clock that ran while the server was down, finalising and assigning fixtures', async () => {
    const night = await seedLiveNight(db);
    const first = makeLive(db);
    await first.start();
    await first.goLive(night.session.id);
    const foursId = first.listClocks().find((c) => c.formatId === night.fours.id)?.id as string;
    const pairsId = first.listClocks().find((c) => c.formatId === night.pairs.id)?.id as string;
    await first.clockAction(foursId, 'start');
    await first.clockAction(pairsId, 'start');
    await first.score(night.court1.id, 'HOME', 1);
    await first.score(night.court2.id, 'AWAY', 2);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    await first.idle();
    await first.stop(); // "crash" mid Half 1

    vi.setSystemTime(T0 + 42 * MIN + 3 * MIN); // 3 minutes into slot 2
    const second = makeLive(db);
    await second.start();
    const fours = second.getClock(foursId) as ClockState;
    const pairs = second.getClock(pairsId) as ClockState;
    expect(fours).toMatchObject({
      phase: 'HALF_1',
      status: 'RUNNING',
      slotIndex: 1,
      phaseStartedAtMs: T0 + 42 * MIN,
    });
    expect(remainingMs(fours, Date.now())).toBe(17 * MIN);
    expect(pairs).toMatchObject({
      phase: 'HALF_1',
      status: 'RUNNING',
      slotIndex: 1,
      phaseStartedAtMs: T0 + 42 * MIN,
    });
    const f0 = await db.fixture.findUniqueOrThrow({ where: { id: night.fixtures.fours0.id } });
    expect(f0).toMatchObject({ status: 'COMPLETED', homeScore: 1, awayScore: 0 });
    const p0 = await db.fixture.findUniqueOrThrow({ where: { id: night.fixtures.pairs0.id } });
    expect(p0).toMatchObject({ status: 'COMPLETED', homeScore: 0, awayScore: 2 });
    expect(second.getCourt(night.court1.id)?.current).toMatchObject({
      fixtureId: night.fixtures.fours1.id,
      status: 'LIVE',
    });
    expect(second.getCourt(night.court2.id)?.current).toMatchObject({
      fixtureId: night.fixtures.pairs1.id,
      status: 'LIVE',
    });
    for (let i = 0; i < 34; i++) {
      await vi.advanceTimersByTimeAsync(30_000);
      await second.idle();
    }
    expect(second.getClock(foursId)?.phase).toBe('HALF_TIME');
    await second.stop();
  });

  it('restores a paused clock and an active time out exactly as they were', async () => {
    const night = await seedLiveNight(db);
    const first = makeLive(db);
    await first.start();
    await first.goLive(night.session.id);
    const foursId = first.listClocks().find((c) => c.formatId === night.fours.id)?.id as string;
    await first.clockAction(foursId, 'start');
    await first.callTimeout(night.court1.id, 'AWAY');
    await vi.advanceTimersByTimeAsync(2 * MIN);
    await first.idle();
    await first.clockAction(foursId, 'pause');
    await first.stop();

    vi.setSystemTime(T0 + 60 * MIN);
    const second = makeLive(db);
    await second.start();
    expect(second.getClock(foursId)).toMatchObject({
      status: 'PAUSED',
      phase: 'HALF_1',
      remainingAtPauseMs: 18 * MIN,
    });
    expect(second.getCourt(night.court1.id)?.timeout.active).toBe(false);
    await second.stop();
  });
});
