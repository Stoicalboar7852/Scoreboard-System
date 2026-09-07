import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { INACTIVE_TIMEOUT, type CourtLiveState } from '@scoreboard/shared';
import { UpdatePrompt } from '../../components/UpdatePrompt.js';
import { useCourtLive } from '../../hooks/useCourtLive.js';
import { useServerNow } from '../../hooks/useServerNow.js';
import { useVersionReload } from '../../hooks/useVersionReload.js';
import { useWakeLock } from '../../hooks/useWakeLock.js';
import { useControllerBootstrap } from '../../lib/controllerBootstrap.js';
import { getDeviceToken, setControllerCourtId } from '../../lib/deviceAuth.js';
import { ControllerView } from './ControllerView.js';
import { CourtPicker } from './CourtPicker.js';
import { PinGate } from './PinGate.js';
import { useController } from './useController.js';

function placeholderCourt(courtId: string): CourtLiveState {
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

export function ControllerCourt() {
  const { courtId = null } = useParams();
  const navigate = useNavigate();
  const bootstrap = useControllerBootstrap();
  const { court, clock, linkedClock } = useCourtLive(courtId, 'CONTROLLER');
  const controller = useController(courtId);
  const now = useServerNow();
  const [gate, setGate] = useState<'none' | 'pin' | 'pick'>('none');
  useWakeLock();
  useVersionReload('prompt');

  if (!getDeviceToken()) return <PinGate onDone={() => window.location.reload()} />;
  if (bootstrap.error && (bootstrap.error as { status?: number }).status === 401) {
    return (
      <PinGate
        title="This tablet needs to be re-registered"
        onDone={() => window.location.reload()}
      />
    );
  }

  if (gate === 'pin') {
    return (
      <PinGate
        title="PIN required to switch courts"
        onDone={() => setGate('pick')}
        onCancel={() => setGate('none')}
      />
    );
  }
  if (gate === 'pick') {
    return (
      <CourtPicker
        courts={bootstrap.data?.courts ?? []}
        venueName={bootstrap.data?.settings.venueName}
        currentCourtId={courtId}
        onPick={(id) => {
          setControllerCourtId(id);
          setGate('none');
          void navigate(`/controller/${id}`, { replace: true });
        }}
        title="Switch this tablet to a court"
      />
    );
  }

  const settings = bootstrap.data?.settings;
  return (
    <>
      <UpdatePrompt />
      <ControllerView
        court={court ?? placeholderCourt(courtId ?? '')}
        clock={clock}
        linkedClock={linkedClock}
        nowMs={now}
        homeScore={controller.homeScore}
        awayScore={controller.awayScore}
        pendingCount={controller.pendingCount}
        windowMinutes={settings?.nextGameWindowMinutes ?? 30}
        timezone={settings?.timezone ?? 'Australia/Sydney'}
        onTap={controller.tap}
        onTimeout={() => void controller.callTimeout(null)}
        onEndTimeout={() => void controller.endTimeout()}
        onOpenSettings={() => setGate(settings?.hasControllerPin === false ? 'pick' : 'pin')}
        lastError={controller.lastError}
      />
    </>
  );
}
