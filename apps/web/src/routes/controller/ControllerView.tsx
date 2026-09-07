import type { ClockState, CourtLiveState, TeamSide } from '@scoreboard/shared';
import { canCallTimeout, formatTimeOfDay12h } from '@scoreboard/shared';
import { ConnectionBadge } from '../../components/ConnectionBadge.js';
import { CourtDisplay, isShowingGame } from '../../components/live/CourtDisplay.js';

export interface ControllerViewProps {
  court: CourtLiveState;
  clock: ClockState | null;
  linkedClock: ClockState | null;
  nowMs: number;
  homeScore: number;
  awayScore: number;
  pendingCount: number;
  windowMinutes: number;
  timezone: string;
  onTap: (team: TeamSide, delta: 1 | -1) => void;
  onTimeout: () => void;
  onEndTimeout: () => void;
  onOpenSettings: () => void;
  lastError?: string | null;
}

function nextLabel(court: CourtLiveState, timezone: string): string {
  if (!court.next) return 'No more games tonight';
  let time = '';
  if (court.next.scheduledStartMs !== null) {
    const parts = new Intl.DateTimeFormat('en-AU', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(court.next.scheduledStartMs));
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    time = ` ${formatTimeOfDay12h(hour * 60 + minute)}`;
  }
  return `Next: ${court.next.homeName} vs ${court.next.awayName}${time}`;
}

/** The referee screen (§7.1). Pure: everything comes in through props so each phase is testable. */
export function ControllerView(props: ControllerViewProps) {
  const { court, clock, linkedClock, nowMs, homeScore, awayScore } = props;
  const live = court.current?.status === 'LIVE';
  const timeoutActive = court.timeout.active;
  const canTimeout = live && (timeoutActive || canCallTimeout(clock));
  const scoringEnabled = live;
  const showingGame = isShowingGame(court, clock);

  const scoreButtons = (team: TeamSide) => (
    <div className="grid grid-cols-2 gap-2 px-1">
      <button
        type="button"
        onClick={() => props.onTap(team, 1)}
        disabled={!scoringEnabled}
        className="min-h-[72px] rounded-xl bg-surface-2 text-4xl font-bold text-score active:bg-border disabled:opacity-30"
        aria-label={`${team === 'HOME' ? 'Home' : 'Away'} plus one`}
        data-tap={`${team.toLowerCase()}-plus`}
      >
        +
      </button>
      <button
        type="button"
        onClick={() => props.onTap(team, -1)}
        disabled={!scoringEnabled}
        className="min-h-[72px] rounded-xl bg-surface text-4xl font-bold text-text-muted active:bg-border disabled:opacity-30"
        aria-label={`${team === 'HOME' ? 'Home' : 'Away'} minus one`}
        data-tap={`${team.toLowerCase()}-minus`}
      >
        −
      </button>
    </div>
  );

  const timeoutButton = (
    <button
      type="button"
      onClick={timeoutActive ? props.onEndTimeout : props.onTimeout}
      disabled={!canTimeout}
      className={`min-h-[72px] min-w-[10rem] rounded-xl px-6 text-xl font-bold uppercase tracking-wide disabled:opacity-30 ${timeoutActive ? 'bg-danger text-bg' : 'bg-surface-2 text-text'}`}
      data-timeout-button
    >
      {timeoutActive ? 'End time out' : 'Time out'}
    </button>
  );

  return (
    <div className="flex h-[100dvh] flex-col bg-bg" data-controller>
      <div className="absolute right-2 top-2 z-10">
        <button
          type="button"
          onClick={props.onOpenSettings}
          className="rounded-full bg-surface/70 p-3 text-xl text-text-muted"
          aria-label="Switch court"
        >
          ⚙
        </button>
      </div>
      <div className="flex-1 overflow-hidden px-[2vw] pt-[1vh]">
        <CourtDisplay
          court={court}
          clock={clock}
          linkedClock={linkedClock}
          nowMs={nowMs}
          homeScore={homeScore}
          awayScore={awayScore}
          windowMinutes={props.windowMinutes}
          timezone={props.timezone}
          homeControls={showingGame ? scoreButtons('HOME') : undefined}
          awayControls={showingGame ? scoreButtons('AWAY') : undefined}
          centreControls={showingGame ? timeoutButton : undefined}
        />
      </div>
      <footer
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm text-text-muted"
        data-controller-footer
      >
        <span className="flex items-center gap-2">
          <ConnectionBadge />
          {props.pendingCount > 0 && (
            <span className="rounded bg-warning/20 px-2 text-warning">
              {props.pendingCount} queued
            </span>
          )}
        </span>
        <span>{court.current?.competitionName ?? (court.current?.adHoc ? 'Quick game' : '')}</span>
        <span>{nextLabel(court, props.timezone)}</span>
      </footer>
      {props.lastError && (
        <p role="alert" className="bg-danger/20 px-3 py-1 text-center text-sm text-text">
          {props.lastError}
        </p>
      )}
    </div>
  );
}
