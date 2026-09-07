import {
  validateNight,
  type Court,
  type FixtureStatus,
  type ValidationIssue,
} from '@scoreboard/shared';
import type {
  CompetitionWithTeams,
  EffectiveClash,
  FixtureWithNames,
} from '../../../lib/adminApi.js';

/** A fixture as edited in the grid; `id` is undefined for new rows. */
export interface DraftFixture {
  key: string;
  id?: string;
  competitionId: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeName: string | null;
  awayName: string | null;
  slotIndex: number | null;
  courtId: string | null;
  roundNumber: number | null;
  status: FixtureStatus;
  homeScore: number;
  awayScore: number;
}

export interface GridDraft {
  slotCount: number;
  fixtures: DraftFixture[];
  deleteFixtureIds: string[];
}

let seq = 0;
export function newKey(): string {
  seq += 1;
  return `new-${seq}`;
}

export function draftFromServer(slotCount: number, fixtures: FixtureWithNames[]): GridDraft {
  return {
    slotCount,
    deleteFixtureIds: [],
    fixtures: fixtures.map((f) => ({
      key: f.id,
      id: f.id,
      competitionId: f.competitionId,
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
      homeName: f.homeName,
      awayName: f.awayName,
      slotIndex: f.slotIndex,
      courtId: f.courtId,
      roundNumber: f.roundNumber,
      status: f.status,
      homeScore: f.homeScore,
      awayScore: f.awayScore,
    })),
  };
}

export function cellFixture(draft: GridDraft, slotIndex: number, courtId: string): DraftFixture[] {
  return draft.fixtures.filter(
    (f) => f.slotIndex === slotIndex && f.courtId === courtId && f.status !== 'CANCELLED',
  );
}

export function unscheduled(draft: GridDraft): DraftFixture[] {
  return draft.fixtures.filter((f) => f.slotIndex === null || f.courtId === null);
}

export function addSlot(draft: GridDraft): GridDraft {
  return { ...draft, slotCount: Math.min(30, draft.slotCount + 1) };
}

/** Removes the last slot; its fixtures become unscheduled rather than deleted. */
export function removeLastSlot(draft: GridDraft): GridDraft {
  if (draft.slotCount === 0) return draft;
  const last = draft.slotCount - 1;
  return {
    ...draft,
    slotCount: last,
    fixtures: draft.fixtures.map((f) =>
      f.slotIndex === last ? { ...f, slotIndex: null, courtId: null } : f,
    ),
  };
}

export function upsertFixture(draft: GridDraft, fixture: DraftFixture): GridDraft {
  const exists = draft.fixtures.some((f) => f.key === fixture.key);
  return {
    ...draft,
    fixtures: exists
      ? draft.fixtures.map((f) => (f.key === fixture.key ? fixture : f))
      : [...draft.fixtures, fixture],
  };
}

export function removeFixture(draft: GridDraft, key: string): GridDraft {
  const target = draft.fixtures.find((f) => f.key === key);
  return {
    ...draft,
    fixtures: draft.fixtures.filter((f) => f.key !== key),
    deleteFixtureIds: target?.id ? [...draft.deleteFixtureIds, target.id] : draft.deleteFixtureIds,
  };
}

export const PLAYED: ReadonlySet<FixtureStatus> = new Set(['LIVE', 'COMPLETED', 'FORFEIT']);

/** Runs the shared validator on the draft (instant badges before saving). */
export function validateDraft(
  draft: GridDraft,
  ctx: {
    courts: Court[];
    competitions: CompetitionWithTeams[];
    clashes: EffectiveClash[];
    linkShorterToLonger: boolean;
  },
): ValidationIssue[] {
  const formatOf = new Map(ctx.competitions.map((c) => [c.id, c.formatId]));
  return validateNight(
    draft.fixtures.map((f) => ({
      id: f.key,
      competitionId: f.competitionId,
      formatId: f.competitionId ? (formatOf.get(f.competitionId) ?? null) : null,
      slotIndex: f.slotIndex,
      courtId: f.courtId,
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
      status: f.status,
    })),
    {
      courts: ctx.courts.map((c) => ({ id: c.id, supportedFormatIds: c.supportedFormatIds })),
      clashes: ctx.clashes.map((c) => ({ teamAId: c.teamAId, teamBId: c.teamBId })),
      linkShorterToLonger: ctx.linkShorterToLonger,
      slotCount: draft.slotCount > 0 ? draft.slotCount : undefined,
    },
  );
}

export function issuesByFixture(issues: ValidationIssue[]): Map<string, ValidationIssue[]> {
  const map = new Map<string, ValidationIssue[]>();
  for (const issue of issues)
    for (const id of issue.fixtureIds) map.set(id, [...(map.get(id) ?? []), issue]);
  return map;
}

export const ISSUE_LABELS: Record<ValidationIssue['code'], string> = {
  CELL_DOUBLE_BOOKED: 'Double booked',
  TEAM_TWICE_IN_SLOT: 'Team twice in slot',
  TEAM_TWICE_IN_NIGHT: 'Team plays twice',
  CLASH_LINK: 'Clash link',
  COURT_FORMAT_UNSUPPORTED: 'Court format',
  COURT_MULTI_FORMAT: 'Mixed formats',
  UNKNOWN_COURT: 'Unknown court',
  SLOT_OUT_OF_RANGE: 'Slot out of range',
  SAME_TEAM_BOTH_SIDES: 'Same team',
};

export function toSaveInput(draft: GridDraft) {
  return {
    slotCount: draft.slotCount,
    deleteFixtureIds: draft.deleteFixtureIds,
    fixtures: draft.fixtures.map((f) => ({
      id: f.id,
      competitionId: f.competitionId,
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
      homeName: f.homeName,
      awayName: f.awayName,
      slotIndex: f.slotIndex,
      courtId: f.courtId,
      roundNumber: f.roundNumber,
      status: f.status,
    })),
  };
}
