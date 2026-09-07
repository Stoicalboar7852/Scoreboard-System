import { useParams } from 'react-router';
import { describeClock, phaseEndsAtMs } from '@scoreboard/shared';
import { ConnectionBadge } from '../../components/ConnectionBadge.js';
import { Countdown } from '../../components/Countdown.js';
import { useCourtLive } from '../../hooks/useCourtLive.js';
import { useServerNow } from '../../hooks/useServerNow.js';
import { useVersionReload } from '../../hooks/useVersionReload.js';
import { useWakeLock } from '../../hooks/useWakeLock.js';
import { useLiveStore } from '../../store/liveStore.js';

/**
 * Phase 4 court page: proves the shell works end to end (join, time sync, live clock,
 * reconnect). The controller and scoreboard phases build their layouts on the same hooks.
 */
export function CourtLivePage() {
  const { courtId = null } = useParams();
  const { court, clock, linkedClock } = useCourtLive(courtId, 'SCOREBOARD');
  const now = useServerNow();
  const offset = useLiveStore((s) => s.offsetMs);
  const rtt = useLiveStore((s) => s.rttMs);
  const faults = useLiveStore((s) => s.faults);
  useWakeLock();
  useVersionReload('auto');

  const display = describeClock(
    clock,
    linkedClock,
    court?.timeout ?? { active: false, startedAtMs: null, durationMs: 0, calledBy: null },
    now,
  );
  const running = display.timeout
    ? (court?.timeout.startedAtMs ?? 0) + (court?.timeout.durationMs ?? 0)
    : clock && !display.paused
      ? display.fromLinked && linkedClock
        ? phaseEndsAtMs(linkedClock)
        : phaseEndsAtMs(clock)
      : null;

  return (
    <main className="flex min-h-full flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-court">{court?.courtName ?? 'Court'}</h1>
        <ConnectionBadge />
      </header>
      {faults.length > 0 && (
        <p className="rounded bg-danger/20 px-3 py-2 text-sm">{faults[faults.length - 1]}</p>
      )}
      <section className="grid grid-cols-3 items-center gap-4 text-center">
        <div>
          <p className="text-lg text-team">{court?.current?.homeName ?? '—'}</p>
          <p
            className="text-6xl font-bold text-score"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {court?.homeScore ?? 0}
          </p>
        </div>
        <div>
          <p
            className="text-lg font-semibold"
            style={{ color: `var(--color-${cssName(display.token)})` }}
          >
            {display.label || (court?.current ? 'Waiting to start' : 'No game')}
          </p>
          <Countdown
            endsAtMs={running}
            staticMs={display.remainingMs}
            className="text-6xl font-bold text-score"
          />
        </div>
        <div>
          <p className="text-lg text-team">{court?.current?.awayName ?? '—'}</p>
          <p
            className="text-6xl font-bold text-score"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {court?.awayScore ?? 0}
          </p>
        </div>
      </section>
      <footer className="mt-auto grid gap-1 text-xs text-text-muted sm:grid-cols-3">
        <span>
          Server offset {offset.toFixed(0)} ms · RTT {rtt ?? '—'} ms
        </span>
        <span>
          {court?.current
            ? `${court.current.competitionName ?? 'Quick game'} · ${court.current.formatName ?? ''}`
            : 'Idle'}
        </span>
        <span>
          {court?.next
            ? `Next: ${court.next.homeName} vs ${court.next.awayName}`
            : 'No more games tonight'}
        </span>
      </footer>
    </main>
  );
}

function cssName(token: string): string {
  return token
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace('phase-half1', 'phase-half1')
    .replace('phase-between-games', 'phase-between')
    .replace('phase-pre-game', 'phase-pregame')
    .replace('phase-half-time', 'phase-halftime')
    .replace('text-muted', 'text-muted');
}
