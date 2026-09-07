import { describe, expect, it } from 'vitest';
import { computeLadder, type LadderFixtureInput, type LadderTeamInput } from './engine.js';
import { VENUE_POINTS_RULE, WINS_FOR_AGAINST_RULE, type LadderRule } from './rule.js';

const teams: LadderTeamInput[] = [
  { id: 'A', name: 'Aces' },
  { id: 'B', name: 'Blockers' },
  { id: 'C', name: 'Crushers' },
  { id: 'D', name: 'Diggers' },
];

let seq = 0;
function fx(
  partial: Partial<LadderFixtureInput> & Pick<LadderFixtureInput, 'homeTeamId'>,
): LadderFixtureInput {
  seq += 1;
  return {
    id: `f${seq}`,
    awayTeamId: null,
    homeScore: 0,
    awayScore: 0,
    status: 'COMPLETED',
    stage: 'REGULAR',
    forfeitBy: null,
    ...partial,
  };
}

const row = (rows: ReturnType<typeof computeLadder>, id: string) => {
  const found = rows.find((r) => r.teamId === id);
  if (!found) throw new Error(`no row for ${id}`);
  return found;
};

describe('venue points system', () => {
  it('scores the brief example: a win with 40 points earns 10 ladder points', () => {
    const rows = computeLadder({
      teams,
      fixtures: [fx({ homeTeamId: 'A', awayTeamId: 'B', homeScore: 40, awayScore: 30 })],
      rule: VENUE_POINTS_RULE,
      adjustments: [],
    });
    const a = row(rows, 'A');
    expect(a).toMatchObject({
      played: 1,
      won: 1,
      drawn: 0,
      lost: 0,
      pointsFor: 40,
      pointsAgainst: 30,
      pointsDiff: 10,
      bonusPoints: 4,
      resultPoints: 6,
      ladderPoints: 10,
      position: 1,
    });
    const b = row(rows, 'B');
    expect(b).toMatchObject({
      played: 1,
      lost: 1,
      bonusPoints: 3,
      resultPoints: 2,
      ladderPoints: 5,
      position: 2,
    });
    expect(a.percentage).toBeCloseTo(133.33, 2);
  });

  it('awards draw points to both teams', () => {
    const rows = computeLadder({
      teams,
      fixtures: [fx({ homeTeamId: 'A', awayTeamId: 'B', homeScore: 20, awayScore: 20 })],
      rule: VENUE_POINTS_RULE,
      adjustments: [],
    });
    expect(row(rows, 'A')).toMatchObject({ drawn: 1, ladderPoints: 6 });
    expect(row(rows, 'B')).toMatchObject({ drawn: 1, ladderPoints: 6 });
  });

  it('gives bye points with no bonus and does not count a bye as played', () => {
    const rows = computeLadder({
      teams,
      fixtures: [fx({ homeTeamId: 'C', status: 'BYE' })],
      rule: VENUE_POINTS_RULE,
      adjustments: [],
    });
    expect(row(rows, 'C')).toMatchObject({ byes: 1, played: 0, ladderPoints: 6, bonusPoints: 0 });
  });

  it('handles forfeits: the forfeiting side gets forfeit-loss points and a forfeit count', () => {
    const rows = computeLadder({
      teams,
      fixtures: [
        fx({
          homeTeamId: 'A',
          awayTeamId: 'B',
          status: 'FORFEIT',
          forfeitBy: 'AWAY',
          homeScore: 20,
          awayScore: 0,
        }),
      ],
      rule: VENUE_POINTS_RULE,
      adjustments: [],
    });
    expect(row(rows, 'A')).toMatchObject({
      won: 1,
      played: 1,
      ladderPoints: 6,
      bonusPoints: 0,
      pointsFor: 20,
    });
    expect(row(rows, 'B')).toMatchObject({
      lost: 1,
      forfeits: 1,
      ladderPoints: 0,
      pointsAgainst: 20,
    });
  });

  it('caps bonus points when the rule has a cap', () => {
    const capped: LadderRule = {
      ...VENUE_POINTS_RULE,
      bonus: { perScorePoints: 10, points: 1, cap: 3 },
    };
    const rows = computeLadder({
      teams,
      fixtures: [fx({ homeTeamId: 'A', awayTeamId: 'B', homeScore: 55, awayScore: 9 })],
      rule: capped,
      adjustments: [],
    });
    expect(row(rows, 'A').bonusPoints).toBe(3);
    expect(row(rows, 'B').bonusPoints).toBe(0);
  });

  it('applies manual adjustments', () => {
    const rows = computeLadder({
      teams,
      fixtures: [fx({ homeTeamId: 'A', awayTeamId: 'B', homeScore: 30, awayScore: 10 })],
      rule: VENUE_POINTS_RULE,
      adjustments: [
        { teamId: 'A', pointsDelta: -4 },
        { teamId: 'A', pointsDelta: -1 },
      ],
    });
    expect(row(rows, 'A')).toMatchObject({ adjustments: -5, ladderPoints: 4 });
    expect(row(rows, 'B')).toMatchObject({ adjustments: 0, ladderPoints: 3 });
  });

  it('ignores finals, unplayed and cancelled fixtures', () => {
    const rows = computeLadder({
      teams,
      fixtures: [
        fx({ homeTeamId: 'A', awayTeamId: 'B', homeScore: 30, awayScore: 10, stage: 'GF' }),
        fx({ homeTeamId: 'A', awayTeamId: 'B', homeScore: 30, awayScore: 10, status: 'SCHEDULED' }),
        fx({ homeTeamId: 'A', awayTeamId: 'B', homeScore: 30, awayScore: 10, status: 'LIVE' }),
        fx({ homeTeamId: 'A', awayTeamId: 'B', homeScore: 30, awayScore: 10, status: 'CANCELLED' }),
      ],
      rule: VENUE_POINTS_RULE,
      adjustments: [],
    });
    expect(rows.every((r) => r.played === 0 && r.ladderPoints === 0)).toBe(true);
  });

  it('lists teams with no games at the bottom in name order with unique positions', () => {
    const rows = computeLadder({
      teams,
      fixtures: [fx({ homeTeamId: 'D', awayTeamId: 'B', homeScore: 30, awayScore: 10 })],
      rule: VENUE_POINTS_RULE,
      adjustments: [],
    });
    expect(rows.map((r) => r.teamId)).toEqual(['D', 'B', 'A', 'C']);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3, 4]);
  });

  it('breaks ties by wins, then points difference, then points for, then name', () => {
    const rows = computeLadder({
      teams,
      fixtures: [
        fx({ homeTeamId: 'A', awayTeamId: 'B', homeScore: 30, awayScore: 20 }),
        fx({ homeTeamId: 'C', awayTeamId: 'D', homeScore: 30, awayScore: 10 }),
      ],
      rule: VENUE_POINTS_RULE,
      adjustments: [],
    });
    expect(rows.map((r) => r.teamId)).toEqual(['C', 'A', 'B', 'D']);
  });

  it('ignores fixtures involving unknown teams', () => {
    const rows = computeLadder({
      teams,
      fixtures: [fx({ homeTeamId: 'A', awayTeamId: 'ZZZ', homeScore: 30, awayScore: 20 })],
      rule: VENUE_POINTS_RULE,
      adjustments: [{ teamId: 'ZZZ', pointsDelta: 5 }],
    });
    expect(row(rows, 'A').played).toBe(0);
    expect(rows).toHaveLength(4);
  });
});

