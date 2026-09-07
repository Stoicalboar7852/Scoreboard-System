import type { ThemeTokenKey } from '@scoreboard/shared';

const TOKEN_CSS: Record<ThemeTokenKey, string> = {
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

export function tokenVar(token: ThemeTokenKey): string {
  return `var(${TOKEN_CSS[token]})`;
}

interface Props {
  label: string;
  token: ThemeTokenKey;
  paused?: boolean;
  className?: string;
}

/** Phase label coloured per §10; "Paused" pulses amber. */
export function PhaseLabel({ label, token, paused = false, className }: Props) {
  return (
    <span
      className={`font-semibold uppercase tracking-wide ${paused ? 'pulse-soft' : ''} ${className ?? ''}`}
      style={{ color: tokenVar(token) }}
      data-phase-label
    >
      {label}
    </span>
  );
}
