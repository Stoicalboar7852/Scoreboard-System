import { z } from 'zod';
import {
  epochMsSchema,
  hexColourSchema,
  isoDateSchema,
  nameSchema,
  nonNegativeIntSchema,
  positiveIntSchema,
  shortNameSchema,
  timeOfDaySchema,
  uuidSchema,
} from './common.js';
import {
  fixtureStageSchema,
  fixtureStatusSchema,
  nightOfWeekSchema,
  seasonStatusSchema,
  sessionStatusSchema,
  teamSideSchema,
} from './enums.js';
import { ladderRuleSchema } from '../ladder/rule.js';
import { finalsTemplateSchema } from '../finals/template.js';

/** Colour accents the venue can tweak in Settings. Keys mirror the theme tokens. */
export const accentOverridesSchema = z.record(z.string(), hexColourSchema);

export const settingsSchema = z.object({
  venueName: nameSchema,
  timezone: z.string().min(1),
  hasControllerPin: z.boolean(),
  nextGameWindowMinutes: positiveIntSchema.default(30),
  defaultTimeoutSeconds: positiveIntSchema.default(60),
  soundEnabled: z.boolean().default(false),
  accentOverrides: accentOverridesSchema.default({}),
  updatedAtMs: epochMsSchema.optional(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const courtSchema = z.object({
  id: uuidSchema,
  name: nameSchema,
  displayOrder: nonNegativeIntSchema,
  active: z.boolean(),
  supportedFormatIds: z.array(uuidSchema),
});
export type Court = z.infer<typeof courtSchema>;

export const gameFormatSchema = z.object({
  id: uuidSchema,
  name: nameSchema,
  halfSeconds: positiveIntSchema,
  halfTimeSeconds: nonNegativeIntSchema,
  betweenGamesSeconds: nonNegativeIntSchema,
  timeoutSeconds: positiveIntSchema,
  colour: hexColourSchema,
  displayOrder: nonNegativeIntSchema.default(0),
});
export type GameFormat = z.infer<typeof gameFormatSchema>;

export const seasonSchema = z.object({
  id: uuidSchema,
  name: nameSchema,
  startDate: isoDateSchema,
  regularWeeks: positiveIntSchema,
  skippedDates: z.array(isoDateSchema),
  finalsTemplate: finalsTemplateSchema,
  status: seasonStatusSchema,
});
export type Season = z.infer<typeof seasonSchema>;

export const competitionSchema = z.object({
  id: uuidSchema,
  seasonId: uuidSchema,
  name: nameSchema,
  nightOfWeek: nightOfWeekSchema,
  formatId: uuidSchema,
  ladderRule: ladderRuleSchema,
  displayOrder: nonNegativeIntSchema,
  published: z.boolean(),
});
export type Competition = z.infer<typeof competitionSchema>;

export const teamSchema = z.object({
  id: uuidSchema,
  competitionId: uuidSchema,
  name: nameSchema,
  shortName: shortNameSchema,
  colour: hexColourSchema.nullable(),
});
export type Team = z.infer<typeof teamSchema>;

export const playerSchema = z.object({
  id: uuidSchema,
  name: nameSchema,
  email: z.string().email().nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
});
export type Player = z.infer<typeof playerSchema>;

export const teamPlayerSchema = z.object({
  teamId: uuidSchema,
  playerId: uuidSchema,
});
export type TeamPlayer = z.infer<typeof teamPlayerSchema>;

export const teamClashLinkSchema = z.object({
  id: uuidSchema,
  teamAId: uuidSchema,
  teamBId: uuidSchema,
  reason: z.string().max(200).nullable(),
});
export type TeamClashLink = z.infer<typeof teamClashLinkSchema>;

export const sessionSchema = z.object({
  id: uuidSchema,
  seasonId: uuidSchema.nullable(),
  date: isoDateSchema,
  nightOfWeek: nightOfWeekSchema,
  firstSlotTime: timeOfDaySchema,
  slotLengthMinutes: positiveIntSchema,
  slotCount: nonNegativeIntSchema,
  linkShorterToLonger: z.boolean(),
  status: sessionStatusSchema,
  published: z.boolean(),
});
export type Session = z.infer<typeof sessionSchema>;

/** A reference to a finals participant that is resolved once results are known. */
export const placeholderRefSchema = z.union([
  z.object({ seed: positiveIntSchema }),
  z.object({ winnerOf: z.string().min(1) }),
  z.object({ loserOf: z.string().min(1) }),
]);
export type PlaceholderRef = z.infer<typeof placeholderRefSchema>;

export const fixtureSchema = z.object({
  id: uuidSchema,
  seasonId: uuidSchema.nullable(),
  competitionId: uuidSchema.nullable(),
  sessionId: uuidSchema.nullable(),
  roundNumber: nonNegativeIntSchema.nullable(),
  slotIndex: nonNegativeIntSchema.nullable(),
  courtId: uuidSchema.nullable(),
  homeTeamId: uuidSchema.nullable(),
  awayTeamId: uuidSchema.nullable(),
  homeName: z.string().max(80).nullable(),
  awayName: z.string().max(80).nullable(),
  stage: fixtureStageSchema,
  finalsKey: z.string().max(10).nullable(),
  homeRef: placeholderRefSchema.nullable(),
  awayRef: placeholderRefSchema.nullable(),
  status: fixtureStatusSchema,
  homeScore: nonNegativeIntSchema,
  awayScore: nonNegativeIntSchema,
  forfeitBy: teamSideSchema.nullable(),
  completedAtMs: epochMsSchema.nullable(),
  resultNotes: z.string().max(500).nullable(),
});
export type Fixture = z.infer<typeof fixtureSchema>;

export const ladderAdjustmentSchema = z.object({
  id: uuidSchema,
  competitionId: uuidSchema,
  teamId: uuidSchema,
  pointsDelta: z.number().int(),
  reason: z.string().trim().min(1).max(200),
  createdBy: z.string().max(120),
  createdAtMs: epochMsSchema,
});
export type LadderAdjustment = z.infer<typeof ladderAdjustmentSchema>;

export const auditLogSchema = z.object({
  id: uuidSchema,
  actor: z.string().max(120),
  deviceId: z.string().max(120).nullable(),
  action: z.string().max(80),
  payload: z.unknown(),
  createdAtMs: epochMsSchema,
});
export type AuditLog = z.infer<typeof auditLogSchema>;
