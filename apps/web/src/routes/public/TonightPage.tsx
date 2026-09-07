import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { describeClock, formatTimeOfDay, slotStartMinutes } from '@scoreboard/shared';
import { Countdown } from '../../components/Countdown.js';
import { PhaseLabel } from '../../components/live/PhaseLabel.js';
import { useServerNow } from '../../hooks/useServerNow.js';
import { publicApi } from '../../lib/publicApi.js';
import { liveSocket } from '../../lib/socket.js';
import { useLiveStore } from '../../store/liveStore.js';

/** `/tonight`: read-only live overview of every court, fed by the session room over the socket. */
export function TonightPage() {
  const tonight = useQuery({
    queryKey: ['public', 'tonight'],
    queryFn: publicApi.tonight,
    refetchInterval: 60_000,
  });
  const courts = useLiveStore((s) => s.courts);
  const clocks = useLiveStore((s) => s.clocks);
  const now = useServerNow(500);
  const liveSessionIds = (tonight.data?.sessions ?? [])
    .filter((s) => s.status === 'LIVE')
    .map((s) => s.id);
  const joinKey = liveSessionIds.join(',');

  useEffect(() => {
    if (!joinKey) return;
    const socket = liveSocket();
    socket.connect();
    const join = () => {
      for (const sessionId of joinKey.split(',')) void socket.emit('session:join', { sessionId });
    };
    if (socket.connected) join();
    return socket.onReconnect(join);
  }, [joinKey]);

  if (tonight.isPending) return <p className="text-text-muted">Loading…</p>;
  if (tonight.error) return <p className="text-danger">Could not load tonight's games.</p>;
  const { date, sessions } = tonight.data;
  const courtList = tonight.data.courts;
  const anyLive = liveSessionIds.length > 0;

  return (
    <div data-public-tonight>
      <h1 className="mb-1 text-3xl font-bold text-court">Tonight · {date}</h1>
      {sessions.length === 0 && <p className="text-text-muted">No games scheduled tonight.</p>}
      {anyLive ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {courtList.map((court) => {
            const state = courts[court.id];
            const clock = state?.clockId ? clocks[state.clockId] : null;
            const linked = clock?.linkedClockId ? clocks[clock.linkedClockId] : null;
            const display = describeClock(
              clock ?? null,
              linked ?? null,
              state?.timeout ?? { active: false, startedAtMs: null, durationMs: 0, calledBy: null },
              now,
            );
            const endsAt =
              clock && clock.status === 'RUNNING' && clock.phaseStartedAtMs !== null
                ? clock.phaseStartedAtMs + clock.phaseDurationMs
                : null;
            return (
              <section
                key={court.id}
                className="rounded-xl border border-border bg-surface p-3"
                data-tonight-court={court.id}
              >
                <h2 className="mb-1 flex items-center justify-between font-bold text-court">
                  {court.name}
                  {state?.current && (
                    <PhaseLabel
                      label={display.label || state.current.status.toLowerCase()}
                      token={display.token}
                      paused={display.paused}
                      className="text-xs"
                    />
                  )}
                </h2>
                {state?.current ? (
                  <>
                    <p className="text-xs text-text-muted">
                      {state.current.competitionName ?? 'Quick game'}
                    </p>
                    <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
                      <span className="truncate text-sm text-team">{state.current.homeName}</span>
                      <span
                        className="text-2xl font-bold text-score"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {state.homeScore}–{state.awayScore}
                      </span>
                      <span className="truncate text-sm text-team">{state.current.awayName}</span>
                    </div>
                    {state.current.status === 'LIVE' && !display.timeout && (
                      <Countdown
                        endsAtMs={display.paused ? null : endsAt}
                        staticMs={display.remainingMs}
                        className="mt-1 block text-center text-sm text-text-muted"
                      />
                    )}
                    {display.timeout && (
                      <p className="mt-1 text-center text-xs text-danger">time out</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-text-muted">
                    {state?.next
                      ? `Next: ${state.next.homeName} v ${state.next.awayName}`
                      : 'No game'}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        sessions.map((s) => (
          <section key={s.id} className="mt-4">
            <h2 className="mb-2 font-semibold text-team">
              From {s.firstSlotTime} · {s.slotCount} slots{' '}
              {s.status === 'COMPLETE' && (
                <span className="text-xs text-text-muted">(finished)</span>
              )}
            </h2>
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {s.fixtures.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <span>
                    <span className="text-xs text-text-muted">
                      {f.slotIndex !== null
                        ? formatTimeOfDay(
                            slotStartMinutes(s.firstSlotTime, s.slotLengthMinutes, f.slotIndex),
                          )
                        : ''}
                    </span>{' '}
                    <span className="font-semibold text-team">{f.homeTeamName ?? f.homeName}</span>{' '}
                    <span className="text-text-muted">v</span>{' '}
                    <span className="font-semibold text-team">
                      {f.status === 'BYE' ? 'BYE' : (f.awayTeamName ?? f.awayName)}
                    </span>
                  </span>
                  <span className="text-xs text-text-muted">
                    {f.status === 'COMPLETED' || f.status === 'FORFEIT' ? (
                      <span className="font-semibold text-score">
                        {f.homeScore}–{f.awayScore}
                      </span>
                    ) : (
                      [f.courtName, f.competitionName].filter(Boolean).join(' · ')
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
