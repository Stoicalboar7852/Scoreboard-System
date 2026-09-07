import { z } from 'zod';

export const CLOCK_PHASES = [
  'PRE_GAME',
  'HALF_1',
  'HALF_TIME',
  'HALF_2',
  'BETWEEN_GAMES',
  'WAITING_FOR_LINKED',
  'FINISHED',
] as const;
export const clockPhaseSchema = z.enum(CLOCK_PHASES);
export type ClockPhase = z.infer<typeof clockPhaseSchema>;

export const CLOCK_STATUSES = ['IDLE', 'RUNNING', 'PAUSED'] as const;
export const clockStatusSchema = z.enum(CLOCK_STATUSES);
export type ClockStatus = z.infer<typeof clockStatusSchema>;

export const CLOCK_MODES = ['SINGLE', 'AUTO'] as const;
export const clockModeSchema = z.enum(CLOCK_MODES);
export type ClockMode = z.infer<typeof clockModeSchema>;

export const SEASON_STATUSES = ['DRAFT', 'PUBLISHED', 'FINALS', 'COMPLETE'] as const;
export const seasonStatusSchema = z.enum(SEASON_STATUSES);
export type SeasonStatus = z.infer<typeof seasonStatusSchema>;

export const SESSION_STATUSES = ['PLANNED', 'LIVE', 'COMPLETE'] as const;
export const sessionStatusSchema = z.enum(SESSION_STATUSES);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const FIXTURE_STAGES = ['REGULAR', 'SF1', 'SF2', 'PF', 'GF'] as const;
export const fixtureStageSchema = z.enum(FIXTURE_STAGES);
export type FixtureStage = z.infer<typeof fixtureStageSchema>;

export const FIXTURE_STATUSES = [
  'SCHEDULED',
  'LIVE',
  'COMPLETED',
  'FORFEIT',
  'BYE',
  'CANCELLED',
] as const;
export const fixtureStatusSchema = z.enum(FIXTURE_STATUSES);
export type FixtureStatus = z.infer<typeof fixtureStatusSchema>;

export const TEAM_SIDES = ['HOME', 'AWAY'] as const;
export const teamSideSchema = z.enum(TEAM_SIDES);
export type TeamSide = z.infer<typeof teamSideSchema>;

/** 0 = Sunday … 6 = Saturday, matching JavaScript's Date#getDay(). */
export const nightOfWeekSchema = z.number().int().min(0).max(6);
export type NightOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const NIGHT_NAMES: Record<NightOfWeek, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export function nightName(night: number): string {
  return NIGHT_NAMES[night as NightOfWeek] ?? `Night ${night}`;
}
