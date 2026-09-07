import { type ClockState, type TimeoutState } from '../domain/live.js';
import { PHASE_PRESENTATION, type ThemeTokenKey } from '../theme/tokens.js';
import { timeoutRemainingMs } from '../timeout/timeout.js';
import { remainingMs } from './reducer.js';

export interface ClockDisplay {
  /** Text above the clock, e.g. "Half 1", "Waiting for Fours", "Time out", "Paused". */
  label: string;
  token: ThemeTokenKey;
  /** Milliseconds to render (0 when nothing is counting). */
  remainingMs: number;
  /** True while a time out replaces the game clock. */
  timeout: boolean;
  /** True when the displayed time comes from the linked clock. */
  fromLinked: boolean;
  paused: boolean;
}

/**
 * Derives what controller and scoreboard show for a court (§7.1 phase labels, §6.4
 * time outs). Pure so both surfaces and their tests share one source of truth.
 */
export function describeClock(
  clock: ClockState | null,
  linked: ClockState | null,
  timeout: TimeoutState,
  nowMs: number,
): ClockDisplay {
  if (timeout.active) {
    return {
      label: 'Time out',
      token: 'phaseTimeout',
      remainingMs: timeoutRemainingMs(timeout, nowMs),
      timeout: true,
      fromLinked: false,
      paused: false,
    };
  }
  if (!clock) {
    return {
      label: '',
      token: 'phasePreGame',
      remainingMs: 0,
      timeout: false,
      fromLinked: false,
      paused: false,
    };
  }
  if (clock.phase === 'WAITING_FOR_LINKED') {
    return {
      label: linked ? `Waiting for ${linked.label}` : 'Waiting',
      token: 'phaseWaiting',
      remainingMs: linked ? remainingMs(linked, nowMs) : 0,
      timeout: false,
      fromLinked: linked !== null,
      paused: linked?.status === 'PAUSED',
    };
  }
  const presentation = PHASE_PRESENTATION[clock.phase];
  if (clock.status === 'PAUSED') {
    return {
      label: 'Paused',
      token: 'phasePaused',
      remainingMs: remainingMs(clock, nowMs),
      timeout: false,
      fromLinked: false,
      paused: true,
    };
  }
  return {
    label: presentation.label,
    token: presentation.token,
    remainingMs: clock.phase === 'FINISHED' ? 0 : remainingMs(clock, nowMs),
    timeout: false,
    fromLinked: false,
    paused: false,
  };
}
