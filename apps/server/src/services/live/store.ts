import { type PrismaClient } from '@prisma/client';
import { INACTIVE_TIMEOUT, type ClockState, type CourtLiveState } from '@scoreboard/shared';
import { fromMs, toMs } from '../../lib/time.js';

/**
 * Persists live clock and court state on every change so a restart can resume the night.
 * Denormalised fixture display data is rebuilt from the fixture tables on load.
 */
export class LiveStore {
  constructor(private readonly db: PrismaClient) {}

  async saveClock(state: ClockState): Promise<void> {
    const data = {
      sessionId: state.sessionId,
      formatId: state.formatId,
      label: state.label,
      mode: state.mode,
      status: state.status,
      phase: state.phase,
      phaseDurationMs: state.phaseDurationMs,
      phaseStartedAt: fromMs(state.phaseStartedAtMs),
      remainingAtPauseMs: state.remainingAtPauseMs,
      linkedClockId: state.linkedClockId,
      slotIndex: state.slotIndex,
      version: state.version,
    };
    await this.db.clock.upsert({
      where: { id: state.id },
      create: { id: state.id, ...data },
      update: data,
    });
  }

  async deleteClock(clockId: string): Promise<void> {
    await this.db.clock.deleteMany({ where: { id: clockId } });
  }

  async saveCourt(state: CourtLiveState): Promise<void> {
    const data = {
      sessionId: state.sessionId,
      clockId: state.clockId,
      currentFixtureId: state.currentFixtureId,
      nextFixtureId: state.nextFixtureId,
      homeScore: state.homeScore,
      awayScore: state.awayScore,
      timeoutActive: state.timeout.active,
      timeoutStartedAt: fromMs(state.timeout.startedAtMs),
      timeoutDurationMs: state.timeout.durationMs,
      timeoutCalledBy: state.timeout.calledBy,
      lastControllerSeen: fromMs(state.lastControllerSeenMs),
      lastScoreboardSeen: fromMs(state.lastScoreboardSeenMs),
      version: state.version,
    };
    await this.db.courtLiveState.upsert({
      where: { courtId: state.courtId },
      create: { courtId: state.courtId, ...data },
      update: data,
    });
  }

  async loadClocks(): Promise<ClockState[]> {
    const rows = await this.db.clock.findMany({ where: { session: { status: 'LIVE' } } });
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      formatId: r.formatId,
      label: r.label,
      mode: r.mode,
      status: r.status,
      phase: r.phase,
      phaseDurationMs: r.phaseDurationMs,
      phaseStartedAtMs: toMs(r.phaseStartedAt),
      remainingAtPauseMs: r.remainingAtPauseMs,
      linkedClockId: r.linkedClockId,
      slotIndex: r.slotIndex,
      version: r.version,
    }));
  }

  /** Raw persisted court rows; the live service fills in fixture displays. */
  async loadCourts(): Promise<Array<Omit<CourtLiveState, 'current' | 'next' | 'courtName'>>> {
    const rows = await this.db.courtLiveState.findMany();
    return rows.map((r) => ({
      courtId: r.courtId,
      sessionId: r.sessionId,
      clockId: r.clockId,
      currentFixtureId: r.currentFixtureId,
      nextFixtureId: r.nextFixtureId,
      homeScore: r.homeScore,
      awayScore: r.awayScore,
      timeout: r.timeoutActive
        ? {
            active: true,
            startedAtMs: toMs(r.timeoutStartedAt),
            durationMs: r.timeoutDurationMs,
            calledBy: r.timeoutCalledBy,
          }
        : INACTIVE_TIMEOUT,
      lastControllerSeenMs: toMs(r.lastControllerSeen),
      lastScoreboardSeenMs: toMs(r.lastScoreboardSeen),
      version: r.version,
    }));
  }
}
