import { describe, expect, it } from 'vitest';
import {
  canCallTimeout,
  endTimeout,
  isTimeoutExpired,
  startTimeout,
  timeoutEndsAtMs,
  timeoutRemainingMs,
} from './timeout.js';
import { INACTIVE_TIMEOUT } from '../domain/live.js';
import { type ClockPhase, type ClockStatus } from '../domain/enums.js';

const T0 = 1_700_000_000_000;

describe('canCallTimeout', () => {
  const cases: Array<[ClockStatus, ClockPhase, boolean]> = [
    ['RUNNING', 'HALF_1', true],
    ['RUNNING', 'HALF_2', true],
    ['RUNNING', 'HALF_TIME', false],
    ['RUNNING', 'BETWEEN_GAMES', false],
    ['PAUSED', 'HALF_1', false],
    ['IDLE', 'PRE_GAME', false],
    ['IDLE', 'FINISHED', false],
  ];
  it.each(cases)('%s %s → %s', (status, phase, expected) => {
    expect(canCallTimeout({ status, phase })).toBe(expected);
  });
  it('is false without a clock', () => {
    expect(canCallTimeout(null)).toBe(false);
  });
});

describe('time-out lifecycle', () => {
  it('starts, counts down and expires', () => {
    const t = startTimeout(T0, 60_000, 'HOME');
    expect(t).toEqual({ active: true, startedAtMs: T0, durationMs: 60_000, calledBy: 'HOME' });
    expect(timeoutEndsAtMs(t)).toBe(T0 + 60_000);
    expect(timeoutRemainingMs(t, T0 + 15_000)).toBe(45_000);
    expect(timeoutRemainingMs(t, T0 + 90_000)).toBe(0);
    expect(isTimeoutExpired(t, T0 + 59_999)).toBe(false);
    expect(isTimeoutExpired(t, T0 + 60_000)).toBe(true);
  });
  it('supports an anonymous caller and ending early', () => {
    const t = startTimeout(T0, 30_000, null);
    expect(t.calledBy).toBeNull();
    expect(endTimeout()).toEqual(INACTIVE_TIMEOUT);
  });
  it('treats inactive state as having no remaining time', () => {
    expect(timeoutRemainingMs(INACTIVE_TIMEOUT, T0)).toBe(0);
    expect(timeoutEndsAtMs(INACTIVE_TIMEOUT)).toBeNull();
    expect(isTimeoutExpired(INACTIVE_TIMEOUT, T0)).toBe(false);
  });
  it('rejects a non-positive duration', () => {
    expect(() => startTimeout(T0, 0, 'AWAY')).toThrow(/duration/);
  });
});
