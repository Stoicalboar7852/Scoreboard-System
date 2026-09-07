import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClockState } from '@scoreboard/shared';

vi.mock('../lib/horn.js', () => ({ playHorn: vi.fn(), unlockAudio: vi.fn() }));
import { playHorn } from '../lib/horn.js';
import { usePhaseHorn } from './usePhaseHorn.js';

const clock = (phase: ClockState['phase'], id = 'c1'): ClockState => ({
  id,
  sessionId: 's',
  formatId: 'f',
  label: 'Fours',
  mode: 'AUTO',
  status: 'RUNNING',
  phase,
  phaseDurationMs: 1000,
  phaseStartedAtMs: 0,
  remainingAtPauseMs: null,
  linkedClockId: null,
  slotIndex: 0,
  version: 1,
});

describe('usePhaseHorn', () => {
  it('sounds when a half ends and stays silent otherwise', () => {
    const { rerender } = renderHook(({ c, on }) => usePhaseHorn(c, on), {
      initialProps: { c: clock('HALF_1'), on: true },
    });
    expect(playHorn).not.toHaveBeenCalled();
    rerender({ c: clock('HALF_TIME'), on: true });
    expect(playHorn).toHaveBeenCalledTimes(1);
    rerender({ c: clock('HALF_2'), on: true });
    expect(playHorn).toHaveBeenCalledTimes(2);
    rerender({ c: clock('BETWEEN_GAMES'), on: true });
    expect(playHorn).toHaveBeenCalledTimes(3);
    rerender({ c: clock('HALF_1'), on: true });
    expect(playHorn).toHaveBeenCalledTimes(3);
    rerender({ c: clock('HALF_TIME'), on: false });
    expect(playHorn).toHaveBeenCalledTimes(3);
    rerender({ c: clock('HALF_1', 'other'), on: true });
    expect(playHorn).toHaveBeenCalledTimes(3);
  });
});
