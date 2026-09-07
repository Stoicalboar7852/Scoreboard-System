import { type CourtLiveState, type FixtureDisplay } from '../domain/live.js';

export type IdleView =
  | { kind: 'LIVE' }
  | { kind: 'NEXT_SOON'; next: FixtureDisplay; startsInMs: number | null }
  | { kind: 'NEXT_LATER'; next: FixtureDisplay; startsInMs: number | null }
  | { kind: 'NO_MORE_GAMES' };

/**
 * Decides what an idle court should show (§7.1): the next fixture in large text when
 * it starts within the highlight window, otherwise the court name large with the next
 * fixture small, or "No more games tonight".
 */
export function describeIdle(
  court: Pick<CourtLiveState, 'current' | 'next'>,
  nowMs: number,
  windowMs: number,
): IdleView {
  if (court.current && court.current.status === 'LIVE') return { kind: 'LIVE' };
  const next =
    court.next ?? (court.current && court.current.status === 'SCHEDULED' ? court.current : null);
  if (!next) return { kind: 'NO_MORE_GAMES' };
  const startsInMs = next.scheduledStartMs === null ? null : next.scheduledStartMs - nowMs;
  if (startsInMs === null || startsInMs <= windowMs) return { kind: 'NEXT_SOON', next, startsInMs };
  return { kind: 'NEXT_LATER', next, startsInMs };
}
