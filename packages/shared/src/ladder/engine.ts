import { type FixtureStage, type FixtureStatus, type TeamSide } from '../domain/enums.js';
import { type LadderRule, type LadderTiebreaker } from './rule.js';

export interface LadderTeamInput {
  id: string;
  name: string;
}

export interface LadderFixtureInput {
  id: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number;
  awayScore: number;
  status: FixtureStatus;
  stage: FixtureStage;
  forfeitBy: TeamSide | null;
}

export interface LadderAdjustmentInput {
  teamId: string;
  pointsDelta: number;
}

export interface LadderRow {
  teamId: string;
  teamName: string;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  byes: number;
  forfeits: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDiff: number;
  /** pointsFor / pointsAgainst × 100, finite even when nothing has been conceded. */
  percentage: number;
  bonusPoints: number;
  adjustments: number;
  /** Points from results only (win/draw/loss/bye/forfeit), excluding bonus and adjustments. */
  resultPoints: number;
  ladderPoints: number;
}

export interface ComputeLadderInput {
  teams: LadderTeamInput[];
  fixtures: LadderFixtureInput[];
  rule: LadderRule;
  adjustments: LadderAdjustmentInput[];
}

type MutableRow = Omit<LadderRow, 'position' | 'percentage' | 'pointsDiff' | 'ladderPoints'>;

function emptyRow(team: LadderTeamInput): MutableRow {
  return {
    teamId: team.id,
    teamName: team.name,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    byes: 0,
    forfeits: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    bonusPoints: 0,
    adjustments: 0,
    resultPoints: 0,
  };
}

function bonusFor(rule: LadderRule, score: number): number {
  if (!rule.bonus) return 0;
  const raw = Math.floor(score / rule.bonus.perScorePoints) * rule.bonus.points;
  return rule.bonus.cap === null ? raw : Math.min(raw, rule.bonus.cap);
}

function percentage(pointsFor: number, pointsAgainst: number): number {
  if (pointsAgainst === 0) return pointsFor === 0 ? 0 : pointsFor * 100;
  return Math.round((pointsFor / pointsAgainst) * 10000) / 100;
}

/** Counts a regular-season result that involves only known teams. */
function applyFixture(
  rows: Map<string, MutableRow>,
  rule: LadderRule,
  f: LadderFixtureInput,
): void {
  if (f.stage !== 'REGULAR') return;
  if (f.status === 'BYE') {
    const team = f.homeTeamId ? rows.get(f.homeTeamId) : undefined;
    if (team) {
      team.byes += 1;
      team.resultPoints += rule.bye;
    }
    return;
  }
  if (f.status !== 'COMPLETED' && f.status !== 'FORFEIT') return;
  const home = f.homeTeamId ? rows.get(f.homeTeamId) : undefined;
  const away = f.awayTeamId ? rows.get(f.awayTeamId) : undefined;
  if (!home || !away) return;

  home.played += 1;
  away.played += 1;
  home.pointsFor += f.homeScore;
  home.pointsAgainst += f.awayScore;
  away.pointsFor += f.awayScore;
  away.pointsAgainst += f.homeScore;

  if (f.status === 'FORFEIT') {
    const [winner, loser] = f.forfeitBy === 'HOME' ? [away, home] : [home, away];
    winner.won += 1;
    winner.resultPoints += rule.forfeitWin;
    loser.lost += 1;
    loser.forfeits += 1;
    loser.resultPoints += rule.forfeitLoss;
    return;
  }

  if (f.homeScore > f.awayScore) {
    home.won += 1;
    home.resultPoints += rule.win;
    away.lost += 1;
    away.resultPoints += rule.loss;
  } else if (f.awayScore > f.homeScore) {
    away.won += 1;
    away.resultPoints += rule.win;
    home.lost += 1;
    home.resultPoints += rule.loss;
  } else {
    home.drawn += 1;
    away.drawn += 1;
    home.resultPoints += rule.draw;
    away.resultPoints += rule.draw;
  }
  home.bonusPoints += bonusFor(rule, f.homeScore);
  away.bonusPoints += bonusFor(rule, f.awayScore);
}

type Unranked = Omit<LadderRow, 'position'>;

function finalise(row: MutableRow): Unranked {
  return {
    ...row,
    pointsDiff: row.pointsFor - row.pointsAgainst,
    percentage: percentage(row.pointsFor, row.pointsAgainst),
    ladderPoints: row.resultPoints + row.bonusPoints + row.adjustments,
  };
}

/** Head-to-head: ladder points earned in games between the two teams only. */
function headToHead(
  a: Unranked,
  b: Unranked,
  fixtures: LadderFixtureInput[],
  rule: LadderRule,
): number {
  const mini = computeLadderRows(
    [
      { id: a.teamId, name: a.teamName },
      { id: b.teamId, name: b.teamName },
    ],
    fixtures.filter(
      (f) =>
        (f.homeTeamId === a.teamId && f.awayTeamId === b.teamId) ||
        (f.homeTeamId === b.teamId && f.awayTeamId === a.teamId),
    ),
    rule,
    [],
  );
  const pa = mini.find((r) => r.teamId === a.teamId)?.ladderPoints ?? 0;
  const pb = mini.find((r) => r.teamId === b.teamId)?.ladderPoints ?? 0;
  return pb - pa;
}

function compareBy(
  key: LadderTiebreaker,
  a: Unranked,
  b: Unranked,
  fixtures: LadderFixtureInput[],
  rule: LadderRule,
): number {
  switch (key) {
    case 'LADDER_POINTS':
      return b.ladderPoints - a.ladderPoints;
    case 'WINS':
      return b.won - a.won;
    case 'PERCENTAGE':
      return b.percentage - a.percentage;
    case 'POINTS_DIFF':
      return b.pointsDiff - a.pointsDiff;
    case 'POINTS_FOR':
      return b.pointsFor - a.pointsFor;
    case 'HEAD_TO_HEAD':
      return headToHead(a, b, fixtures, rule);
    case 'NAME':
      return a.teamName.localeCompare(b.teamName);
  }
}

function computeLadderRows(
  teams: LadderTeamInput[],
  fixtures: LadderFixtureInput[],
  rule: LadderRule,
  adjustments: LadderAdjustmentInput[],
): Unranked[] {
  const rows = new Map<string, MutableRow>(teams.map((t) => [t.id, emptyRow(t)]));
  for (const f of fixtures) applyFixture(rows, rule, f);
  for (const adj of adjustments) {
    const row = rows.get(adj.teamId);
    if (row) row.adjustments += adj.pointsDelta;
  }
  return [...rows.values()].map(finalise);
}

/**
 * Computes a ladder. Pure: the same inputs always give the same rows. Positions are
 * unique because NAME is appended as a final tiebreaker if the rule omits it.
 */
export function computeLadder(input: ComputeLadderInput): LadderRow[] {
  const { teams, fixtures, rule, adjustments } = input;
  const unranked = computeLadderRows(teams, fixtures, rule, adjustments);
  const keys: LadderTiebreaker[] = rule.tiebreakers.includes('NAME')
    ? rule.tiebreakers
    : [...rule.tiebreakers, 'NAME'];
  unranked.sort((a, b) => {
    for (const key of keys) {
      const cmp = compareBy(key, a, b, fixtures, rule);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
  return unranked.map((row, index) => ({ ...row, position: index + 1 }));
}
