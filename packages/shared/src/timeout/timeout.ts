import { type ClockPhase, type ClockStatus, type TeamSide } from '../domain/enums.js';
import { INACTIVE_TIMEOUT, type TimeoutState } from '../domain/live.js';

/** Time outs may only be called while a half is actually running (decision 6). */
export function canCallTimeout(clock: { status: ClockStatus; phase: ClockPhase } | null): boolean {
  if (!clock) return false;
  return clock.status === 'RUNNING' && (clock.phase === 'HALF_1' || clock.phase === 'HALF_2');
}

export function startTimeout(
  nowMs: number,
  durationMs: number,
  calledBy: TeamSide | null,
): TimeoutState {
  if (!(durationMs > 0)) throw new Error('Time-out duration must be positive');
  return { active: true, startedAtMs: nowMs, durationMs, calledBy };
}

export function endTimeout(): TimeoutState {
  return INACTIVE_TIMEOUT;
}

export function timeoutEndsAtMs(state: TimeoutState): number | null {
  if (!state.active || state.startedAtMs === null) return null;
  return state.startedAtMs + state.durationMs;
}

export function timeoutRemainingMs(state: TimeoutState, nowMs: number): number {
  const endsAt = timeoutEndsAtMs(state);
  return endsAt === null ? 0 : Math.max(0, endsAt - nowMs);
}

export function isTimeoutExpired(state: TimeoutState, nowMs: number): boolean {
  const endsAt = timeoutEndsAtMs(state);
  return endsAt !== null && nowMs >= endsAt;
}
