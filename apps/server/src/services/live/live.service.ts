import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { type PrismaClient } from '@prisma/client';
import { type FastifyBaseLogger } from 'fastify';
import {
  INACTIVE_TIMEOUT,
  applyScoreDelta,
  canCallTimeout,
  canScore,
  clockReducer,
  createClockState,
  endTimeout,
  isInGame,
  isTimeoutExpired,
  phaseEndsAtMs,
  startTimeout,
  type ClockContext,
  type ClockEffect,
  type ClockEvent,
  type ClockMode,
  type ClockState,
  type CourtLiveState,
  type FixtureDisplay,
  type LiveSnapshot,
  type LiveWarning,
  type SessionLiveState,
  type TeamSide,
} from '@scoreboard/shared';
import { NotFoundError, RuleViolationError } from '../../errors.js';
import { type Now } from '../../lib/time.js';
import { type FixturesService } from '../fixtures.service.js';
import { type LadderService } from '../ladder.service.js';
import { type SettingsService } from '../settings.service.js';
import { ActionCache } from './actionCache.js';
import { LiveStore } from './store.js';
import {
  durationsOf,
  fixtureFormatId,
  liveFixtureInclude,
  longestFormat,
  toDisplay,
  type FormatRow,
  type LiveFixtureRow,
  type SessionRow,
} from './types.js';

export interface LiveDeps {
  db: PrismaClient;
  now: Now;
  log: FastifyBaseLogger;
  ladders: LadderService;
  fixtures: FixturesService;
  settings: SettingsService;
}

export type ClockActionName =
  'start' | 'pause' | 'resume' | 'skipPhase' | 'reset' | 'endGame' | 'advanceSlot';

const SWEEP_MS = 1000;
const SEEN_PERSIST_MS = 15_000;
const CONTROLLER_OFFLINE_MS = 60_000;
const ACTIVE_FIXTURE: ReadonlySet<string> = new Set(['SCHEDULED', 'LIVE']);

/**
 * Server-authoritative live state: clocks, court states, time outs and the scheduler.
 * Every public command runs through a queue so state changes never interleave, and every
 * change is persisted before it is broadcast. Emits 'clock', 'court' and 'session' events.
 */
export class LiveService {
  readonly events = new EventEmitter();
  readonly actions: ActionCache;

  private readonly store: LiveStore;
  private readonly clocks = new Map<string, ClockState>();
  private readonly courts = new Map<string, CourtLiveState>();
  private readonly sessions = new Map<string, SessionRow>();
  private readonly sessionVersions = new Map<string, number>();
  private readonly formats = new Map<string, FormatRow>();
  private readonly courtNames = new Map<string, string>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly seenPersistedAt = new Map<string, number>();
  private sweepTimer: NodeJS.Timeout | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private timezone = 'Australia/Sydney';
  private defaultTimeoutMs = 60_000;
  private started = false;

  constructor(private readonly deps: LiveDeps) {
    this.store = new LiveStore(deps.db);
    this.actions = new ActionCache(deps.now);
  }

  // ---- lifecycle ------------------------------------------------------------------------

  /** Loads persisted state, fast-forwards clocks that ran while the server was down, arms timers. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.run(async () => {
      await this.reloadConfig();
      await this.ensureCourtStates();
      const liveSessions = await this.deps.db.session.findMany({ where: { status: 'LIVE' } });
      for (const s of liveSessions) this.sessions.set(s.id, s);
      for (const clock of await this.store.loadClocks()) this.clocks.set(clock.id, clock);
      for (const row of await this.store.loadCourts()) {
        const existing = this.courts.get(row.courtId);
        if (!existing) continue;
        this.courts.set(row.courtId, {
          ...existing,
          ...row,
          courtName: existing.courtName,
          current: null,
          next: null,
        });
      }
      await this.rebuildDisplays();
      await this.fastForwardAll();
      for (const clock of this.clocks.values()) this.armClock(clock);
      for (const court of this.courts.values()) this.armTimeout(court);
      this.sweepTimer = setInterval(() => void this.run(() => this.sweep()), SWEEP_MS);
      this.sweepTimer.unref?.();
    });
  }

  async stop(): Promise<void> {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    await this.queue.catch(() => undefined);
    this.started = false;
  }

  /** Resolves once every queued command (including scheduler expiries) has finished. */
  async idle(): Promise<void> {
    let last: unknown = null;
    while (this.queue !== last) {
      last = this.queue;
      await last;
    }
  }

