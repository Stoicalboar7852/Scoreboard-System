import type { ClockState, CourtLiveState } from '@scoreboard/shared';
import { ConnectionBadge } from '../../components/ConnectionBadge.js';
import { CourtDisplay } from '../../components/live/CourtDisplay.js';

export interface ScoreboardViewProps {
  court: CourtLiveState;
  clock: ClockState | null;
  linkedClock: ClockState | null;
  nowMs: number;
  windowMinutes: number;
  timezone: string;
  fault?: string | null;
}

/**
 * Kiosk display (§7.2): the controller's information, larger, with no interactive elements.
 * Sizes come from clamp() so the same markup fills 1080p and 4K.
 */
export function ScoreboardView({
  court,
  clock,
  linkedClock,
  nowMs,
  windowMinutes,
  timezone,
  fault,
}: ScoreboardViewProps) {
  return (
    <div
      className="kiosk flex h-[100dvh] w-screen flex-col overflow-hidden bg-bg px-[2vw] py-[1.5vh]"
      data-scoreboard
    >
      <div className="pointer-events-none absolute right-[0.8vw] top-[0.8vh] z-10 opacity-70">
        <ConnectionBadge compact />
      </div>
      {fault && (
        <p
          role="alert"
          className="mx-auto rounded bg-danger/20 px-3 py-1 text-[clamp(0.8rem,1vw,1.4rem)] text-text"
        >
          {fault}
        </p>
      )}
      <div className="flex-1 overflow-hidden">
        <CourtDisplay
          court={court}
          clock={clock}
          linkedClock={linkedClock}
          nowMs={nowMs}
          homeScore={court.homeScore}
          awayScore={court.awayScore}
          windowMinutes={windowMinutes}
          timezone={timezone}
          scale={1.35}
        />
      </div>
    </div>
  );
}
