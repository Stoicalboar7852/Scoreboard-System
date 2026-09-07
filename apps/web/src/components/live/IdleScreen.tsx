import {
  describeIdle,
  formatTimeOfDay12h,
  phaseEndsAtMs,
  type ClockState,
  type CourtLiveState,
} from '@scoreboard/shared';
import { Countdown } from '../Countdown.js';
import { PhaseLabel } from './PhaseLabel.js';

interface Props {
  court: CourtLiveState;
  clock: ClockState | null;
  linkedClock: ClockState | null;
  nowMs: number;
  windowMinutes: number;
  timezone: string;
  /** Multiplies the base font sizes (scoreboard uses larger). */
  scale?: number;
}

function startLabel(ms: number | null, timezone: string): string | null {
  if (ms === null) return null;
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return formatTimeOfDay12h(hour * 60 + minute);
}

/** Idle rules from §7.1 / decision 5: next game large inside the window, court name large otherwise. */
export function IdleScreen({
  court,
  clock,
  linkedClock,
  nowMs,
  windowMinutes,
  timezone,
  scale = 1,
}: Props) {
  const view = describeIdle(court, nowMs, windowMinutes * 60_000);
  const gapClock = clock?.phase === 'WAITING_FOR_LINKED' ? linkedClock : clock;
  const inGap = gapClock?.phase === 'BETWEEN_GAMES' && gapClock.status === 'RUNNING';
  const waiting = clock?.phase === 'WAITING_FOR_LINKED';
  const px = (n: number) =>
    `max(${(n * 0.6 * scale).toFixed(2)}rem, min(${(n * 2.2 * scale).toFixed(2)}vw, ${(n * 4 * scale).toFixed(2)}vh))`;

  if (view.kind === 'NEXT_SOON') {
    const time = startLabel(view.next.scheduledStartMs, timezone);
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-[0.5em] text-center"
        data-idle="next-soon"
        style={{ fontSize: px(1.2) }}
      >
        <p
          className="font-semibold uppercase tracking-widest text-court"
          style={{ fontSize: px(1.1) }}
        >
          {court.courtName}
        </p>
        <p className="font-bold text-team" style={{ fontSize: px(2.2) }}>
          {view.next.homeName}
        </p>
        <p className="text-text-muted" style={{ fontSize: px(1) }}>
          vs
        </p>
        <p className="font-bold text-team" style={{ fontSize: px(2.2) }}>
          {view.next.awayName}
        </p>
        <p className="text-text-muted" style={{ fontSize: px(1) }}>
          {view.next.competitionName ?? 'Quick game'}
          {time ? ` · ${time}` : ''}
        </p>
        {(inGap || waiting) && gapClock && (
          <div className="mt-[0.5em] flex flex-col items-center">
            <PhaseLabel
              label={
                waiting && !inGap
                  ? `Waiting for ${linkedClock?.label ?? 'linked clock'}`
                  : 'Next game in'
              }
              token={waiting && !inGap ? 'phaseWaiting' : 'phaseBetweenGames'}
            />
            <Countdown
              endsAtMs={
                inGap ? phaseEndsAtMs(gapClock) : linkedClock ? phaseEndsAtMs(linkedClock) : null
              }
              staticMs={0}
              className="font-bold"
              style={{ fontSize: px(2.6) }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-[0.6em] text-center"
      data-idle={view.kind === 'NEXT_LATER' ? 'next-later' : 'no-more-games'}
      style={{ fontSize: px(1.2) }}
    >
      <p className="font-bold text-court" style={{ fontSize: px(3.4) }}>
        {court.courtName}
      </p>
      {view.kind === 'NEXT_LATER' ? (
        <p className="text-text-muted" style={{ fontSize: px(1) }}>
          Next: {view.next.homeName} vs {view.next.awayName}
          {startLabel(view.next.scheduledStartMs, timezone)
            ? ` · ${startLabel(view.next.scheduledStartMs, timezone)}`
            : ''}
        </p>
      ) : (
        <p className="text-text-muted" style={{ fontSize: px(1) }}>
          No more games tonight
        </p>
      )}
    </div>
  );
}
