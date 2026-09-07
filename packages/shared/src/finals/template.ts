import { z } from 'zod';
import { placeholderRefSchema } from '../domain/entities.js';

export const finalsMatchSchema = z.object({
  /** Short unique key such as SF1, PF, GF. Doubles as the fixture stage where it matches. */
  key: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9]+$/, 'Use upper-case letters and digits'),
  home: placeholderRefSchema,
  away: placeholderRefSchema,
  /** Slot offset within the finals week (0 = first slot the competition plays that night). */
  slotOffset: z.number().int().nonnegative(),
});
export type FinalsMatch = z.infer<typeof finalsMatchSchema>;

export const finalsWeekSchema = z.object({
  name: z.string().trim().min(1).max(60),
  matches: z.array(finalsMatchSchema).min(1),
});
export type FinalsWeek = z.infer<typeof finalsWeekSchema>;

export const finalsTemplateSchema = z
  .object({
    weeks: z.array(finalsWeekSchema).min(1),
    /** How a drawn finals match is decided. */
    drawResolution: z.enum(['HIGHER_SEED']).default('HIGHER_SEED'),
  })
  .superRefine((template, ctx) => {
    const keys = new Set<string>();
    template.weeks.forEach((week, wi) => {
      week.matches.forEach((match, mi) => {
        if (keys.has(match.key)) {
          ctx.addIssue({
            code: 'custom',
            message: `Duplicate finals key ${match.key}`,
            path: ['weeks', wi, 'matches', mi, 'key'],
          });
        }
        keys.add(match.key);
        for (const side of ['home', 'away'] as const) {
          const ref = match[side];
          const target = 'winnerOf' in ref ? ref.winnerOf : 'loserOf' in ref ? ref.loserOf : null;
          if (target !== null && !keys.has(target)) {
            ctx.addIssue({
              code: 'custom',
              message: `${match.key}.${side} refers to ${target}, which must be defined earlier`,
              path: ['weeks', wi, 'matches', mi, side],
            });
          }
        }
      });
    });
  });
export type FinalsTemplate = z.infer<typeof finalsTemplateSchema>;

/** Semi finals + preliminary final in week 1, grand final in week 2. */
export const DEFAULT_FINALS_TEMPLATE: FinalsTemplate = {
  drawResolution: 'HIGHER_SEED',
  weeks: [
    {
      name: 'Semi finals',
      matches: [
        { key: 'SF1', home: { seed: 1 }, away: { seed: 2 }, slotOffset: 0 },
        { key: 'SF2', home: { seed: 3 }, away: { seed: 4 }, slotOffset: 0 },
        { key: 'PF', home: { loserOf: 'SF1' }, away: { winnerOf: 'SF2' }, slotOffset: 1 },
      ],
    },
    {
      name: 'Grand final',
      matches: [{ key: 'GF', home: { winnerOf: 'SF1' }, away: { winnerOf: 'PF' }, slotOffset: 0 }],
    },
  ],
};
