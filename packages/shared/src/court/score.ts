import { type FixtureStatus, type TeamSide } from '../domain/enums.js';

export interface Scores {
  homeScore: number;
  awayScore: number;
}

/** Applies a score intent. Scores never drop below zero. */
export function applyScoreDelta(scores: Scores, team: TeamSide, delta: number): Scores {
  if (!Number.isInteger(delta)) throw new Error('Score delta must be an integer');
  if (team === 'HOME') return { ...scores, homeScore: Math.max(0, scores.homeScore + delta) };
  return { ...scores, awayScore: Math.max(0, scores.awayScore + delta) };
}

/** Scoring is only accepted while the court's current fixture is live. */
export function canScore(court: { current: { status: FixtureStatus } | null }): boolean {
  return court.current?.status === 'LIVE';
}

export type GameResult = 'HOME' | 'AWAY' | 'DRAW';

export function resultFromScores(homeScore: number, awayScore: number): GameResult {
  if (homeScore > awayScore) return 'HOME';
  if (awayScore > homeScore) return 'AWAY';
  return 'DRAW';
}
