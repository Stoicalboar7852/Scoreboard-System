import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useServerNow } from '../../hooks/useServerNow.js';
import { adminApi } from '../../lib/adminApi.js';
import { queryClient } from '../../lib/query.js';
import { Badge, ConfirmDialog, PageHeader, errorMessage } from '../../components/ui/index.js';
import { useToast } from '../../components/Toaster.js';
import { ClockCard } from './live/ClockCard.js';
import { CourtGrid } from './live/CourtGrid.js';
import { SessionHeader } from './live/SessionHeader.js';
import { AssignFixtureDialog, CreateSessionDialog, QuickGameDialog } from './live/dialogs.js';
import { useAdminLive } from './useAdminLive.js';

export function Live() {
  const { send, session, clocks, courts, warnings } = useAdminLive();
  const now = useServerNow(500);
  const { toast } = useToast();
  const today = useQuery({
    queryKey: ['sessions', 'today'],
    queryFn: adminApi.sessions.today,
    refetchInterval: 30_000,
  });
  const formats = useQuery({ queryKey: ['formats'], queryFn: adminApi.formats.list });
  const [dialog, setDialog] = useState<
    { kind: 'assign' | 'quick'; courtId: string } | { kind: 'create' } | { kind: 'end' } | null
  >(null);
  const createSession = useMutation({
    mutationFn: adminApi.sessions.create,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast('Session created', 'success');
      setDialog(null);
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const updateLink = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      adminApi.sessions.update(id, { linkShorterToLonger: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const liveSession = session?.status === 'LIVE' ? session : null;
  const clockList = Object.values(clocks)
    .filter((c) => !liveSession || c.sessionId === liveSession.sessionId)
    .sort((a, b) => a.label.localeCompare(b.label));
  const courtList = Object.values(courts).sort((a, b) =>
    a.courtName.localeCompare(b.courtName, undefined, { numeric: true }),
  );
  const courtName = (id: string) => courts[id]?.courtName ?? 'court';

  return (
    <div data-admin-live>
      <PageHeader title="Live control" subtitle="Clocks, courts and tonight's session" />
      <SessionHeader
        date={today.data?.date ?? new Date().toISOString().slice(0, 10)}
        live={liveSession}
        planned={today.data?.sessions ?? []}
        onGoLive={(sessionId) => void send('session:goLive', { sessionId })}
        onEnd={() => setDialog({ kind: 'end' })}
        onToggleLink={(sessionId, value) =>
          liveSession
            ? void send('session:setLinkFlag', { sessionId, linkShorterToLonger: value })
            : updateLink.mutate({ id: sessionId, value })
        }
        onCreate={() => setDialog({ kind: 'create' })}
      />

      {warnings.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-2" aria-label="Warnings">
          {warnings.map((w, i) => (
            <li key={`${w.code}-${w.courtId ?? w.clockId ?? i}`}>
              <Badge tone="warning">{w.message}</Badge>
            </li>
          ))}
        </ul>
      )}

      {clockList.length > 0 ? (
        <div className="mb-6 grid gap-3 lg:grid-cols-2">
          {clockList.map((clock) => (
            <ClockCard
              key={clock.id}
              clock={clock}
              linkedClock={clock.linkedClockId ? (clocks[clock.linkedClockId] ?? null) : null}
              slotCount={liveSession?.slotCount ?? 0}
              nowMs={now}
              onAction={(action) =>
                void send(
                  action === 'advanceSlot'
                    ? 'session:advanceSlot'
                    : (`clock:${action}` as 'clock:start'),
                  { clockId: clock.id },
                )
              }
              onAdjust={(deltaSeconds) =>
                void send('clock:adjust', { clockId: clock.id, deltaSeconds })
              }
              onSetMode={(mode) => void send('clock:setMode', { clockId: clock.id, mode })}
            />
          ))}
        </div>
      ) : (
        <p className="mb-6 text-sm text-text-muted">
          No clocks yet. Go live with tonight's session to create one clock per game format.
        </p>
      )}

      <h2 className="mb-2 text-lg font-bold text-team">Courts</h2>
      <CourtGrid
        courts={courtList}
        clocks={clocks}
        nowMs={now}
        onSetScore={(courtId, homeScore, awayScore) =>
          void send('court:setScore', { courtId, homeScore, awayScore })
        }
        onEndGame={(courtId) => void send('court:endGame', { courtId })}
        onReopen={(courtId) => void send('court:reopenGame', { courtId })}
        onAssign={(courtId) => setDialog({ kind: 'assign', courtId })}
        onQuickGame={(courtId) => setDialog({ kind: 'quick', courtId })}
        onClear={(courtId) => void send('court:assignFixture', { courtId, fixtureId: null })}
        onEndTimeout={(courtId) => void send('controller:endTimeout', { courtId })}
      />

      <AssignFixtureDialog
        open={dialog?.kind === 'assign'}
        courtId={dialog?.kind === 'assign' ? dialog.courtId : null}
        courtName={dialog?.kind === 'assign' ? courtName(dialog.courtId) : ''}
        sessionId={liveSession?.sessionId ?? null}
        onAssign={(fixtureId) => {
          if (dialog?.kind === 'assign')
            void send('court:assignFixture', { courtId: dialog.courtId, fixtureId }).then(
              (ack) => ack.ok && setDialog(null),
            );
        }}
        onClose={() => setDialog(null)}
      />
      {dialog?.kind === 'quick' && (
        <QuickGameDialog
          open
          courtName={courtName(dialog.courtId)}
          formats={formats.data ?? []}
          onStart={(homeName, awayName, formatId) =>
            void send('court:quickGame', {
              courtId: dialog.courtId,
              homeName,
              awayName,
              formatId,
            }).then((ack) => ack.ok && setDialog(null))
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'create' && (
        <CreateSessionDialog
          open
          date={today.data?.date ?? new Date().toISOString().slice(0, 10)}
          formats={formats.data ?? []}
          onCreate={(input) => createSession.mutate({ ...input, seasonId: null, published: true })}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        open={dialog?.kind === 'end'}
        title="End the night?"
        message="Live games are finalised with their current scores, clocks stop and every court returns to idle."
        confirmLabel="End night"
        danger
        onConfirm={() => {
          if (liveSession)
            void send('session:end', { sessionId: liveSession.sessionId }).then(() =>
              queryClient.invalidateQueries({ queryKey: ['sessions'] }),
            );
          setDialog(null);
        }}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
