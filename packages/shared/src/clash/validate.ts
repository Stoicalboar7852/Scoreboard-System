import { type FixtureStatus } from '../domain/enums.js';

export interface ValidationFixture {
  id: string;
  competitionId: string | null;
  formatId: string | null;
  slotIndex: number | null;
  courtId: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  status: FixtureStatus;
}

export interface ValidationContext {
  courts: ReadonlyArray<{ id: string; supportedFormatIds: readonly string[] }>;
  clashes: ReadonlyArray<{ teamAId: string; teamBId: string }>;
  linkShorterToLonger: boolean;
  /** When given, slots outside 0..slotCount-1 are flagged. */
  slotCount?: number;
}

export type ValidationIssueCode =
  | 'CELL_DOUBLE_BOOKED'
  | 'TEAM_TWICE_IN_SLOT'
  | 'TEAM_TWICE_IN_NIGHT'
  | 'CLASH_LINK'
  | 'COURT_FORMAT_UNSUPPORTED'
  | 'COURT_MULTI_FORMAT'
  | 'UNKNOWN_COURT'
  | 'SLOT_OUT_OF_RANGE'
  | 'SAME_TEAM_BOTH_SIDES';

export interface ValidationIssue {
  code: ValidationIssueCode;
  severity: 'ERROR' | 'WARNING';
  message: string;
  fixtureIds: string[];
  teamIds?: string[];
  slotIndex?: number;
  courtId?: string;
}

export function clashPairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function buildClashSet(
  clashes: ReadonlyArray<{ teamAId: string; teamBId: string }>,
): Set<string> {
  return new Set(clashes.map((c) => clashPairKey(c.teamAId, c.teamBId)));
}

const INACTIVE: ReadonlySet<FixtureStatus> = new Set(['CANCELLED', 'BYE']);

/** Validates one night's fixtures against the hard scheduling constraints (§8.2). */
export function validateNight(
  fixtures: readonly ValidationFixture[],
  ctx: ValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const courts = new Map(ctx.courts.map((c) => [c.id, c]));
  const clashes = buildClashSet(ctx.clashes);
  const active = fixtures.filter((f) => !INACTIVE.has(f.status));
  const scheduled = active.filter((f) => f.slotIndex !== null && f.courtId !== null);

  for (const f of active) {
    if (f.homeTeamId && f.awayTeamId && f.homeTeamId === f.awayTeamId) {
      issues.push({
        code: 'SAME_TEAM_BOTH_SIDES',
        severity: 'ERROR',
        message: 'A team cannot play itself',
        fixtureIds: [f.id],
        teamIds: [f.homeTeamId],
      });
    }
  }

  // Cells and per-slot team sets.
  const byCell = new Map<string, ValidationFixture[]>();
  const bySlotTeam = new Map<string, ValidationFixture[]>();
  const courtFormats = new Map<string, Map<string, ValidationFixture[]>>();
  for (const f of scheduled) {
    const slot = f.slotIndex as number;
    const courtId = f.courtId as string;
    const court = courts.get(courtId);
    if (!court) {
      issues.push({
        code: 'UNKNOWN_COURT',
        severity: 'ERROR',
        message: `Unknown court ${courtId}`,
        fixtureIds: [f.id],
        courtId,
      });
    } else if (f.formatId && !court.supportedFormatIds.includes(f.formatId)) {
      issues.push({
        code: 'COURT_FORMAT_UNSUPPORTED',
        severity: 'ERROR',
        message: `Court does not support this game format`,
        fixtureIds: [f.id],
        courtId,
        slotIndex: slot,
      });
    }
    if (ctx.slotCount !== undefined && (slot < 0 || slot >= ctx.slotCount)) {
      issues.push({
        code: 'SLOT_OUT_OF_RANGE',
        severity: 'ERROR',
        message: `Slot ${slot + 1} is outside the session's ${ctx.slotCount} slots`,
        fixtureIds: [f.id],
        slotIndex: slot,
      });
    }
    const cellKey = `${slot}|${courtId}`;
    byCell.set(cellKey, [...(byCell.get(cellKey) ?? []), f]);
    for (const team of [f.homeTeamId, f.awayTeamId]) {
      if (!team) continue;
      const key = `${slot}|${team}`;
      bySlotTeam.set(key, [...(bySlotTeam.get(key) ?? []), f]);
    }
    if (f.formatId) {
      const formats = courtFormats.get(courtId) ?? new Map<string, ValidationFixture[]>();
      formats.set(f.formatId, [...(formats.get(f.formatId) ?? []), f]);
      courtFormats.set(courtId, formats);
    }
  }

  for (const [key, list] of byCell) {
    if (list.length > 1) {
      const [slot, courtId] = key.split('|');
      issues.push({
        code: 'CELL_DOUBLE_BOOKED',
        severity: 'ERROR',
        message: `${list.length} fixtures booked on the same court in slot ${Number(slot) + 1}`,
        fixtureIds: list.map((f) => f.id),
        slotIndex: Number(slot),
        courtId,
      });
    }
  }

  for (const [key, list] of bySlotTeam) {
    if (list.length > 1) {
      const [slot, team] = key.split('|');
      issues.push({
        code: 'TEAM_TWICE_IN_SLOT',
        severity: 'ERROR',
        message: `Team is booked twice in slot ${Number(slot) + 1}`,
        fixtureIds: list.map((f) => f.id),
        teamIds: [team as string],
        slotIndex: Number(slot),
      });
    }
  }

  // A team appears at most once per night (counts unscheduled fixtures too).
  const byTeam = new Map<string, ValidationFixture[]>();
  for (const f of active) {
    for (const team of [f.homeTeamId, f.awayTeamId]) {
      if (!team) continue;
      byTeam.set(team, [...(byTeam.get(team) ?? []), f]);
    }
  }
  for (const [team, list] of byTeam) {
    const distinct = [...new Set(list)];
    if (distinct.length > 1) {
      issues.push({
        code: 'TEAM_TWICE_IN_NIGHT',
        severity: 'ERROR',
        message: `Team plays more than once tonight`,
        fixtureIds: distinct.map((f) => f.id),
        teamIds: [team],
      });
    }
  }

  // Clash links: linked teams never share a slot.
  if (clashes.size > 0) {
    const slots = new Map<number, ValidationFixture[]>();
    for (const f of scheduled) {
      const slot = f.slotIndex as number;
      slots.set(slot, [...(slots.get(slot) ?? []), f]);
    }
    for (const [slot, list] of slots) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i] as ValidationFixture;
          const b = list[j] as ValidationFixture;
          for (const ta of [a.homeTeamId, a.awayTeamId]) {
            for (const tb of [b.homeTeamId, b.awayTeamId]) {
              if (ta && tb && clashes.has(clashPairKey(ta, tb))) {
                issues.push({
                  code: 'CLASH_LINK',
                  severity: 'ERROR',
                  message: `Clash-linked teams are both in slot ${slot + 1}`,
                  fixtureIds: [a.id, b.id],
                  teamIds: [ta, tb],
                  slotIndex: slot,
                });
              }
            }
          }
        }
      }
    }
  }

  // Unlinked nights: one format per court for the whole night.
  if (!ctx.linkShorterToLonger) {
    for (const [courtId, formats] of courtFormats) {
      if (formats.size > 1) {
        issues.push({
          code: 'COURT_MULTI_FORMAT',
          severity: 'ERROR',
          message: 'Court hosts more than one game format on a night whose clocks are not linked',
          fixtureIds: [...formats.values()].flat().map((f) => f.id),
          courtId,
        });
      }
    }
  }

  return issues;
}
