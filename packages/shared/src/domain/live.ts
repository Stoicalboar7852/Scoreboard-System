import { z } from 'zod';
import { epochMsSchema, nonNegativeIntSchema, uuidSchema } from './common.js';
import {
  clockModeSchema,
  clockPhaseSchema,
  clockStatusSchema,
  fixtureStageSchema,
  fixtureStatusSchema,
  teamSideSchema,
} from './enums.js';

/** Persisted and broadcast verbatim. Clients derive the display from this plus server time. */
export const clockStateSchema = z.object({
  id: uuidSchema,
  sessionId: uuidSchema,
  /** Null for an ad-hoc clock that is not tied to a format's fixtures. */
  formatId: uuidSchema.nullable(),
  /** Human label, e.g. "Fours" or "Court 3 ad-hoc". */
  label: z.string().max(80),
  mode: clockModeSchema,
  status: clockStatusSchema,
  phase: clockPhaseSchema,
  phaseDurationMs: nonNegativeIntSchema,
  phaseStartedAtMs: epochMsSchema.nullable(),
  remainingAtPauseMs: nonNegativeIntSchema.nullable(),
  linkedClockId: uuidSchema.nullable(),
  slotIndex: nonNegativeIntSchema,
  version: nonNegativeIntSchema,
});
export type ClockState = z.infer<typeof clockStateSchema>;

export const timeoutStateSchema = z.object({
  active: z.boolean(),
  startedAtMs: epochMsSchema.nullable(),
  durationMs: nonNegativeIntSchema,
  calledBy: teamSideSchema.nullable(),
});
export type TimeoutState = z.infer<typeof timeoutStateSchema>;

export const INACTIVE_TIMEOUT: TimeoutState = {
  active: false,
  startedAtMs: null,
  durationMs: 0,
  calledBy: null,
};

/** Denormalised fixture info shipped with court state so displays need no REST calls. */
export const fixtureDisplaySchema = z.object({
  fixtureId: uuidSchema,
  competitionId: uuidSchema.nullable(),
  competitionName: z.string().max(80).nullable(),
  formatId: uuidSchema.nullable(),
  formatName: z.string().max(80).nullable(),
  stage: fixtureStageSchema,
  status: fixtureStatusSchema,
  homeName: z.string().max(80),
  awayName: z.string().max(80),
  homeShortName: z.string().max(12).nullable(),
  awayShortName: z.string().max(12).nullable(),
  slotIndex: nonNegativeIntSchema.nullable(),
  scheduledStartMs: epochMsSchema.nullable(),
  /** True when this game does not count towards any ladder (quick game / ad-hoc). */
  adHoc: z.boolean(),
});
export type FixtureDisplay = z.infer<typeof fixtureDisplaySchema>;

export const courtLiveStateSchema = z.object({
  courtId: uuidSchema,
  courtName: z.string().max(80),
  sessionId: uuidSchema.nullable(),
  clockId: uuidSchema.nullable(),
  currentFixtureId: uuidSchema.nullable(),
  nextFixtureId: uuidSchema.nullable(),
  current: fixtureDisplaySchema.nullable(),
  next: fixtureDisplaySchema.nullable(),
  homeScore: nonNegativeIntSchema,
  awayScore: nonNegativeIntSchema,
  timeout: timeoutStateSchema,
  lastControllerSeenMs: epochMsSchema.nullable(),
  lastScoreboardSeenMs: epochMsSchema.nullable(),
  version: nonNegativeIntSchema,
});
export type CourtLiveState = z.infer<typeof courtLiveStateSchema>;

export const sessionLiveStateSchema = z.object({
  sessionId: uuidSchema,
  date: z.string(),
  status: z.enum(['PLANNED', 'LIVE', 'COMPLETE']),
  linkShorterToLonger: z.boolean(),
  slotCount: nonNegativeIntSchema,
  clockIds: z.array(uuidSchema),
  courtIds: z.array(uuidSchema),
  version: nonNegativeIntSchema,
});
export type SessionLiveState = z.infer<typeof sessionLiveStateSchema>;

/** Everything a freshly connected client needs to render. */
export const liveSnapshotSchema = z.object({
  serverNowMs: epochMsSchema,
  session: sessionLiveStateSchema.nullable(),
  clocks: z.array(clockStateSchema),
  courts: z.array(courtLiveStateSchema),
});
export type LiveSnapshot = z.infer<typeof liveSnapshotSchema>;
