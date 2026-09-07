import type {
  Competition as DbCompetition,
  Court as DbCourt,
  CourtFormat as DbCourtFormat,
  Fixture as DbFixture,
  GameFormat as DbGameFormat,
  LadderAdjustment as DbAdjustment,
  Player as DbPlayer,
  Season as DbSeason,
  Session as DbSession,
  Settings as DbSettings,
  Team as DbTeam,
  TeamClashLink as DbClashLink,
  TeamPlayer as DbTeamPlayer,
} from '@prisma/client';
import {
  DEFAULT_FINALS_TEMPLATE,
  VENUE_POINTS_RULE,
  finalsTemplateSchema,
  ladderRuleSchema,
  placeholderRefSchema,
  type Competition,
  type Court,
  type Fixture,
  type GameFormat,
  type LadderAdjustment,
  type LadderRule,
  type PlaceholderRef,
  type Player,
  type Season,
  type Session,
  type Settings,
  type Team,
  type TeamClashLink,
} from '@scoreboard/shared';
import { toMs } from '../lib/time.js';

export function mapSettings(row: DbSettings): Settings {
  return {
    venueName: row.venueName,
    timezone: row.timezone,
    hasControllerPin: row.controllerPinHash !== null,
    nextGameWindowMinutes: row.nextGameWindowMinutes,
    defaultTimeoutSeconds: row.defaultTimeoutSeconds,
    soundEnabled: row.soundEnabled,
    accentOverrides: (row.accentOverrides ?? {}) as Record<string, string>,
    updatedAtMs: row.updatedAt.getTime(),
  };
}

export function mapCourt(row: DbCourt & { supportedFormats: DbCourtFormat[] }): Court {
  return {
    id: row.id,
    name: row.name,
    displayOrder: row.displayOrder,
    active: row.active,
    supportedFormatIds: row.supportedFormats.map((f) => f.formatId),
  };
}

export function mapFormat(row: DbGameFormat): GameFormat {
  return {
    id: row.id,
    name: row.name,
    halfSeconds: row.halfSeconds,
    halfTimeSeconds: row.halfTimeSeconds,
    betweenGamesSeconds: row.betweenGamesSeconds,
    timeoutSeconds: row.timeoutSeconds,
    colour: row.colour,
    displayOrder: row.displayOrder,
  };
}

export function parseFinalsTemplate(json: unknown) {
  const parsed = finalsTemplateSchema.safeParse(json);
  return parsed.success ? parsed.data : DEFAULT_FINALS_TEMPLATE;
}

export function parseLadderRule(json: unknown): LadderRule {
  const parsed = ladderRuleSchema.safeParse(json);
  return parsed.success ? parsed.data : VENUE_POINTS_RULE;
}

export function mapSeason(row: DbSeason): Season {
  return {
    id: row.id,
    name: row.name,
    startDate: row.startDate,
    regularWeeks: row.regularWeeks,
    skippedDates: row.skippedDates,
    finalsTemplate: parseFinalsTemplate(row.finalsTemplate),
    status: row.status,
  };
}

export function mapCompetition(
  row: DbCompetition,
): Competition & { ladderLockedAtMs: number | null } {
  return {
    id: row.id,
    seasonId: row.seasonId,
    name: row.name,
    nightOfWeek: row.nightOfWeek,
    formatId: row.formatId,
    ladderRule: parseLadderRule(row.ladderRule),
    displayOrder: row.displayOrder,
    published: row.published,
    ladderLockedAtMs: toMs(row.ladderLockedAt),
  };
}

export function mapTeam(row: DbTeam): Team {
  return {
    id: row.id,
    competitionId: row.competitionId,
    name: row.name,
    shortName: row.shortName,
    colour: row.colour,
  };
}

export function mapPlayer(
  row: DbPlayer & { teams?: DbTeamPlayer[] },
): Player & { teamIds: string[] } {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    teamIds: (row.teams ?? []).map((t) => t.teamId),
  };
}

export function mapClashLink(row: DbClashLink): TeamClashLink {
  return { id: row.id, teamAId: row.teamAId, teamBId: row.teamBId, reason: row.reason };
}

export function mapSession(row: DbSession): Session {
  return {
    id: row.id,
    seasonId: row.seasonId,
    date: row.date,
    nightOfWeek: row.nightOfWeek,
    firstSlotTime: row.firstSlotTime,
    slotLengthMinutes: row.slotLengthMinutes,
    slotCount: row.slotCount,
    linkShorterToLonger: row.linkShorterToLonger,
    status: row.status,
    published: row.published,
  };
}

function parseRef(json: unknown): PlaceholderRef | null {
  if (json === null || json === undefined) return null;
  const parsed = placeholderRefSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export function mapFixture(row: DbFixture): Fixture {
  return {
    id: row.id,
    seasonId: row.seasonId,
    competitionId: row.competitionId,
    sessionId: row.sessionId,
    roundNumber: row.roundNumber,
    slotIndex: row.slotIndex,
    courtId: row.courtId,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    homeName: row.homeName,
    awayName: row.awayName,
    stage: row.stage,
    finalsKey: row.finalsKey,
    homeRef: parseRef(row.homeRef),
    awayRef: parseRef(row.awayRef),
    status: row.status,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    forfeitBy: row.forfeitBy,
    completedAtMs: toMs(row.completedAt),
    resultNotes: row.resultNotes,
  };
}

export function mapAdjustment(row: DbAdjustment): LadderAdjustment {
  return {
    id: row.id,
    competitionId: row.competitionId,
    teamId: row.teamId,
    pointsDelta: row.pointsDelta,
    reason: row.reason,
    createdBy: row.createdBy,
    createdAtMs: row.createdAt.getTime(),
  };
}