  /** Serialises commands: state mutations never interleave. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async reloadConfig(): Promise<void> {
    const [formats, settings] = await Promise.all([
      this.deps.db.gameFormat.findMany(),
      this.deps.settings.get(),
    ]);
    this.formats.clear();
    for (const f of formats) this.formats.set(f.id, f);
    this.timezone = settings.timezone;
    this.defaultTimeoutMs = settings.defaultTimeoutSeconds * 1000;
  }

  private async ensureCourtStates(): Promise<void> {
    const courts = await this.deps.db.court.findMany({ where: { active: true } });
    for (const c of courts) {
      this.courtNames.set(c.id, c.name);
      if (!this.courts.has(c.id)) {
        this.courts.set(c.id, {
          courtId: c.id,
          courtName: c.name,
          sessionId: null,
          clockId: null,
          currentFixtureId: null,
          nextFixtureId: null,
          current: null,
          next: null,
          homeScore: 0,
          awayScore: 0,
          timeout: INACTIVE_TIMEOUT,
          lastControllerSeenMs: null,
          lastScoreboardSeenMs: null,
          version: 0,
        });
      } else {
        const state = this.courts.get(c.id) as CourtLiveState;
        state.courtName = c.name;
      }
    }
  }

  /** Makes sure a court created after boot has a live state (called on court:join). */
  async ensureCourt(courtId: string): Promise<CourtLiveState | null> {
    return this.run(async () => {
      if (!this.courts.has(courtId)) await this.ensureCourtStates();
      return this.courts.get(courtId) ?? null;
    });
  }

  // ---- snapshots -------------------------------------------------------------------------

  snapshot(scope: { courtId?: string; sessionId?: string } = {}): LiveSnapshot {
    const now = this.deps.now();
    if (scope.courtId) {
      const court = this.courts.get(scope.courtId);
      const clocks: ClockState[] = [];
      if (court?.clockId) {
        const clock = this.clocks.get(court.clockId);
        if (clock) {
          clocks.push(clock);
          const linked = clock.linkedClockId ? this.clocks.get(clock.linkedClockId) : null;
          if (linked) clocks.push(linked);
        }
      }
      const session = court?.sessionId ? this.sessionState(court.sessionId) : null;
      return { serverNowMs: now, session, clocks, courts: court ? [court] : [] };
    }
    const sessionId = scope.sessionId ?? [...this.sessions.keys()][0] ?? null;
    return {
      serverNowMs: now,
      session: sessionId ? this.sessionState(sessionId) : null,
      clocks: [...this.clocks.values()].filter((c) => !sessionId || c.sessionId === sessionId),
      courts: [...this.courts.values()],
    };
  }

  getClock(clockId: string): ClockState | null {
    return this.clocks.get(clockId) ?? null;
  }

  getCourt(courtId: string): CourtLiveState | null {
    return this.courts.get(courtId) ?? null;
  }

  listClocks(): ClockState[] {
    return [...this.clocks.values()];
  }

  listCourts(): CourtLiveState[] {
    return [...this.courts.values()];
  }

  /** Courts whose clock is this one or that wait on it (they display its time). */
  courtsFollowingClock(clockId: string): string[] {
    const dependants = new Set<string>([clockId]);
    for (const c of this.clocks.values()) if (c.linkedClockId === clockId) dependants.add(c.id);
    return [...this.courts.values()]
      .filter((c) => c.clockId && dependants.has(c.clockId))
      .map((c) => c.courtId);
  }