describe('wins / for-and-against system', () => {
  it('uses 2/1/0 with no bonus and ranks by percentage on equal points', () => {
    const rows = computeLadder({
      teams,
      fixtures: [
        fx({ homeTeamId: 'A', awayTeamId: 'B', homeScore: 30, awayScore: 10 }),
        fx({ homeTeamId: 'C', awayTeamId: 'D', homeScore: 20, awayScore: 15 }),
      ],
      rule: WINS_FOR_AGAINST_RULE,
      adjustments: [],
    });
    expect(row(rows, 'A')).toMatchObject({ ladderPoints: 2, bonusPoints: 0 });
    expect(row(rows, 'A').percentage).toBe(300);
    expect(row(rows, 'C').percentage).toBeCloseTo(133.33, 2);
    expect(rows.map((r) => r.teamId)).toEqual(['A', 'C', 'D', 'B']);
  });

  it('gives a finite percentage when nothing has been conceded', () => {
    const rows = computeLadder({
      teams,
      fixtures: [fx({ homeTeamId: 'A', awayTeamId: 'B', homeScore: 25, awayScore: 0 })],
      rule: WINS_FOR_AGAINST_RULE,
      adjustments: [],
    });
    expect(row(rows, 'A').percentage).toBe(2500);
    expect(row(rows, 'C').percentage).toBe(0);
  });
});

describe('head-to-head tiebreaker', () => {
  const h2hRule: LadderRule = {
    ...WINS_FOR_AGAINST_RULE,
    tiebreakers: ['LADDER_POINTS', 'HEAD_TO_HEAD', 'NAME'],
  };
  it('ranks the winner of the game between tied teams higher', () => {
    const rows = computeLadder({
      teams,
      fixtures: [
        fx({ homeTeamId: 'A', awayTeamId: 'B', homeScore: 10, awayScore: 20 }),
        fx({ homeTeamId: 'A', awayTeamId: 'C', homeScore: 30, awayScore: 0 }),
        fx({ homeTeamId: 'B', awayTeamId: 'D', homeScore: 5, awayScore: 6 }),
      ],
      rule: h2hRule,
      adjustments: [],
    });
    expect(rows.map((r) => r.teamId)).toEqual(['B', 'A', 'D', 'C']);
  });
  it('falls back to the next tiebreaker when tied teams have not met', () => {
    const rows = computeLadder({
      teams,
      fixtures: [
        fx({ homeTeamId: 'A', awayTeamId: 'C', homeScore: 30, awayScore: 0 }),
        fx({ homeTeamId: 'B', awayTeamId: 'D', homeScore: 5, awayScore: 0 }),
      ],
      rule: h2hRule,
      adjustments: [],
    });
    expect(rows.map((r) => r.teamId)).toEqual(['A', 'B', 'C', 'D']);
  });
  it('supports every tiebreaker key without throwing', () => {
    const rule: LadderRule = {
      ...VENUE_POINTS_RULE,
      tiebreakers: [
        'LADDER_POINTS',
        'WINS',
        'PERCENTAGE',
        'POINTS_DIFF',
        'POINTS_FOR',
        'HEAD_TO_HEAD',
        'NAME',
      ],
    };
    const rows = computeLadder({
      teams,
      fixtures: [fx({ homeTeamId: 'A', awayTeamId: 'B', homeScore: 30, awayScore: 30 })],
      rule,
      adjustments: [],
    });
    expect(rows.map((r) => r.teamId)).toEqual(['A', 'B', 'C', 'D']);
  });
});
