import { useEffect, useRef } from 'react';
import type { ClockState } from '@scoreboard/shared';
import { playHorn } from '../lib/horn.js';

const GAME_PHASES = new Set(['HALF_1', 'HALF_TIME', 'HALF_2']);

/** Sounds the horn when a half or half time ends (phase leaves HALF_1 / HALF_TIME / HALF_2). */
export function usePhaseHorn(clock: ClockState | null, enabled: boolean): void {
  const previous = useRef<{ id: string; phase: ClockState['phase'] } | null>(null);
  useEffect(() => {
    if (!clock) {
      previous.current = null;
      return;
    }
    const prev = previous.current;
    if (
      enabled &&
      prev &&
      prev.id === clock.id &&
      prev.phase !== clock.phase &&
      GAME_PHASES.has(prev.phase)
    ) {
      playHorn();
    }
    previous.current = { id: clock.id, phase: clock.phase };
  }, [clock, enabled]);
}
