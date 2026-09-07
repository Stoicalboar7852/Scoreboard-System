import { describe, expect, it } from 'vitest';
import { roundRobin } from './roundRobin.js';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `T${i + 1}`);

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

describe('roundRobin', () => {
  it('schedules every pair once across N-1 rounds for an even team count', () => {
    const { pairings, warnings } = roundRobin(ids(6), 5);
    expect(warnings).toEqual([]);
    expect(pairings).toHaveLength(15);
    const seen = new Set(pairings.map((p) => pairKey(p.homeTeamId, p.awayTeamId ?? 'BYE')));
    expect(seen.size).toBe(15);
    for (let round = 1; round <= 5; round++) {
      const teams = pairings
        .filter((p) => p.round === round)
        .flatMap((p) => [p.homeTeamId, p.awayTeamId]);
      expect(new Set(teams).size).toBe(6);
    }
  });

  it('gives each team exactly one bye per cycle for an odd team count', () => {
    const { pairings } = roundRobin(ids(5), 5);
    const byes = pairings.filter((p) => p.awayTeamId === null);
    expect(byes).toHaveLength(5);
    expect(new Set(byes.map((b) => b.homeTeamId)).size).toBe(5);
    for (let round = 1; round <= 5; round++) {
      const inRound = pairings.filter((p) => p.round === round);
      const teams = inRound.flatMap((p) =>
        p.awayTeamId ? [p.homeTeamId, p.awayTeamId] : [p.homeTeamId],
      );
      expect(new Set(teams).size).toBe(5);
      expect(teams).toHaveLength(5);
    }
  });

  it('repeats the cycle with home and away flipped when more rounds are requested', () => {
    const { pairings, warnings } = roundRobin(ids(4), 6);
    expect(warnings).toEqual([]);
    expect(pairings).toHaveLength(12);
    const first = pairings.filter((p) => p.round <= 3);
    const second = pairings.filter((p) => p.round > 3);
    for (const p of first) {
      const flipped = second.find(
        (q) => q.homeTeamId === p.awayTeamId && q.awayTeamId === p.homeTeamId,
      );
      expect(flipped).toBeDefined();
    }
  });

  it('warns when the season is too short for a full round robin', () => {
    const { pairings, warnings } = roundRobin(ids(6), 3);
    expect(pairings).toHaveLength(9);
    expect(warnings[0]).toMatch(/not every pair/i);
  });

  it('balances home and away counts across a full cycle', () => {
    const { pairings } = roundRobin(ids(8), 7);
    const home = new Map<string, number>();
    for (const p of pairings) home.set(p.homeTeamId, (home.get(p.homeTeamId) ?? 0) + 1);
    for (const count of home.values()) expect(Math.abs(count - 3.5)).toBeLessThanOrEqual(0.5);
  });

  it('handles degenerate inputs', () => {
    expect(roundRobin([], 3).pairings).toEqual([]);
    expect(roundRobin(['A'], 2).pairings).toEqual([
      { round: 1, homeTeamId: 'A', awayTeamId: null },
      { round: 2, homeTeamId: 'A', awayTeamId: null },
    ]);
    expect(roundRobin(ids(2), 2).pairings.map((p) => [p.homeTeamId, p.awayTeamId])).toEqual([
      ['T1', 'T2'],
      ['T2', 'T1'],
    ]);
  });
});
