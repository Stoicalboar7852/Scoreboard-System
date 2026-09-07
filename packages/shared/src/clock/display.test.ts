import { describe, expect, it } from 'vitest';
import { describeClock } from './display.js';
import { createClockState } from './reducer.js';
import { INACTIVE_TIMEOUT, type ClockState } from '../domain/live.js';

const T0 = 1_700_000_000_000;
const D = { halfMs: 1_200_000, halfTimeMs: 60_000, betweenGamesMs: 60_000 };
const base = createClockState(
  {
    id: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
    formatId: null,
    label: 'Pairs',
    mode: 'AUTO',
  },
  D,
);
const running = (overrides: Partial<ClockState>): ClockState => ({
  ...base,
  status: 'RUNNING',
  phase: 'HALF_1',
  phaseStartedAtMs: T0,
  phaseDurationMs: D.halfMs,
  ...overrides,
});

describe('describeClock', () => {
  it('shows the phase label and remaining time while running', () => {
    expect(describeClock(running({}), null, INACTIVE_TIMEOUT, T0 + 60_000)).toMatchObject({
      label: 'Half 1',
      token: 'phaseHalf1',
      remainingMs: D.halfMs - 60_000,
      timeout: false,
      paused: false,
    });
    expect(describeClock(running({ phase: 'HALF_TIME' }), null, INACTIVE_TIMEOUT, T0).label).toBe(
      'Half time',
    );
    expect(describeClock(running({ phase: 'HALF_2' }), null, INACTIVE_TIMEOUT, T0).token).toBe(
      'phaseHalf2',
    );
    expect(
      describeClock(running({ phase: 'BETWEEN_GAMES' }), null, INACTIVE_TIMEOUT, T0).label,
    ).toBe('Next game in');
  });
  it('shows a time out instead of the clock', () => {
    const view = describeClock(
      running({}),
      null,
      { active: true, startedAtMs: T0, durationMs: 60_000, calledBy: 'HOME' },
      T0 + 10_000,
    );
    expect(view).toMatchObject({
      label: 'Time out',
      token: 'phaseTimeout',
      remainingMs: 50_000,
      timeout: true,
    });
  });
  it('shows Paused in amber', () => {
    const view = describeClock(
      running({ status: 'PAUSED', remainingAtPauseMs: 5000 }),
      null,
      INACTIVE_TIMEOUT,
      T0,
    );
    expect(view).toMatchObject({
      label: 'Paused',
      token: 'phasePaused',
      remainingMs: 5000,
      paused: true,
    });
  });
  it('shows the linked clock while waiting', () => {
    const waiting = running({ phase: 'WAITING_FOR_LINKED', status: 'IDLE', phaseDurationMs: 0 });
    const fours = running({ label: 'Fours', phase: 'HALF_2' });
    expect(describeClock(waiting, fours, INACTIVE_TIMEOUT, T0 + 100_000)).toMatchObject({
      label: 'Waiting for Fours',
      remainingMs: D.halfMs - 100_000,
      fromLinked: true,
    });
    expect(describeClock(waiting, null, INACTIVE_TIMEOUT, T0)).toMatchObject({
      label: 'Waiting',
      remainingMs: 0,
      fromLinked: false,
    });
  });
  it('shows Final with no time, and nothing without a clock', () => {
    expect(describeClock({ ...base, phase: 'FINISHED' }, null, INACTIVE_TIMEOUT, T0)).toMatchObject(
      { label: 'Final', remainingMs: 0 },
    );
    expect(describeClock(null, null, INACTIVE_TIMEOUT, T0)).toMatchObject({
      label: '',
      remainingMs: 0,
    });
    expect(describeClock(base, null, INACTIVE_TIMEOUT, T0)).toMatchObject({
      label: 'Starting soon',
      remainingMs: D.halfMs,
    });
  });
});