  sessionState(sessionId: string): SessionLiveState | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return {
      sessionId,
      date: session.date,
      status: session.status,
      linkShorterToLonger: session.linkShorterToLonger,
      slotCount: session.slotCount,
      clockIds: [...this.clocks.values()].filter((c) => c.sessionId === sessionId).map((c) => c.id),
      courtIds: [...this.courts.values()]
        .filter((c) => c.sessionId === sessionId)
        .map((c) => c.courtId),
      version: this.sessionVersions.get(sessionId) ?? 0,
    };
  }

  activeSessionIds(): string[] {
    return [...this.sessions.keys()];
  }

  warnings(sessionId?: string): LiveWarning[] {
    const now = this.deps.now();
    const warnings: LiveWarning[] = [];
    for (const clock of this.clocks.values()) {
      if (sessionId && clock.sessionId !== sessionId) continue;
      const attached = [...this.courts.values()].filter((c) => c.clockId === clock.id && c.current);
      if (attached.length === 0 && clock.phase !== 'FINISHED') {
        warnings.push({
          code: 'CLOCK_NO_FIXTURES',
          message: `${clock.label} clock has no fixtures on any court`,
          clockId: clock.id,
        });
      }
    }
    for (const court of this.courts.values()) {
      if (!court.sessionId || (sessionId && court.sessionId !== sessionId)) continue;
      const clock = court.clockId ? this.clocks.get(court.clockId) : null;
      if (
        court.current?.status === 'LIVE' &&
        clock &&
        !isInGame(clock) &&
        clock.phase !== 'PRE_GAME'
      ) {
        warnings.push({
          code: 'COURT_BUSY',
          message: `${court.courtName} still has a live game while the clock has moved on`,
          courtId: court.courtId,
        });
      }
      if (
        court.current &&
        (court.lastControllerSeenMs === null ||
          now - court.lastControllerSeenMs > CONTROLLER_OFFLINE_MS)
      ) {
        warnings.push({
          code: 'CONTROLLER_OFFLINE',
          message: `${court.courtName}: no controller connected`,
          courtId: court.courtId,
        });
      }
    }
    return warnings;
  }

  // ---- session commands -------------------------------------------------------------------

  async goLive(sessionId: string): Promise<SessionLiveState> {
    return this.run(async () => {
      const session = await this.deps.db.session.findUnique({ where: { id: sessionId } });
      if (!session) throw new NotFoundError('Session', sessionId);
      if (session.status === 'COMPLETE')
        throw new RuleViolationError('This session has already been completed');
      const other = [...this.sessions.values()].find(
        (s) => s.id !== sessionId && s.status === 'LIVE',
      );
      if (other)
        throw new RuleViolationError(`Another session (${other.date}) is live; end it first`);
      if (session.status === 'LIVE' && this.sessions.has(sessionId))
        return this.sessionState(sessionId) as SessionLiveState;

      await this.reloadConfig();
      await this.ensureCourtStates();
      const fixtures = await this.loadFixtures(sessionId);
      const formatIds = [
        ...new Set(fixtures.map(fixtureFormatId).filter((x): x is string => x !== null)),
      ];
      const formats = formatIds
        .map((id) => this.formats.get(id))
        .filter((f): f is FormatRow => f !== undefined);
      if (formats.length === 0)
        throw new RuleViolationError('The session has no fixtures with a game format');

      const updated = await this.deps.db.session.update({
        where: { id: sessionId },
        data: { status: 'LIVE' },
      });
      this.sessions.set(sessionId, updated);
      const longest = longestFormat(formats);
      const created: ClockState[] = [];
      for (const format of formats) {
        const linkedClockId =
          session.linkShorterToLonger && longest && longest.id !== format.id ? 'PENDING' : null;
        const clock = createClockState(
          {
            id: randomUUID(),
            sessionId,
            formatId: format.id,
            label: format.name,
            mode: 'AUTO',
            linkedClockId,
          },
          durationsOf(format),
        );
        created.push(clock);
      }
      const longestClock = created.find((c) => c.formatId === longest?.id) ?? null;
      for (const clock of created) {
        if (clock.linkedClockId === 'PENDING') clock.linkedClockId = longestClock?.id ?? null;
        this.clocks.set(clock.id, clock);
        await this.store.saveClock(clock);
      }
      for (const court of this.courts.values()) {
        await this.updateCourt(court.courtId, (c) => ({
          ...c,
          sessionId,
          clockId: null,
          current: null,
          currentFixtureId: null,
          homeScore: 0,
          awayScore: 0,
          timeout: INACTIVE_TIMEOUT,
        }));
      }
      for (const clock of created) {
        await this.assignSlot(clock, clock.slotIndex, fixtures);
        this.emitClock(clock);
      }
      // Courts with no fixture at slot 0 still get their "next" fixture.
      for (const court of this.courts.values()) {
        if (!court.current) {
          const next = this.nextFixtureFor(fixtures, court.courtId, -1);
          await this.updateCourt(court.courtId, (c) => ({
            ...c,
            next: next ? toDisplay(next, updated, this.timezone) : null,
            nextFixtureId: next?.id ?? null,
          }));
        }
      }
      this.bumpSession(sessionId);
      return this.sessionState(sessionId) as SessionLiveState;
    });
  }

  async endSession(sessionId: string): Promise<void> {
    return this.run(async () => {
      const session =
        this.sessions.get(sessionId) ??
        (await this.deps.db.session.findUnique({ where: { id: sessionId } }));
      if (!session) throw new NotFoundError('Session', sessionId);
      for (const court of this.courts.values()) {
        if (court.sessionId !== sessionId) continue;
        if (court.current?.status === 'LIVE' && court.currentFixtureId) {
          await this.deps.fixtures.finalise(this.deps.db, court.currentFixtureId, {
            homeScore: court.homeScore,
            awayScore: court.awayScore,
          });
        }
        this.clearTimer(`timeout:${court.courtId}`);
        await this.updateCourt(court.courtId, (c) => ({
          ...c,
          sessionId: null,
          clockId: null,
          currentFixtureId: null,
          nextFixtureId: null,
          current: null,
          next: null,
          homeScore: 0,
          awayScore: 0,
          timeout: INACTIVE_TIMEOUT,
        }));
      }
      for (const clock of [...this.clocks.values()]) {
        if (clock.sessionId !== sessionId) continue;
        this.clearTimer(clock.id);
        this.clocks.delete(clock.id);
        await this.store.deleteClock(clock.id);
        this.emitClock({ ...clock, phase: 'FINISHED', status: 'IDLE', version: clock.version + 1 });
      }
      await this.deps.db.session.update({ where: { id: sessionId }, data: { status: 'COMPLETE' } });
      this.sessions.delete(sessionId);
      this.bumpSession(sessionId);
      this.events.emit('session', {
        sessionId,
        date: session.date,
        status: 'COMPLETE',
        linkShorterToLonger: session.linkShorterToLonger,
        slotCount: session.slotCount,
        clockIds: [],
        courtIds: [],
        version: this.sessionVersions.get(sessionId) ?? 0,
      } satisfies SessionLiveState);
    });
  }

  async setLinkFlag(
    sessionId: string,
    linkShorterToLonger: boolean,
  ): Promise<SessionLiveState | null> {
    return this.run(async () => {
      const updated = await this.deps.db.session.update({
        where: { id: sessionId },
        data: { linkShorterToLonger },
      });
      if (this.sessions.has(sessionId)) this.sessions.set(sessionId, updated);
      const clocks = [...this.clocks.values()].filter(
        (c) => c.sessionId === sessionId && c.formatId,
      );
      const formats = clocks
        .map((c) => this.formats.get(c.formatId as string))
        .filter((f): f is FormatRow => f !== undefined);
      const longest = longestFormat(formats);
      const longestClock = clocks.find((c) => c.formatId === longest?.id) ?? null;
      for (const clock of clocks) {
        const target =
          linkShorterToLonger && longestClock && longestClock.id !== clock.id
            ? longestClock.id
            : null;
        if (clock.linkedClockId !== target)
          await this.applyClockEvent(clock.id, {
            type: 'SET_LINK',
            linkedClockId: target,
            nowMs: this.deps.now(),
          });
      }
      this.bumpSession(sessionId);
      return this.sessionState(sessionId);
    });
  }

  // ---- clock commands ----------------------------------------------------------------------

  async clockAction(clockId: string, action: ClockActionName): Promise<ClockState> {
    const map: Record<ClockActionName, ClockEvent['type']> = {
      start: 'START',
      pause: 'PAUSE',
      resume: 'RESUME',
      skipPhase: 'SKIP_PHASE',
      reset: 'RESET',
      endGame: 'END_GAME',
      advanceSlot: 'ADVANCE_SLOT',
    };
    return this.run(() =>
      this.applyClockEvent(clockId, { type: map[action], nowMs: this.deps.now() } as ClockEvent),
    );
  }

  async clockAdjust(clockId: string, deltaSeconds: number): Promise<ClockState> {
    return this.run(() =>
      this.applyClockEvent(clockId, {
        type: 'ADJUST',
        deltaMs: deltaSeconds * 1000,
        nowMs: this.deps.now(),
      }),
    );
  }

  async clockSetMode(clockId: string, mode: ClockMode): Promise<ClockState> {
    return this.run(() =>
      this.applyClockEvent(clockId, { type: 'SET_MODE', mode, nowMs: this.deps.now() }),
    );
  }

  async clockSetLink(clockId: string, linkedClockId: string | null): Promise<ClockState> {
    return this.run(async () => {
      if (linkedClockId) {
        const target = this.clocks.get(linkedClockId);
        const source = this.clocks.get(clockId);
        if (!target || !source || target.sessionId !== source.sessionId)
          throw new RuleViolationError('Linked clock must belong to the same session');
        if (target.linkedClockId === clockId)
          throw new RuleViolationError('Clocks cannot wait for each other');
      }
      return this.applyClockEvent(clockId, {
        type: 'SET_LINK',
        linkedClockId,
        nowMs: this.deps.now(),
      });
    });
  }

  // ---- court commands ----------------------------------------------------------------------

  async score(courtId: string, team: TeamSide, delta: number): Promise<CourtLiveState> {
    return this.run(async () => {
      const court = this.requireCourt(courtId);
      if (!canScore(court)) throw new RuleViolationError('No live game on this court');
      const scores = applyScoreDelta(
        { homeScore: court.homeScore, awayScore: court.awayScore },
        team,
        delta,
      );
      if (court.currentFixtureId)
        await this.deps.db.fixture.update({ where: { id: court.currentFixtureId }, data: scores });
      return this.updateCourt(courtId, (c) => ({ ...c, ...scores }));
    });
  }

  async setScore(courtId: string, homeScore: number, awayScore: number): Promise<CourtLiveState> {
    return this.run(async () => {
      const court = this.requireCourt(courtId);
      if (!court.current || !court.currentFixtureId)
        throw new RuleViolationError('No game on this court');
      const fixture = await this.deps.db.fixture.update({
        where: { id: court.currentFixtureId },
        data: { homeScore, awayScore },
      });
      if (fixture.status === 'COMPLETED') this.deps.ladders.invalidate(fixture.competitionId);
      return this.updateCourt(courtId, (c) => ({ ...c, homeScore, awayScore }));
    });
  }

  async callTimeout(courtId: string, calledBy: TeamSide | null): Promise<CourtLiveState> {
    return this.run(async () => {
      const court = this.requireCourt(courtId);
      const clock = court.clockId ? (this.clocks.get(court.clockId) ?? null) : null;
      if (!canCallTimeout(clock) || court.current?.status !== 'LIVE')
        throw new RuleViolationError('Time outs can only be called while a half is running');
      if (court.timeout.active) throw new RuleViolationError('A time out is already running');
      const format = clock?.formatId ? this.formats.get(clock.formatId) : undefined;
      const durationMs = format ? format.timeoutSeconds * 1000 : this.defaultTimeoutMs;
      const updated = await this.updateCourt(courtId, (c) => ({
        ...c,
        timeout: startTimeout(this.deps.now(), durationMs, calledBy),
      }));
      this.armTimeout(updated);
      return updated;
    });
  }

  async endTimeout(courtId: string): Promise<CourtLiveState> {
    return this.run(async () => {
      const court = this.requireCourt(courtId);
      if (!court.timeout.active) return court;
      this.clearTimer(`timeout:${courtId}`);
      return this.updateCourt(courtId, (c) => ({ ...c, timeout: endTimeout() }));
    });
  }

  async assignFixture(courtId: string, fixtureId: string | null): Promise<CourtLiveState> {
    return this.run(async () => {
      const court = this.requireCourt(courtId);
      if (!court.sessionId) throw new RuleViolationError('No live session on this court');
      const session = this.sessions.get(court.sessionId);
      if (!session) throw new RuleViolationError('Session is not live');
      if (fixtureId === null) {
        return this.updateCourt(courtId, (c) => ({
          ...c,
          current: null,
          currentFixtureId: null,
          homeScore: 0,
          awayScore: 0,
          timeout: INACTIVE_TIMEOUT,
        }));
      }
      const fixture = await this.deps.db.fixture.findUnique({
        where: { id: fixtureId },
        include: liveFixtureInclude,
      });
      if (!fixture || fixture.sessionId !== session.id)
        throw new NotFoundError('Fixture in this session', fixtureId);
      if (!ACTIVE_FIXTURE.has(fixture.status))
        throw new RuleViolationError(`Fixture is ${fixture.status.toLowerCase()}`);
      const formatId = fixtureFormatId(fixture);
      if (!formatId) throw new RuleViolationError('Fixture has no game format');
      const clock = await this.clockForFormat(session.id, formatId);
      if (fixture.courtId !== courtId) {
        await this.deps.db.fixture.update({ where: { id: fixtureId }, data: { courtId } });
      }
      let status = fixture.status;
      if (isInGame(clock) && status === 'SCHEDULED') {
        await this.deps.db.fixture.update({ where: { id: fixtureId }, data: { status: 'LIVE' } });
        status = 'LIVE';
      }
      const fixtures = await this.loadFixtures(session.id);
      const next = this.nextFixtureFor(fixtures, courtId, fixture.slotIndex ?? clock.slotIndex);
      return this.updateCourt(courtId, (c) => ({
        ...c,
        clockId: clock.id,
        currentFixtureId: fixture.id,
        current: { ...toDisplay(fixture, session, this.timezone), status },
        nextFixtureId: next?.id ?? null,
        next: next ? toDisplay(next, session, this.timezone) : null,
        homeScore: fixture.homeScore,
        awayScore: fixture.awayScore,
        timeout: INACTIVE_TIMEOUT,
      }));
    });
  }

  async quickGame(
    courtId: string,
    homeName: string,
    awayName: string,
    formatId: string,
  ): Promise<CourtLiveState> {
    const court = this.requireCourt(courtId);
    if (!court.sessionId)
      throw new RuleViolationError('Go live with a session before starting a quick game');
    const format = this.formats.get(formatId);
    if (!format) throw new NotFoundError('Format', formatId);
    const clock = await this.run(() => this.clockForFormat(court.sessionId as string, formatId));
    const fixture = await this.deps.db.fixture.create({
      data: {
        sessionId: court.sessionId,
        formatId,
        homeName,
        awayName,
        courtId,
        slotIndex: clock.slotIndex,
        status: 'SCHEDULED',
      },
    });
    return this.assignFixture(courtId, fixture.id);
  }

  async endGame(courtId: string): Promise<CourtLiveState> {
    return this.run(async () => {
      const court = this.requireCourt(courtId);
      if (court.current?.status !== 'LIVE' || !court.currentFixtureId)
        throw new RuleViolationError('No live game on this court');
      await this.deps.fixtures.finalise(this.deps.db, court.currentFixtureId, {
        homeScore: court.homeScore,
        awayScore: court.awayScore,
      });
      this.clearTimer(`timeout:${courtId}`);
      return this.updateCourt(courtId, (c) => ({
        ...c,
        current: c.current ? { ...c.current, status: 'COMPLETED' } : null,
        timeout: INACTIVE_TIMEOUT,
      }));
    });
  }

  async reopenGame(courtId: string): Promise<CourtLiveState> {
    return this.run(async () => {
      const court = this.requireCourt(courtId);
      if (!court.currentFixtureId || court.current?.status !== 'COMPLETED')
        throw new RuleViolationError('No completed game to reopen on this court');
      const fixture = await this.deps.db.fixture.update({
        where: { id: court.currentFixtureId },
        data: { status: 'LIVE', completedAt: null },
      });
      this.deps.ladders.invalidate(fixture.competitionId);
      return this.updateCourt(courtId, (c) => ({
        ...c,
        current: c.current ? { ...c.current, status: 'LIVE' } : null,
      }));
    });
  }

  /** Heartbeat from a controller or scoreboard; persisted and broadcast at most every 15 s. */
  seen(courtId: string, role: 'CONTROLLER' | 'SCOREBOARD'): void {
    const court = this.courts.get(courtId);
    if (!court) return;
    const now = this.deps.now();
    const key = `${courtId}:${role}`;
    if (role === 'CONTROLLER') court.lastControllerSeenMs = now;
    else court.lastScoreboardSeenMs = now;
    const last = this.seenPersistedAt.get(key) ?? 0;
    if (now - last >= SEEN_PERSIST_MS) {
      this.seenPersistedAt.set(key, now);
      void this.run(async () => {
        const current = this.courts.get(courtId);
        if (current) await this.updateCourt(courtId, (c) => ({ ...c }));
      });
    }
  }

  // ---- internals --------------------------------------------------------------------------

  private requireCourt(courtId: string): CourtLiveState {
    const court = this.courts.get(courtId);
    if (!court) throw new NotFoundError('Court', courtId);
    return court;
  }

  private bumpSession(sessionId: string): void {
    this.sessionVersions.set(sessionId, (this.sessionVersions.get(sessionId) ?? 0) + 1);
    const state = this.sessionState(sessionId);
    if (state) this.events.emit('session', state);
  }

  private emitClock(clock: ClockState): void {
    this.events.emit('clock', clock);
  }

  private async updateCourt(
    courtId: string,
    mutate: (c: CourtLiveState) => CourtLiveState,
  ): Promise<CourtLiveState> {
    const court = this.requireCourt(courtId);
    const next = { ...mutate(court), version: court.version + 1 };
    this.courts.set(courtId, next);
    await this.store.saveCourt(next);
    this.events.emit('court', next);
    return next;
  }

  private async loadFixtures(sessionId: string): Promise<LiveFixtureRow[]> {
    return this.deps.db.fixture.findMany({
      where: { sessionId },
      include: liveFixtureInclude,
      orderBy: [{ slotIndex: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private nextFixtureFor(
    fixtures: LiveFixtureRow[],
    courtId: string,
    afterSlot: number,
  ): LiveFixtureRow | null {
    return (
      fixtures
        .filter(
          (f) =>
            f.courtId === courtId &&
            f.status === 'SCHEDULED' &&
            f.slotIndex !== null &&
            f.slotIndex > afterSlot,
        )
        .sort((a, b) => (a.slotIndex as number) - (b.slotIndex as number))[0] ?? null
    );
  }

  private async clockForFormat(sessionId: string, formatId: string): Promise<ClockState> {
    const existing = [...this.clocks.values()].find(
      (c) => c.sessionId === sessionId && c.formatId === formatId,
    );
    if (existing) return existing;
    const format = this.formats.get(formatId);
    if (!format) throw new NotFoundError('Format', formatId);
    const clock = createClockState(
      { id: randomUUID(), sessionId, formatId, label: format.name, mode: 'SINGLE' },
      durationsOf(format),
    );
    this.clocks.set(clock.id, clock);
    await this.store.saveClock(clock);
    this.emitClock(clock);
    this.bumpSession(sessionId);
    return clock;
  }

  private buildContext(clock: ClockState, fixtures: LiveFixtureRow[]): ClockContext {
    const format = clock.formatId ? this.formats.get(clock.formatId) : undefined;
    const durations = format
      ? durationsOf(format)
      : { halfMs: clock.phaseDurationMs, halfTimeMs: 0, betweenGamesMs: 0 };
    const linked = clock.linkedClockId ? this.clocks.get(clock.linkedClockId) : undefined;
    return {
      durations,
      hasFixturesForSlot: (slot) =>
        fixtures.some(
          (f) =>
            f.slotIndex === slot &&
            f.courtId !== null &&
            ACTIVE_FIXTURE.has(f.status) &&
            fixtureFormatId(f) === clock.formatId,
        ),
      linked: linked
        ? {
            phase: linked.phase,
            status: linked.status,
            phaseStartedAtMs: linked.phaseStartedAtMs,
            phaseDurationMs: linked.phaseDurationMs,
          }
        : null,
    };
  }

  private async applyClockEvent(clockId: string, event: ClockEvent): Promise<ClockState> {
    const clock = this.clocks.get(clockId);
    if (!clock) throw new NotFoundError('Clock', clockId);
    const fixtures = await this.loadFixtures(clock.sessionId);
    const result = clockReducer(clock, event, this.buildContext(clock, fixtures));
    if (!result.ok) throw new RuleViolationError(result.message, { code: result.code });
    await this.commitClock(result.state, result.effects, fixtures, event.nowMs);
    return this.clocks.get(clockId) as ClockState;
  }

  /** Persists a clock transition, performs its effects in order, re-arms timers, notifies dependants. */
  private async commitClock(
    state: ClockState,
    effects: ClockEffect[],
    fixtures: LiveFixtureRow[],
    atMs: number,
  ): Promise<void> {
    this.clocks.set(state.id, state);
    await this.store.saveClock(state);
    this.emitClock(state);
    for (const effect of effects) {
      switch (effect.type) {
        case 'PHASE_CHANGED':
          break;
        case 'GAME_STARTED':
          await this.markGamesLive(state);
          break;
        case 'GAME_ENDED':
          await this.finaliseGames(state);
          break;
        case 'SLOT_ADVANCED':
          fixtures = await this.loadFixtures(state.sessionId);
          await this.assignSlot(state, effect.slotIndex, fixtures);
          break;
        case 'ENTERED_BETWEEN_GAMES':
          for (const dep of this.dependantsWaitingOn(state.id)) {
            await this.applyClockEvent(dep.id, {
              type: 'LINKED_ENTERED_BETWEEN_GAMES',
              nowMs: atMs,
              phaseStartedAtMs: effect.phaseStartedAtMs,
              phaseDurationMs: effect.phaseDurationMs,
            });
          }
          break;
        case 'BECAME_UNAVAILABLE':
          for (const dep of this.dependantsWaitingOn(state.id)) {
            await this.applyClockEvent(dep.id, {
              type: 'LINKED_UNAVAILABLE',
              nowMs: this.deps.now(),
            });
          }
          break;
      }
    }
    this.armClock(this.clocks.get(state.id) as ClockState);
    this.bumpSession(state.sessionId);
  }

  private dependantsWaitingOn(clockId: string): ClockState[] {
    return [...this.clocks.values()].filter(
      (c) => c.linkedClockId === clockId && c.phase === 'WAITING_FOR_LINKED',
    );
  }

  private courtsOnClock(clock: ClockState): CourtLiveState[] {
    return [...this.courts.values()].filter(
      (c) => c.clockId === clock.id && c.sessionId === clock.sessionId,
    );
  }

  private async markGamesLive(clock: ClockState): Promise<void> {
    for (const court of this.courtsOnClock(clock)) {
      if (court.current && court.current.status === 'SCHEDULED' && court.currentFixtureId) {
        await this.deps.db.fixture.update({
          where: { id: court.currentFixtureId },
          data: { status: 'LIVE' },
        });
        await this.updateCourt(court.courtId, (c) => ({
          ...c,
          current: c.current ? { ...c.current, status: 'LIVE' } : null,
        }));
      }
    }
  }

  private async finaliseGames(clock: ClockState): Promise<void> {
    for (const court of this.courtsOnClock(clock)) {
      if (court.current?.status === 'LIVE' && court.currentFixtureId) {
        await this.deps.fixtures.finalise(this.deps.db, court.currentFixtureId, {
          homeScore: court.homeScore,
          awayScore: court.awayScore,
        });
        this.clearTimer(`timeout:${court.courtId}`);
        await this.updateCourt(court.courtId, (c) => ({
          ...c,
          current: c.current ? { ...c.current, status: 'COMPLETED' } : null,
          timeout: INACTIVE_TIMEOUT,
        }));
      }
    }
  }

  /** Gives every court its fixture for `slotIndex` on this clock's format (or clears it). */
  private async assignSlot(
    clock: ClockState,
    slotIndex: number,
    fixtures: LiveFixtureRow[],
  ): Promise<void> {
    const session = this.sessions.get(clock.sessionId);
    if (!session) return;
    for (const court of this.courts.values()) {
      if (court.sessionId !== clock.sessionId) continue;
      const fixture = fixtures.find(
        (f) =>
          f.courtId === court.courtId &&
          f.slotIndex === slotIndex &&
          ACTIVE_FIXTURE.has(f.status) &&
          fixtureFormatId(f) === clock.formatId,
      );
      if (fixture) {
        const next = this.nextFixtureFor(fixtures, court.courtId, slotIndex);
        await this.updateCourt(court.courtId, (c) => ({
          ...c,
          clockId: clock.id,
          currentFixtureId: fixture.id,
          current: toDisplay(fixture, session, this.timezone),
          nextFixtureId: next?.id ?? null,
          next: next ? toDisplay(next, session, this.timezone) : null,
          homeScore: fixture.homeScore,
          awayScore: fixture.awayScore,
          timeout: INACTIVE_TIMEOUT,
        }));
      } else if (court.clockId === clock.id) {
        const next = this.nextFixtureFor(fixtures, court.courtId, slotIndex - 1);
        await this.updateCourt(court.courtId, (c) => ({
          ...c,
          currentFixtureId: null,
          current: null,
          nextFixtureId: next?.id ?? null,
          next: next ? toDisplay(next, session, this.timezone) : null,
          homeScore: 0,
          awayScore: 0,
          timeout: INACTIVE_TIMEOUT,
        }));
      }
    }
  }

  /** After a restart: rebuild fixture displays for persisted current/next ids. */
  private async rebuildDisplays(): Promise<void> {
    for (const court of this.courts.values()) {
      if (!court.sessionId) continue;
      const session = this.sessions.get(court.sessionId);
      if (!session) {
        this.courts.set(court.courtId, {
          ...court,
          sessionId: null,
          clockId: null,
          currentFixtureId: null,
          nextFixtureId: null,
          current: null,
          next: null,
        });
        continue;
      }
      const ids = [court.currentFixtureId, court.nextFixtureId].filter(
        (x): x is string => x !== null,
      );
      const rows = ids.length
        ? await this.deps.db.fixture.findMany({
            where: { id: { in: ids } },
            include: liveFixtureInclude,
          })
        : [];
      const current = rows.find((r) => r.id === court.currentFixtureId);
      const next = rows.find((r) => r.id === court.nextFixtureId);
      this.courts.set(court.courtId, {
        ...court,
        current: current ? toDisplay(current, session, this.timezone) : null,
        next: next ? toDisplay(next, session, this.timezone) : null,
      });
    }
  }

  /**
   * Replays every missed expiry in chronological order across all clocks, so a linked clock
   * sees the other clock exactly as it was at each moment (a discrete-event replay).
   */
  private async fastForwardAll(): Promise<void> {
    const now = this.deps.now();
    let replayed = 0;
    for (let i = 0; i < 10_000; i++) {
      let earliest: { clock: ClockState; endsAt: number } | null = null;
      for (const clock of this.clocks.values()) {
        const endsAt = phaseEndsAtMs(clock);
        if (endsAt !== null && endsAt <= now && (!earliest || endsAt < earliest.endsAt))
          earliest = { clock, endsAt };
      }
      if (!earliest) break;
      await this.applyClockEvent(earliest.clock.id, { type: 'EXPIRE', nowMs: earliest.endsAt });
      replayed += 1;
    }
    for (const clock of [...this.clocks.values()]) {
      if (
        clock.phase === 'WAITING_FOR_LINKED' &&
        (!clock.linkedClockId || !this.clocks.has(clock.linkedClockId))
      ) {
        await this.applyClockEvent(clock.id, { type: 'LINKED_UNAVAILABLE', nowMs: now });
      }
    }
    if (replayed > 0) this.deps.log.info({ replayed }, 'fast-forwarded clocks after restart');
  }

  // ---- scheduler -----------------------------------------------------------------------------

  private clearTimer(key: string): void {
    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
  }

  private armClock(clock: ClockState): void {
    this.clearTimer(clock.id);
    const endsAt = phaseEndsAtMs(clock);
    if (endsAt === null) return;
    const delay = Math.max(0, endsAt - this.deps.now());
    const timer = setTimeout(() => void this.run(() => this.expireClock(clock.id)), delay);
    timer.unref?.();
    this.timers.set(clock.id, timer);
  }

  private async expireClock(clockId: string): Promise<void> {
    const clock = this.clocks.get(clockId);
    if (!clock) return;
    const endsAt = phaseEndsAtMs(clock);
    if (endsAt === null) return;
    if (this.deps.now() < endsAt) {
      this.armClock(clock);
      return;
    }
    try {
      await this.applyClockEvent(clockId, { type: 'EXPIRE', nowMs: this.deps.now() });
    } catch (err) {
      this.deps.log.error({ err, clockId }, 'clock expiry failed');
      this.armClock(clock);
    }
  }

  private armTimeout(court: CourtLiveState): void {
    const key = `timeout:${court.courtId}`;
    this.clearTimer(key);
    if (!court.timeout.active || court.timeout.startedAtMs === null) return;
    const delay = Math.max(
      0,
      court.timeout.startedAtMs + court.timeout.durationMs - this.deps.now(),
    );
    const timer = setTimeout(() => void this.run(() => this.expireTimeout(court.courtId)), delay);
    timer.unref?.();
    this.timers.set(key, timer);
  }

  private async expireTimeout(courtId: string): Promise<void> {
    const court = this.courts.get(courtId);
    if (!court || !court.timeout.active) return;
    if (!isTimeoutExpired(court.timeout, this.deps.now())) {
      this.armTimeout(court);
      return;
    }
    this.clearTimer(`timeout:${courtId}`);
    await this.updateCourt(courtId, (c) => ({ ...c, timeout: endTimeout() }));
  }

  /** One-second safety net: expires anything a lost timer missed. */
  private async sweep(): Promise<void> {
    const now = this.deps.now();
    for (const clock of [...this.clocks.values()]) {
      const endsAt = phaseEndsAtMs(clock);
      if (endsAt !== null && now >= endsAt) await this.expireClock(clock.id);
    }
    for (const court of [...this.courts.values()]) {
      if (court.timeout.active && isTimeoutExpired(court.timeout, now))
        await this.expireTimeout(court.courtId);
    }
  }
}

export type { FixtureDisplay };
