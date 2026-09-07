import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useControllerBootstrap } from '../../lib/controllerBootstrap.js';
import {
  getControllerCourtId,
  getDeviceToken,
  setControllerCourtId,
  setDeviceToken,
} from '../../lib/deviceAuth.js';
import { CourtPicker } from './CourtPicker.js';
import { PinGate } from './PinGate.js';

/** `/controller`: PIN once per device, then the court grid; remembered court redirects. */
export function ControllerIndex() {
  const navigate = useNavigate();
  const hasToken = getDeviceToken() !== null;
  const bootstrap = useControllerBootstrap(hasToken);
  const remembered = getControllerCourtId();

  useEffect(() => {
    if (hasToken && remembered && bootstrap.data?.courts.some((c) => c.id === remembered)) {
      void navigate(`/controller/${remembered}`, { replace: true });
    }
  }, [hasToken, remembered, bootstrap.data, navigate]);

  useEffect(() => {
    if (bootstrap.error && (bootstrap.error as { status?: number }).status === 401)
      setDeviceToken(null);
  }, [bootstrap.error]);

  if (!hasToken || (bootstrap.error && (bootstrap.error as { status?: number }).status === 401)) {
    return <PinGate onDone={() => window.location.reload()} />;
  }
  if (bootstrap.isPending) return <main className="p-8 text-text-muted">Loading courts…</main>;
  if (bootstrap.error)
    return (
      <main className="p-8 text-danger">Could not load courts: {bootstrap.error.message}</main>
    );

  return (
    <CourtPicker
      courts={bootstrap.data.courts}
      venueName={bootstrap.data.settings.venueName}
      currentCourtId={remembered}
      onPick={(id) => {
        setControllerCourtId(id);
        void navigate(`/controller/${id}`);
      }}
    />
  );
}
