import { beforeEach, describe, expect, it } from 'vitest';
import type { ClockState, CourtLiveState } from '@scoreboard/shared';
import { serverNow, useLiveStore } from './liveStore.js';

const clock = (version: number, phase: ClockState['phase'] = 'HALF_1'): ClockState => ({
  id: 'c1',
  sessionId: 's1',
  formatId: 'f1',
  label: 'Fours',
  mode: 'AUTO',
  status: 'RUNNING',
  phase,
  phaseDurationMs: 1000,
  phaseStartedAtMs: 0,
  remainingAtPauseMs: null,
  linkedClockId: null,
  slotIndex: 0,
  version,
});
const court = (version: number, homeScore = 0): CourtLiveState => ({
  courtId: 'k1',
  courtName: 'Court 1',
  sessionId: 's1',
  clockId: 'c1',
  currentFixtureId: null,
  nextFixtureId: null,
  current: null,
  next: null,
  homeScore,
  awayScore: 0,
  timeout: { active: false, startedAtMs: null, durationMs: 0, calledBy: null },
  lastControllerSeenMs: null,
  lastScoreboardSeenMs: null,
  version,
});

describe('liveStore', () => {
  beforeEach(() => {
    useLiveStore.setState({
      clocks: {},
      courts: {},
      session: null,
      offsetMs: 0,
      synced: false,
      status: 'reconnecting',
      faults: [],
    });
  });

  it('applies snapshots and keeps only newer versions afterwards', () => {
    const s = useLiveStore.getState();
    s.applySnapshot({ serverNowMs: 1, session: null, clocks: [clock(3)], courts: [court(2, 5)] });
    expect(useLiveStore.getState().clocks['c1']?.version).toBe(3);
    s.applyClock(clock(2, 'HALF_2'));
    expect(useLiveStore.getState().clocks['c1']?.phase).toBe('HALF_1');
    s.applyClock(clock(4, 'HALF_2'));
    expect(useLiveStore.getState().clocks['c1']?.phase).toBe('HALF_2');
    s.applyCourt(court(1, 9));
    expect(useLiveStore.getState().courts['k1']?.homeScore).toBe(5);
    s.applyCourt(court(2, 6));
    expect(useLiveStore.getState().courts['k1']?.homeScore).toBe(6);
  });

  it('tracks time sync and connection status', () => {
    const s = useLiveStore.getState();
    s.setTime(2500, 120, false);
    expect(useLiveStore.getState().synced).toBe(true);
    expect(serverNow() - Date.now()).toBeGreaterThanOrEqual(2499);
    s.setStatus('offline');
    expect(useLiveStore.getState().status).toBe('offline');
  });

  it('keeps the last five faults', () => {
    const s = useLiveStore.getState();
    for (let i = 0; i < 7; i++) s.reportFault(`f${i}`);
    expect(useLiveStore.getState().faults).toEqual(['f2', 'f3', 'f4', 'f5', 'f6']);
    s.clearFaults();
    expect(useLiveStore.getState().faults).toEqual([]);
  });
});
