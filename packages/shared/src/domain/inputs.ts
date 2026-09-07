import { z } from 'zod';
import {
  hexColourSchema,
  isoDateSchema,
  nameSchema,
  nonNegativeIntSchema,
  placeholderRefSchema,
  positiveIntSchema,
  shortNameSchema,
  timeOfDaySchema,
  uuidSchema,
} from './common.js';
import {
  fixtureStageSchema,
  fixtureStatusSchema,
  nightOfWeekSchema,
  teamSideSchema,
} from './enums.js';
import { accentOverridesSchema } from './entities.js';
import { ladderRuleSchema } from '../ladder/rule.js';
import { finalsTemplateSchema } from '../finals/template.js';

/** REST request bodies. Every route on the server validates with exactly these schemas. */

export const loginInputSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

export const controllerPinInputSchema = z.object({
  pin: z.string().trim().min(4).max(12),
  deviceName: z.string().trim().min(1).max(80),
});
export type ControllerPinInput = z.infer<typeof controllerPinInputSchema>;

export const settingsUpdateSchema = z
  .object({
    venueName: nameSchema,
    timezone: z.string().min(1).max(64),
    controllerPin: z.string().trim().min(4).max(12).nullable(),
    nextGameWindowMinutes: positiveIntSchema.max(720),
    defaultTimeoutSeconds: positiveIntSchema.max(600),
    soundEnabled: z.boolean(),
    accentOverrides: accentOverridesSchema,
  })
  .partial();
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

export const courtInputSchema = z.object({
  name: nameSchema,
  displayOrder: nonNegativeIntSchema.default(0),
  active: z.boolean().default(true),
  supportedFormatIds: z.array(uuidSchema).default([]),
});
export type CourtInput = z.infer<typeof courtInputSchema>;
export const courtUpdateSchema = courtInputSchema.partial();

export const gameFormatInputSchema = z.object({
  name: nameSchema,
  halfSeconds: positiveIntSchema.max(7200),
  halfTimeSeconds: nonNegativeIntSchema.max(3600),
  betweenGamesSeconds: nonNegativeIntSchema.max(3600),
  timeoutSeconds: positiveIntSchema.max(600),
  colour: hexColourSchema,
  displayOrder: nonNegativeIntSchema.default(0),
});
export type GameFormatInput = z.infer<typeof gameFormatInputSchema>;
export const gameFormatUpdateSchema = gameFormatInputSchema.partial();

export const seasonInputSchema = z.object({
  name: nameSchema,
  startDate: isoDateSchema,
  regularWeeks: positiveIntSchema.max(60),
  skippedDates: z.array(isoDateSchema).default([]),
  finalsTemplate: finalsTemplateSchema.optional(),
});
export type SeasonInput = z.infer<typeof seasonInputSchema>;
export const seasonUpdateSchema = seasonInputSchema.partial().extend({
  status: z.enum(['DRAFT', 'PUBLISHED', 'FINALS', 'COMPLETE']).optional(),
});

export const competitionInputSchema = z.object({
  seasonId: uuidSchema,
  name: nameSchema,
  nightOfWeek: nightOfWeekSchema,
  formatId: uuidSchema,
  ladderRule: ladderRuleSchema.optional(),
  displayOrder: nonNegativeIntSchema.default(0),
  published: z.boolean().default(false),
});
export type CompetitionInput = z.infer<typeof competitionInputSchema>;
export const competitionUpdateSchema = competitionInputSchema.partial();

export const teamInputSchema = z.object({
  competitionId: uuidSchema,
  name: nameSchema,
  shortName: shortNameSchema.optional(),
  colour: hexColourSchema.nullable().default(null),
});
export type TeamInput = z.infer<typeof teamInputSchema>;
export const teamUpdateSchema = teamInputSchema.partial();

export const playerInputSchema = z.object({
  name: nameSchema,
  email: z.string().trim().email().nullable().default(null),
  phone: z.string().trim().max(30).nullable().default(null),
  teamIds: z.array(uuidSchema).default([]),
});
export type PlayerInput = z.infer<typeof playerInputSchema>;
export const playerUpdateSchema = playerInputSchema.partial();

export const clashLinkInputSchema = z
  .object({
    teamAId: uuidSchema,
    teamBId: uuidSchema,
    reason: z.string().trim().max(200).nullable().default(null),
  })
  .refine((v) => v.teamAId !== v.teamBId, { message: 'A team cannot clash with itself' });
export type ClashLinkInput = z.infer<typeof clashLinkInputSchema>;

export const sessionInputSchema = z.object({
  seasonId: uuidSchema.nullable().default(null),
  date: isoDateSchema,
  firstSlotTime: timeOfDaySchema,
  slotLengthMinutes: positiveIntSchema.max(240),
  slotCount: nonNegativeIntSchema.max(30).default(0),
  linkShorterToLonger: z.boolean().default(false),
  published: z.boolean().default(false),
});
export type SessionInput = z.infer<typeof sessionInputSchema>;
export const sessionUpdateSchema = sessionInputSchema.partial();

const fixtureTeamsSchema = z.object({
  competitionId: uuidSchema.nullable().default(null),
  homeTeamId: uuidSchema.nullable().default(null),
  awayTeamId: uuidSchema.nullable().default(null),
  homeName: z.string().trim().max(80).nullable().default(null),
  awayName: z.string().trim().max(80).nullable().default(null),
});

