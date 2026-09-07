import type { ReactNode } from 'react';
import type { ClockState, CourtLiveState } from '@scoreboard/shared';
import { GameClock } from './GameClock.js';
import { IdleScreen } from './IdleScreen.js';

export interface CourtDisplayProps {
  court: CourtLiveState;
  clock: ClockState | null;
  linkedClock: ClockState | null;
  nowMs: number;
  homeScore: number;
  awayScore: number;
  windowMinutes: number;
  timezone: string;
  /** Rendered under each score (controller buttons); omitted on the scoreboard. */
  homeControls?: ReactNode;
  awayControls?: ReactNode;
  centreControls?: ReactNode;
  /** Larger type for TVs. */
  scale?: number;
  showCourtName?: boolean;
}

/** True when the court should show a game rather than the idle screen. */
export function isShowingGame(court: CourtLiveState, clock: ClockState | null): boolean {
  if (!court.current) return false;
  if (court.current.status === 'LIVE' || court.current.status === 'COMPLETED') return true;
  return (
    clock !== null &&
    (clock.phase === 'HALF_1' ||
      clock.phase === 'HALF_TIME' ||
      clock.phase === 'HALF_2' ||
      clock.status === 'PAUSED')
  );
}

/**
 * The §7.1 layout shared by controller and scoreboard:
 * court name / team names / scores + clock / (buttons) — or the idle screen.
 */
export function CourtDisplay(props: CourtDisplayProps) {
  const {
    court,
    clock,
    linkedClock,
    nowMs,
    homeScore,
    awayScore,
    scale = 1,
    showCourtName = true,
  } = props;
  const s = (n: number) =>
    `clamp(${(n * 0.7 * scale).toFixed(2)}rem, ${(n * 3 * scale).toFixed(2)}vw, ${(n * 3.4 * scale).toFixed(2)}rem)`;

  if (!isShowingGame(court, clock)) {
    return (
      <div className="flex h-full flex-col" data-court-mode="idle">
        <div className="flex-1">
          <IdleScreen
            court={court}
            clock={clock}
            linkedClock={linkedClock}
            nowMs={nowMs}
            windowMinutes={props.windowMinutes}
            timezone={props.timezone}
            scale={scale}
          />
        </div>
        {props.centreControls && (
          <div className="flex justify-center p-2">{props.centreControls}</div>
        )}
      </div>
    );
  }

  const current = court.current!;
  return (
    <div className="flex h-full flex-col" data-court-mode="game">
      {showCourtName && (
        <h1
          className="text-center font-bold uppercase tracking-widest text-court"
          style={{ fontSize: s(1.2) }}
          data-court-name
        >
          {court.courtName}
        </h1>
      )}
      <div className="grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-x-[2vw] portrait:grid-cols-2 portrait:grid-rows-[auto_auto_auto]">
        {/* Home */}
        <div className="flex flex-col items-center justify-center text-center portrait:col-start-1 portrait:row-start-1">
          <p
            className="max-w-full truncate px-1 font-semibold text-team"
            style={{ fontSize: s(1.3) }}
            data-team="home"
          >
            {current.homeName}
          </p>
          <p
            className="font-bold leading-none text-score"
            style={{ fontSize: s(6), fontVariantNumeric: 'tabular-nums' }}
            data-score="home"
          >
            {homeScore}
          </p>
          {props.homeControls && <div className="mt-[1vh] w-full">{props.homeControls}</div>}
        </div>
        {/* Centre */}
        <div className="flex flex-col items-center justify-center portrait:col-span-2 portrait:row-start-2">
          <GameClock
            court={court}
            clock={clock}
            linkedClock={linkedClock}
            nowMs={nowMs}
            scale={scale}
          />
          {props.centreControls && <div className="mt-[1.5vh]">{props.centreControls}</div>}
        </div>
        {/* Away */}
        <div className="flex flex-col items-center justify-center text-center portrait:col-start-2 portrait:row-start-1">
          <p
            className="max-w-full truncate px-1 font-semibold text-team"
            style={{ fontSize: s(1.3) }}
            data-team="away"
          >
            {current.awayName}
          </p>
          <p
            className="font-bold leading-none text-score"
            style={{ fontSize: s(6), fontVariantNumeric: 'tabular-nums' }}
            data-score="away"
          >
            {awayScore}
          </p>
          {props.awayControls && <div className="mt-[1vh] w-full">{props.awayControls}</div>}
        </div>
      </div>
    </div>
  );
}
