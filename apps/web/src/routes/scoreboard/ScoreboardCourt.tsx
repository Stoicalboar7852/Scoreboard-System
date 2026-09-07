import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { INACTIVE_TIMEOUT, type CourtLiveState } from '@scoreboard/shared';
import { useCourtLive } from '../../hooks/useCourtLive.js';
import { usePhaseHorn } from '../../hooks/usePhaseHorn.js';
import { useServerNow } from '../../hooks/useServerNow.js';
import { useVersionReload } from '../../hooks/useVersionReload.js';
import { useWakeLock } from '../../hooks/useWakeLock.js';
import { setScoreboardCourtId } from '../../lib/deviceAuth.js';
import { unlockAudio } from '../../lib/horn.js';
import { usePublicSettings } from '../../lib/publicSettings.js';
import { useLiveStore } from '../../store/liveStore.js';
import { ScoreboardView } from './ScoreboardView.js';

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

/** `/scoreboard/:courtId` — full screen, cursor hidden, wake lock, auto-reload, optional horn. */
export function ScoreboardCourt() {
  const { courtId = null } = useParams();
  const navigate = useNavigate();
  const { court, clock, linkedClock } = useCourtLive(courtId, 'SCOREBOARD');
  const now = useServerNow();
  const settings = usePublicSettings();
  const faults = useLiveStore((s) => s.faults);
  const [audioReady, setAudioReady] = useState(false);
  useWakeLock();
  useVersionReload('auto');
  usePhaseHorn(clock, (settings.data?.soundEnabled ?? false) && audioReady);

  useEffect(() => {
    if (courtId) setScoreboardCourtId(courtId);
  }, [courtId]);

  // Full screen and audio need a user gesture outside kiosk mode; any tap/keypress grants both.
  useEffect(() => {
    const gesture = () => {
      void document.documentElement.requestFullscreen?.().catch(() => undefined);
      void unlockAudio().then(setAudioReady);
    };
    void unlockAudio().then(setAudioReady);
    window.addEventListener('pointerdown', gesture, { once: true });
    window.addEventListener('keydown', gesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', gesture);
      window.removeEventListener('keydown', gesture);
    };
  }, []);

  // Long press (2 s) on the court name area re-opens the picker so a kiosk can be re-pointed.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const down = () => {
      timer = setTimeout(() => void navigate('/scoreboard?pick=1'), 2000);
    };
    const up = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (timer) clearTimeout(timer);
    };
  }, [navigate]);

  return (
    <ScoreboardView
      court={court ?? placeholder(courtId ?? '')}
      clock={clock}
      linkedClock={linkedClock}
      nowMs={now}
      windowMinutes={settings.data?.nextGameWindowMinutes ?? 30}
      timezone={settings.data?.timezone ?? 'Australia/Sydney'}
      fault={faults.length > 0 ? faults[faults.length - 1] : null}
    />
  );
}
