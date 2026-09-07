import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export type Uuid = string;

/** ISO calendar date, e.g. 2026-02-02 (no time component, interpreted in the venue timezone). */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Invalid calendar date');
export type IsoDate = string;

/** 24-hour wall-clock time, e.g. 18:30. */
export const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm');
export type TimeOfDay = string;

/** CSS hex colour, e.g. #FBBF24. */
export const hexColourSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected #RRGGBB');

export const nonNegativeIntSchema = z.number().int().min(0);
export const positiveIntSchema = z.number().int().positive();

export const epochMsSchema = z.number().int().nonnegative();
export type EpochMs = number;

export const nameSchema = z.string().trim().min(1).max(80);
export const shortNameSchema = z.string().trim().min(1).max(12);

/** A reference to a finals participant that is resolved once results are known. */
export const placeholderRefSchema = z.union([
  z.object({ seed: positiveIntSchema }),
  z.object({ winnerOf: z.string().min(1) }),
  z.object({ loserOf: z.string().min(1) }),
]);
export type PlaceholderRef = z.infer<typeof placeholderRefSchema>;