export const fixtureInputSchema = fixtureTeamsSchema
  .extend({
    seasonId: uuidSchema.nullable().default(null),
    sessionId: uuidSchema.nullable().default(null),
    roundNumber: nonNegativeIntSchema.nullable().default(null),
    slotIndex: nonNegativeIntSchema.nullable().default(null),
    courtId: uuidSchema.nullable().default(null),
    stage: fixtureStageSchema.default('REGULAR'),
    finalsKey: z.string().trim().max(10).nullable().default(null),
    homeRef: placeholderRefSchema.nullable().default(null),
    awayRef: placeholderRefSchema.nullable().default(null),
    status: fixtureStatusSchema.default('SCHEDULED'),
  })
  .refine(
    (f) => f.status === 'BYE' || f.homeTeamId !== null || f.homeName !== null || f.homeRef !== null,
    { message: 'Home side is required', path: ['homeTeamId'] },
  )
  .refine(
    (f) => f.status === 'BYE' || f.awayTeamId !== null || f.awayName !== null || f.awayRef !== null,
    { message: 'Away side is required', path: ['awayTeamId'] },
  )
  .refine((f) => f.homeTeamId === null || f.homeTeamId !== f.awayTeamId, {
    message: 'A team cannot play itself',
    path: ['awayTeamId'],
  });
export type FixtureInput = z.infer<typeof fixtureInputSchema>;

export const fixtureUpdateSchema = z.object({
  competitionId: uuidSchema.nullable().optional(),
  sessionId: uuidSchema.nullable().optional(),
  roundNumber: nonNegativeIntSchema.nullable().optional(),
  slotIndex: nonNegativeIntSchema.nullable().optional(),
  courtId: uuidSchema.nullable().optional(),
  homeTeamId: uuidSchema.nullable().optional(),
  awayTeamId: uuidSchema.nullable().optional(),
  homeName: z.string().trim().max(80).nullable().optional(),
  awayName: z.string().trim().max(80).nullable().optional(),
  status: fixtureStatusSchema.optional(),
});
export type FixtureUpdate = z.infer<typeof fixtureUpdateSchema>;

export const resultInputSchema = z
  .object({
    homeScore: nonNegativeIntSchema.max(999),
    awayScore: nonNegativeIntSchema.max(999),
    status: z.enum(['COMPLETED', 'FORFEIT', 'CANCELLED', 'SCHEDULED']),
    forfeitBy: teamSideSchema.nullable().default(null),
    resultNotes: z.string().trim().max(500).nullable().default(null),
  })
  .refine((r) => r.status !== 'FORFEIT' || r.forfeitBy !== null, {
    message: 'Say which team forfeited',
    path: ['forfeitBy'],
  });
export type ResultInput = z.infer<typeof resultInputSchema>;

export const adjustmentInputSchema = z.object({
  competitionId: uuidSchema,
  teamId: uuidSchema,
  pointsDelta: z
    .number()
    .int()
    .min(-100)
    .max(100)
    .refine((v) => v !== 0, 'Delta cannot be zero'),
  reason: z.string().trim().min(1).max(200),
});
export type AdjustmentInput = z.infer<typeof adjustmentInputSchema>;

/** Bulk save of a session grid from the admin editor. */
export const sessionGridSaveSchema = z.object({
  slotCount: nonNegativeIntSchema.max(30),
  fixtures: z.array(
    fixtureTeamsSchema.extend({
      id: uuidSchema.optional(),
      slotIndex: nonNegativeIntSchema.nullable(),
      courtId: uuidSchema.nullable(),
      roundNumber: nonNegativeIntSchema.nullable().default(null),
      status: fixtureStatusSchema.default('SCHEDULED'),
    }),
  ),
  deleteFixtureIds: z.array(uuidSchema).default([]),
});
export type SessionGridSave = z.infer<typeof sessionGridSaveSchema>;

export const importCommitSchema = z.object({
  sessionId: uuidSchema.nullable().default(null),
  autoCreateTeams: z.boolean().default(false),
  /** The preview token returned by /import/preview so the server commits exactly what was shown. */
  previewId: z.string().min(8).max(64),
});
export type ImportCommitInput = z.infer<typeof importCommitSchema>;

export const drawGenerateInputSchema = z.object({
  seasonId: uuidSchema,
  weeks: positiveIntSchema.max(60).optional(),
  nights: z
    .array(
      z.object({
        nightOfWeek: nightOfWeekSchema,
        courtIds: z.array(uuidSchema).min(1),
        firstSlotTime: timeOfDaySchema,
        linkShorterToLonger: z.boolean().default(false),
        extraSlots: nonNegativeIntSchema.max(5).default(0),
      }),
    )
    .min(1),
  seed: z.number().int().nonnegative().optional(),
  /** Regenerate only these week numbers (1-based); others keep their existing fixtures. */
  onlyWeeks: z.array(positiveIntSchema).optional(),
  replaceExisting: z.boolean().default(false),
});
export type DrawGenerateInput = z.infer<typeof drawGenerateInputSchema>;

export const finalsGenerateInputSchema = z.object({
  competitionId: uuidSchema,
  nights: z
    .array(
      z.object({
        weekIndex: nonNegativeIntSchema,
        date: isoDateSchema,
        courtIds: z.array(uuidSchema).min(1),
        firstSlotTime: timeOfDaySchema,
        startSlotIndex: nonNegativeIntSchema.default(0),
      }),
    )
    .min(1),
});
export type FinalsGenerateInput = z.infer<typeof finalsGenerateInputSchema>;

export const listQuerySchema = z.object({
  competitionId: uuidSchema.optional(),
  seasonId: uuidSchema.optional(),
  sessionId: uuidSchema.optional(),
  round: z.coerce.number().int().nonnegative().optional(),
  status: fixtureStatusSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;
