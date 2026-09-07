export interface RoundRobinPairing {
  /** 1-based round number. */
  round: number;
  homeTeamId: string;
  /** Null means the home team has a bye this round. */
  awayTeamId: string | null;
}

export interface RoundRobinResult {
  pairings: RoundRobinPairing[];
  warnings: string[];
}

const BYE = null;

/**
 * Circle-method round robin. Odd team counts get a bye per round. When more rounds are
 * requested than one cycle provides, the cycle repeats with home/away flipped; when
 * fewer are requested the schedule is truncated and a warning is returned.
 */
export function roundRobin(teamIds: readonly string[], rounds: number): RoundRobinResult {
  const warnings: string[] = [];
  if (teamIds.length === 0 || rounds <= 0) return { pairings: [], warnings };

  const slots: Array<string | null> = teamIds.slice();
  if (slots.length % 2 === 1) slots.push(BYE);
  const n = slots.length;
  const cycleLength = n - 1;

  if (cycleLength > 0 && rounds < cycleLength) {
    warnings.push(
      `Season has ${rounds} rounds but ${teamIds.length} teams need ${cycleLength} for a full round robin: not every pair of teams will meet.`,
    );
  }

  const pairings: RoundRobinPairing[] = [];
  const rotating = slots.slice();
  for (let round = 1; round <= rounds; round++) {
    const cycle = cycleLength > 0 ? Math.floor((round - 1) / cycleLength) : 0;
    const roundInCycle = cycleLength > 0 ? (round - 1) % cycleLength : 0;
    const flip = cycle % 2 === 1;
    for (let i = 0; i < n / 2; i++) {
      const a = rotating[i] ?? null;
      const b = rotating[n - 1 - i] ?? null;
      if (a === null && b === null) continue;
      if (a === null || b === null) {
        pairings.push({ round, homeTeamId: (a ?? b) as string, awayTeamId: BYE });
        continue;
      }
      // Alternate the fixed team's home/away by round so home counts stay balanced.
      const swap = (i === 0 && roundInCycle % 2 === 1) !== flip;
      pairings.push(
        swap ? { round, homeTeamId: b, awayTeamId: a } : { round, homeTeamId: a, awayTeamId: b },
      );
    }
    if (n > 2) {
      const last = rotating.pop() as string | null;
      rotating.splice(1, 0, last);
    }
  }
  return { pairings, warnings };
}
