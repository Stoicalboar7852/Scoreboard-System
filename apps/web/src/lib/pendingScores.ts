import type { TeamSide } from '@scoreboard/shared';

/** Score intents the server has not acknowledged yet, keyed by actionId. */
export interface PendingTap {
  actionId: string;
  team: TeamSide;
  delta: 1 | -1;
}

export interface PendingState {
  taps: PendingTap[];
}

export const EMPTY_PENDING: PendingState = { taps: [] };

export type PendingAction =
  | { type: 'ADD'; tap: PendingTap }
  | { type: 'ACKED'; actionId: string }
  | { type: 'REJECTED'; actionId: string }
  | { type: 'CLEAR' };

/** Pure reducer for optimistic score display (server score + unacked deltas). */
export function pendingReducer(state: PendingState, action: PendingAction): PendingState {
  switch (action.type) {
    case 'ADD':
      return { taps: [...state.taps, action.tap] };
    case 'ACKED':
    case 'REJECTED':
      return { taps: state.taps.filter((t) => t.actionId !== action.actionId) };
    case 'CLEAR':
      return EMPTY_PENDING;
  }
}

/** Applies unacked taps on top of the server's scores, never below zero. */
export function optimisticScores(
  server: { homeScore: number; awayScore: number },
  pending: PendingState,
): { homeScore: number; awayScore: number } {
  let home = server.homeScore;
  let away = server.awayScore;
  for (const tap of pending.taps) {
    if (tap.team === 'HOME') home = Math.max(0, home + tap.delta);
    else away = Math.max(0, away + tap.delta);
  }
  return { homeScore: home, awayScore: away };
}
