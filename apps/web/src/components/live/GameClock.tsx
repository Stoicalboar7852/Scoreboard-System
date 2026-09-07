import {
  describeClock,
  phaseEndsAtMs,
  timeoutEndsAtMs,
  type ClockState,
  type CourtLiveState,
} from '@scoreboard/shared';
import { Countdown } from '../Countdown.js';
import { PhaseLabel, tokenVar } from './PhaseLabel.js';

interface Props {
  court: CourtLiveState | null;
  clock: ClockState | null;
  linkedClock: ClockState | null;
  nowMs: number;
  /** Shown as the label when the game is over. */
  finalLabel?: string;
  labelClassName?: string;
  digitsClassName?: string;
  /** Multiplies the responsive font sizes (scoreboard uses larger). */
  scale?: number;
}

/**
 * Phase label above the clock, or the time-out countdown in red while a time out is active.
 * A finished fixture shows FINAL on a subtle panel with no digits.
 */
export function GameClock({
  court,
  clock,
  linkedClock,
  nowMs,
  finalLabel = 'Final',
  labelClassName,
  digitsClassName,
  scale = 1,
}: Props) {
  const size = (n: number) =>
    `max(${(n * 0.7 * scale).toFixed(2)}rem, min(${(n * 3 * scale).toFixed(2)}vw, ${(n * 5.2 * scale).toFixed(2)}vh))`;
  const timeout = court?.timeout ?? {
    active: false,
    startedAtMs: null,
    durationMs: 0,
    calledBy: null,
  };
  const display = describeClock(clock, linkedClock, timeout, nowMs);
  const isFinal =
    !display.timeout && (court?.current?.status === 'COMPLETED' || clock?.phase === 'FINISHED');

  if (isFinal) {
    return (
      <div className="flex flex-col items-center gap-2" data-clock-state="final">
        <span
          className={`rounded-xl border border-border bg-surface px-[0.6em] py-[0.15em] font-bold uppercase tracking-widest ${digitsClassName ?? ''}`}
          style={{ color: tokenVar('phaseFinal'), fontSize: size(2.4) }}
        >
          {finalLabel}
        </span>
      </div>
    );
  }

  let endsAt: number | null = null;
  if (display.timeout) endsAt = timeoutEndsAtMs(timeout);
  else if (!display.paused && clock)
    endsAt = display.fromLinked && linkedClock ? phaseEndsAtMs(linkedClock) : phaseEndsAtMs(clock);

  return (
    <div
      className="flex flex-col items-center"
      style={{ fontSize: size(1.1) }}
      data-clock-state={
        display.timeout ? 'timeout' : display.paused ? 'paused' : (clock?.phase ?? 'none')
      }
    >
      <PhaseLabel
        label={display.label || (court?.current ? 'Starting soon' : '')}
        token={display.token}
        paused={display.paused}
        className={labelClassName}
      />
      <Countdown
        endsAtMs={endsAt}
        staticMs={display.remainingMs}
        className={`font-bold leading-none ${digitsClassName ?? ''}`}
        style={{
          color: display.timeout ? tokenVar('phaseTimeout') : 'var(--color-score)',
          fontSize: size(4.2),
        }}
      />
    </div>
  );
}
