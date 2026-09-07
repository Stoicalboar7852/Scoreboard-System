import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { Court } from '@scoreboard/shared';
import { api } from '../../lib/api.js';
import { getScoreboardCourtId, setScoreboardCourtId } from '../../lib/deviceAuth.js';
import { usePublicSettings } from '../../lib/publicSettings.js';
import { CourtPicker } from '../controller/CourtPicker.js';

/** `/scoreboard`: one-time court picker for a kiosk; the choice is remembered on the PC. */
export function ScoreboardIndex() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const forcePick = params.get('pick') === '1';
  const remembered = getScoreboardCourtId();
  const courts = useQuery({
    queryKey: ['public', 'courts'],
    queryFn: () => api<Court[]>('/api/public/courts'),
  });
  const settings = usePublicSettings();

  useEffect(() => {
    if (!forcePick && remembered) void navigate(`/scoreboard/${remembered}`, { replace: true });
  }, [forcePick, remembered, navigate]);

  if (!forcePick && remembered) return null;
  if (courts.isPending) return <main className="p-8 text-text-muted">Loading courts…</main>;
  if (courts.error)
    return <main className="p-8 text-danger">Could not load courts: {courts.error.message}</main>;
  return (
    <CourtPicker
      courts={courts.data}
      venueName={settings.data?.venueName}
      currentCourtId={remembered}
      title="Which court is this screen for?"
      onPick={(id) => {
        setScoreboardCourtId(id);
        void navigate(`/scoreboard/${id}`, { replace: true });
      }}
    />
  );
}
