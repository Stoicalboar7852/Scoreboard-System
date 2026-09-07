import { type ClockPhase } from '../domain/enums.js';

/** Base colours. Every text/background pair used on a surface must reach WCAG AA (4.5:1). */
export const THEME_TOKENS = {
  bg: '#0B0F14',
  surface: '#161B22',
  surface2: '#1F2937',
  border: '#374151',
  text: '#F3F4F6',
  textMuted: '#9CA3AF',
  court: '#FBBF24',
  team: '#BFDBFE',
  score: '#FFFFFF',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#F87171',
  info: '#38BDF8',
  phaseHalf1: '#22C55E',
  phaseHalfTime: '#F59E0B',
  phaseHalf2: '#38BDF8',
  phaseBetweenGames: '#A78BFA',
  phaseWaiting: '#94A3B8',
  phaseTimeout: '#F87171',
  phaseFinal: '#FFFFFF',
  phasePaused: '#F59E0B',
  phasePreGame: '#94A3B8',
} as const;

export type ThemeTokenKey = keyof typeof THEME_TOKENS;
export type ThemeTokens = Record<ThemeTokenKey, string>;

/** Display label and token key for each clock phase. */
export const PHASE_PRESENTATION: Record<ClockPhase, { label: string; token: ThemeTokenKey }> = {
  PRE_GAME: { label: 'Starting soon', token: 'phasePreGame' },
  HALF_1: { label: 'Half 1', token: 'phaseHalf1' },
  HALF_TIME: { label: 'Half time', token: 'phaseHalfTime' },
  HALF_2: { label: 'Half 2', token: 'phaseHalf2' },
  BETWEEN_GAMES: { label: 'Next game in', token: 'phaseBetweenGames' },
  WAITING_FOR_LINKED: { label: 'Waiting', token: 'phaseWaiting' },
  FINISHED: { label: 'Final', token: 'phaseFinal' },
};

/** Merges venue overrides (validated hex colours) over the defaults. */
export function resolveTheme(overrides: Partial<Record<string, string>> = {}): ThemeTokens {
  const result: ThemeTokens = { ...THEME_TOKENS };
  for (const key of Object.keys(THEME_TOKENS) as ThemeTokenKey[]) {
    const value = overrides[key];
    if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) result[key] = value;
  }
  return result;
}

const CSS_VARIABLE_NAMES: Record<ThemeTokenKey, string> = {
  bg: '--color-bg',
  surface: '--color-surface',
  surface2: '--color-surface-2',
  border: '--color-border',
  text: '--color-text',
  textMuted: '--color-text-muted',
  court: '--color-court',
  team: '--color-team',
  score: '--color-score',
  success: '--color-success',
  warning: '--color-warning',
  danger: '--color-danger',
  info: '--color-info',
  phaseHalf1: '--color-phase-half1',
  phaseHalfTime: '--color-phase-halftime',
  phaseHalf2: '--color-phase-half2',
  phaseBetweenGames: '--color-phase-between',
  phaseWaiting: '--color-phase-waiting',
  phaseTimeout: '--color-phase-timeout',
  phaseFinal: '--color-phase-final',
  phasePaused: '--color-phase-paused',
  phasePreGame: '--color-phase-pregame',
};

export function cssVariableName(key: ThemeTokenKey): string {
  return CSS_VARIABLE_NAMES[key];
}

/** Produces `--color-x: #...;` declarations for injection into a `:root` rule. */
export function themeToCssDeclarations(tokens: ThemeTokens): string {
  return (Object.keys(tokens) as ThemeTokenKey[])
    .map((key) => `${CSS_VARIABLE_NAMES[key]}: ${tokens[key]};`)
    .join('\n');
}
