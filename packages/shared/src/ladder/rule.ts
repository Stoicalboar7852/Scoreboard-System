import { z } from 'zod';

export const LADDER_TIEBREAKERS = [
  'LADDER_POINTS',
  'WINS',
  'PERCENTAGE',
  'POINTS_DIFF',
  'POINTS_FOR',
  'HEAD_TO_HEAD',
  'NAME',
] as const;
export const ladderTiebreakerSchema = z.enum(LADDER_TIEBREAKERS);
export type LadderTiebreaker = z.infer<typeof ladderTiebreakerSchema>;

export const bonusRuleSchema = z.object({
  /** Every this many score points earns `points` ladder points. */
  perScorePoints: z.number().int().positive(),
  points: z.number().int().positive(),
  /** Maximum bonus per game, or null for unlimited. */
  cap: z.number().int().nonnegative().nullable(),
});
export type BonusRule = z.infer<typeof bonusRuleSchema>;

export const resultPointsRuleSchema = z.object({
  kind: z.literal('RESULT_POINTS'),
  win: z.number().int(),
  draw: z.number().int(),
  loss: z.number().int(),
  bye: z.number().int(),
  forfeitWin: z.number().int(),
  forfeitLoss: z.number().int(),
  bonus: bonusRuleSchema.nullable(),
  tiebreakers: z.array(ladderTiebreakerSchema).min(1),
});
export type ResultPointsRule = z.infer<typeof resultPointsRuleSchema>;

/**
 * Discriminated union on `kind` so future rule kinds (e.g. Elo, sets-based) can be added
 * without migrating existing competitions.
 */
export const ladderRuleSchema = z.discriminatedUnion('kind', [resultPointsRuleSchema]);
export type LadderRule = z.infer<typeof ladderRuleSchema>;

/** The venue's system: 6/4/2 plus 1 bonus point per 10 score points. */
export const VENUE_POINTS_RULE: LadderRule = {
  kind: 'RESULT_POINTS',
  win: 6,
  draw: 4,
  loss: 2,
  bye: 6,
  forfeitWin: 6,
  forfeitLoss: 0,
  bonus: { perScorePoints: 10, points: 1, cap: null },
  tiebreakers: ['LADDER_POINTS', 'WINS', 'POINTS_DIFF', 'POINTS_FOR', 'NAME'],
};

/** Conventional wins / for-and-against system. */
export const WINS_FOR_AGAINST_RULE: LadderRule = {
  kind: 'RESULT_POINTS',
  win: 2,
  draw: 1,
  loss: 0,
  bye: 2,
  forfeitWin: 2,
  forfeitLoss: 0,
  bonus: null,
  tiebreakers: ['LADDER_POINTS', 'PERCENTAGE', 'POINTS_DIFF', 'NAME'],
};

export const LADDER_RULE_PRESETS = {
  VENUE_POINTS: { label: 'Venue points system', rule: VENUE_POINTS_RULE },
  WINS_FOR_AGAINST: { label: 'Wins / for-and-against', rule: WINS_FOR_AGAINST_RULE },
} as const;
export type LadderRulePresetKey = keyof typeof LADDER_RULE_PRESETS;

/** Returns the preset key matching a rule exactly, or 'CUSTOM'. */
export function detectLadderPreset(rule: LadderRule): LadderRulePresetKey | 'CUSTOM' {
  const serialised = JSON.stringify(rule);
  for (const [key, preset] of Object.entries(LADDER_RULE_PRESETS)) {
    if (JSON.stringify(preset.rule) === serialised) return key as LadderRulePresetKey;
  }
  return 'CUSTOM';
}
