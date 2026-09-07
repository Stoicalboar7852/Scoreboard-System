import { type Prisma } from '@prisma/client';
import { fromZonedTime } from 'date-fns-tz';
import { parseTimeOfDay, type ClockDurations, type FixtureDisplay } from '@scoreboard/shared';

export const liveFixtureInclude = {
  competition: { include: { format: true } },
  format: true,
  homeTeam: true,
  awayTeam: true,
} as const;

export type LiveFixtureRow = Prisma.FixtureGetPayload<{ include: typeof liveFixtureInclude }>;

export interface SessionRow {
  id: string;
  date: string;
  firstSlotTime: string;
  slotLengthMinutes: number;
  slotCount: number;
  linkShorterToLonger: boolean;
  status: 'PLANNED' | 'LIVE' | 'COMPLETE';
}

export interface FormatRow {
  id: string;
  name: string;
  halfSeconds: number;
  halfTimeSeconds: number;
  betweenGamesSeconds: number;
  timeoutSeconds: number;
}

/** Format id of a fixture: the competition's, or the ad-hoc format. */
export function fixtureFormatId(f: LiveFixtureRow): string | null {
  return f.competition?.formatId ?? f.formatId ?? null;
}

export function fixtureFormatName(f: LiveFixtureRow): string | null {
  return f.competition?.format.name ?? f.format?.name ?? null;
}

/** Epoch ms when a slot starts on a session's date in the venue timezone. */
export function slotStartMs(session: SessionRow, slotIndex: number, timezone: string): number {
  const minutes = parseTimeOfDay(session.firstSlotTime);
  const base = fromZonedTime(`${session.date}T00:00:00`, timezone).getTime();
  return base + (minutes + session.slotLengthMinutes * slotIndex) * 60_000;
}

export function toDisplay(
  f: LiveFixtureRow,
  session: SessionRow | null,
  timezone: string,
): FixtureDisplay {
  return {
    fixtureId: f.id,
    competitionId: f.competitionId,
    competitionName: f.competition?.name ?? null,
    formatId: fixtureFormatId(f),
    formatName: fixtureFormatName(f),
    stage: f.stage,
    status: f.status,
    homeName: f.homeTeam?.name ?? f.homeName ?? 'Home',
    awayName: f.status === 'BYE' ? 'BYE' : (f.awayTeam?.name ?? f.awayName ?? 'Away'),
    homeShortName: f.homeTeam?.shortName ?? null,
    awayShortName: f.awayTeam?.shortName ?? null,
    slotIndex: f.slotIndex,
    scheduledStartMs:
      session && f.slotIndex !== null ? slotStartMs(session, f.slotIndex, timezone) : null,
    adHoc: f.competitionId === null,
  };
}

export function durationsOf(format: FormatRow): ClockDurations {
  return {
    halfMs: format.halfSeconds * 1000,
    halfTimeMs: format.halfTimeSeconds * 1000,
    betweenGamesMs: format.betweenGamesSeconds * 1000,
  };
}

/** Total seconds a game occupies (two halves, half time and the gap). */
export function formatGameSeconds(
  format: Pick<FormatRow, 'halfSeconds' | 'halfTimeSeconds' | 'betweenGamesSeconds'>,
): number {
  return format.halfSeconds * 2 + format.halfTimeSeconds + format.betweenGamesSeconds;
}

/**
 * The longest format sets the slot cadence; shorter ones wait for it when linked. Compared in
 * seconds (not rounded slot minutes) so two formats that round to the same minute still link
 * the shorter to the longer.
 */
export function longestFormat(formats: FormatRow[]): FormatRow | null {
  return formats.reduce<FormatRow | null>(
    (best, f) => (best === null || formatGameSeconds(f) > formatGameSeconds(best) ? f : best),
    null,
  );
}
