import { type PlaceholderRef } from '../domain/entities.js';
import { type FixtureStatus, type TeamSide } from '../domain/enums.js';
import { type FinalsTemplate } from './template.js';

export interface FinalsSeed {
  seed: number;
  teamId: string;
  teamName: string;
}

export interface FinalsResultInput {
  key: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number;
  awayScore: number;
  status: FixtureStatus;
  forfeitBy: TeamSide | null;
}

export interface ResolvedParticipant {
  teamId: string | null;
  /** Team name when resolved, otherwise the placeholder text ("Winner SF2"). */
  label: string;
}

export interface ResolvedFinalsMatch {
  key: string;
  weekIndex: number;
  weekName: string;
  slotOffset: number;
  homeRef: PlaceholderRef;
  awayRef: PlaceholderRef;
  home: ResolvedParticipant;
  away: ResolvedParticipant;
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function placeholderLabel(ref: PlaceholderRef): string {
  if ('seed' in ref) return ordinal(ref.seed);
  if ('winnerOf' in ref) return `Winner ${ref.winnerOf}`;
  return `Loser ${ref.loserOf}`;
}

/**
 * Decides a finals match. Draws go to the higher seed (decision 8); forfeits go to the
 * other side. Returns null while the match is incomplete or a side is unknown.
 */
export function decideFinal(
  result: FinalsResultInput,
  seeds: readonly FinalsSeed[],
  drawResolution: FinalsTemplate['drawResolution'],
): { winnerId: string; loserId: string } | null {
  const { homeTeamId, awayTeamId } = result;
  if (!homeTeamId || !awayTeamId) return null;
  if (result.status === 'FORFEIT') {
    return result.forfeitBy === 'HOME'
      ? { winnerId: awayTeamId, loserId: homeTeamId }
      : { winnerId: homeTeamId, loserId: awayTeamId };
  }
  if (result.status !== 'COMPLETED') return null;
  if (result.homeScore > result.awayScore) return { winnerId: homeTeamId, loserId: awayTeamId };
  if (result.awayScore > result.homeScore) return { winnerId: awayTeamId, loserId: homeTeamId };
  // Drawn: HIGHER_SEED is the only strategy today; the switch keeps future ones explicit.
  switch (drawResolution) {
    case 'HIGHER_SEED': {
      const seedOf = (id: string) =>
        seeds.find((s) => s.teamId === id)?.seed ?? Number.POSITIVE_INFINITY;
      return seedOf(homeTeamId) <= seedOf(awayTeamId)
        ? { winnerId: homeTeamId, loserId: awayTeamId }
        : { winnerId: awayTeamId, loserId: homeTeamId };
    }
  }
}

/**
 * Expands a finals template into matches, filling in teams from the seeds and from any
 * completed results. Unresolved participants keep a human-readable placeholder label.
 */
export function resolveFinals(
  template: FinalsTemplate,
  seeds: readonly FinalsSeed[],
  results: readonly FinalsResultInput[],
): ResolvedFinalsMatch[] {
  const nameOf = new Map(seeds.map((s) => [s.teamId, s.teamName]));
  const outcomes = new Map<string, { winnerId: string; loserId: string }>();
  for (const r of results) {
    const decided = decideFinal(r, seeds, template.drawResolution);
    if (decided) outcomes.set(r.key, decided);
  }

  const resolve = (ref: PlaceholderRef): ResolvedParticipant => {
    let teamId: string | null = null;
    if ('seed' in ref) teamId = seeds.find((s) => s.seed === ref.seed)?.teamId ?? null;
    else if ('winnerOf' in ref) teamId = outcomes.get(ref.winnerOf)?.winnerId ?? null;
    else teamId = outcomes.get(ref.loserOf)?.loserId ?? null;
    return { teamId, label: teamId ? (nameOf.get(teamId) ?? teamId) : placeholderLabel(ref) };
  };

  const matches: ResolvedFinalsMatch[] = [];
  template.weeks.forEach((week, weekIndex) => {
    for (const match of week.matches) {
      matches.push({
        key: match.key,
        weekIndex,
        weekName: week.name,
        slotOffset: match.slotOffset,
        homeRef: match.home,
        awayRef: match.away,
        home: resolve(match.home),
        away: resolve(match.away),
      });
    }
  });
  return matches;
}
