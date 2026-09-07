import { useParams } from 'react-router';
import { INACTIVE_TIMEOUT, type CourtLiveState } from '@scoreboard/shared';
import { ConnectionBadge } from '../../components/ConnectionBadge.js';
import { CourtDisplay } from '../../components/live/CourtDisplay.js';
import { useCourtLive } from '../../hooks/useCourtLive.js';
import { useServerNow } from '../../hooks/useServerNow.js';
import { useVersionReload } from '../../hooks/useVersionReload.js';
import { useWakeLock } from '../../hooks/useWakeLock.js';
import { usePublicSettings } from '../../lib/publicSettings.js';
import { useLiveStore } from '../../store/liveStore.js';

function placeholder(courtId: string): CourtLiveState {
  return {
    courtId,
    courtName: 'Court',
    sessionId: null,
    clockId: null,
    currentFixtureId: null,
    nextFixtureId: null,
    current: null,
    next: null,
    homeScore: 0,
    awayScore: 0,
    timeout: INACTIVE_TIMEOUT,
    lastControllerSeenMs: null,
    lastScoreboardSeenMs: null,
    version: 0,
  };
}

/** Read-only court view on the shared display component (the kiosk wrapper comes in Phase 6). */
export function CourtLivePage() {
  const { courtId = null } = useParams();
  const { court, clock, linkedClock } = useCourtLive(courtId, 'SCOREBOARD');
  const now = useServerNow();
  const settings = usePublicSettings();
  const faults = useLiveStore((s) => s.faults);
  useWakeLock();
  useVersionReload('auto');
  const state = court ?? placeholder(courtId ?? '');

  return (
    <main className="flex h-[100dvh] flex-col bg-bg px-[2vw] py-[1vh]">
      <div className="absolute right-2 top-2 z-10">
        <ConnectionBadge compact />
      </div>
      {faults.length > 0 && (
        <p className="rounded bg-danger/20 px-3 py-1 text-sm">{faults[faults.length - 1]}</p>
      )}
      <div className="flex-1 overflow-hidden">
        <CourtDisplay
          court={state}
          clock={clock}
          linkedClock={linkedClock}
          nowMs={now}
          homeScore={state.homeScore}
          awayScore={state.awayScore}
          windowMinutes={settings.data?.nextGameWindowMinutes ?? 30}
          timezone={settings.data?.timezone ?? 'Australia/Sydney'}
          scale={1.15}
        />
      </div>
    </main>
  );
}
