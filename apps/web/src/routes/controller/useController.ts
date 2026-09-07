import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Ack, TeamSide } from '@scoreboard/shared';
import { OfflineQueue } from '../../lib/offlineQueue.js';
import {
  EMPTY_PENDING,
  optimisticScores,
  pendingReducer,
  type PendingTap,
} from '../../lib/pendingScores.js';
import { liveSocket } from '../../lib/socket.js';
import { newActionId } from '../../lib/version.js';
import { useLiveStore } from '../../store/liveStore.js';

const TAP_DEBOUNCE_MS = 220;
const DEFINITIVE: ReadonlySet<string> = new Set([
  'RULE_VIOLATION',
  'AUTH',
  'FORBIDDEN',
  'VALIDATION',
  'NOT_FOUND',
]);

interface QueuedScore {
  courtId: string;
  team: TeamSide;
  delta: 1 | -1;
}

export interface ControllerApi {
  homeScore: number;
  awayScore: number;
  pendingCount: number;
  tap: (team: TeamSide, delta: 1 | -1) => void;
  callTimeout: (team: TeamSide | null) => Promise<Ack>;
  endTimeout: () => Promise<Ack>;
  lastError: string | null;
}

/**
 * Optimistic scoring: taps show immediately, queue while offline (persisted per court), replay
 * in order on reconnect and reconcile against the server's court state.
 */
export function useController(courtId: string | null): ControllerApi {
  const court = useLiveStore((s) => (courtId ? (s.courts[courtId] ?? null) : null));
  const status = useLiveStore((s) => s.status);
  const [pending, dispatch] = useReducer(pendingReducer, EMPTY_PENDING);
  const [lastError, setLastError] = useState<string | null>(null);
  const lastTapRef = useRef<Record<string, number>>({});
  const queue = useMemo(
    () => (courtId ? new OfflineQueue<QueuedScore>(`sb.queue.${courtId}`) : null),
    [courtId],
  );

  // Restore taps queued before a reload so they still show optimistically.
  useEffect(() => {
    dispatch({ type: 'CLEAR' });
    if (!queue) return;
    for (const item of queue.pending) {
      dispatch({
        type: 'ADD',
        tap: { actionId: item.actionId, team: item.payload.team, delta: item.payload.delta },
      });
    }
  }, [queue]);

  const drain = useCallback(async () => {
    if (!queue) return;
    await queue.drain(async (item) => {
      const ack = await liveSocket().emit('controller:score', {
        actionId: item.actionId,
        ...item.payload,
      });
      if (ack.ok) {
        dispatch({ type: 'ACKED', actionId: item.actionId });
        return true;
      }
      if (DEFINITIVE.has(ack.error.code)) {
        dispatch({ type: 'REJECTED', actionId: item.actionId });
        setLastError(ack.error.message);
        return true;
      }
      return false;
    });
  }, [queue]);

  useEffect(() => {
    if (status === 'connected') void drain();
  }, [status, drain]);
  useEffect(() => liveSocket().onReconnect(() => void drain()), [drain]);

  const tap = useCallback(
    (team: TeamSide, delta: 1 | -1) => {
      if (!courtId || !queue) return;
      const key = `${team}${delta}`;
      const now = Date.now();
      if (now - (lastTapRef.current[key] ?? 0) < TAP_DEBOUNCE_MS) return;
      lastTapRef.current[key] = now;
      const tapItem: PendingTap = { actionId: newActionId(), team, delta };
      dispatch({ type: 'ADD', tap: tapItem });
      queue.enqueue(tapItem.actionId, { courtId, team, delta });
      setLastError(null);
      void drain();
    },
    [courtId, queue, drain],
  );

  const callTimeout = useCallback(
    async (team: TeamSide | null) => {
      if (!courtId)
        return { ok: false, error: { code: 'NO_COURT', message: 'No court selected' } } as Ack;
      const ack = await liveSocket().emit('controller:timeout', {
        actionId: newActionId(),
        courtId,
        team,
      });
      if (!ack.ok) setLastError(ack.error.message);
      return ack;
    },
    [courtId],
  );
  const endTimeout = useCallback(async () => {
    if (!courtId)
      return { ok: false, error: { code: 'NO_COURT', message: 'No court selected' } } as Ack;
    const ack = await liveSocket().emit('controller:endTimeout', {
      actionId: newActionId(),
      courtId,
    });
    if (!ack.ok) setLastError(ack.error.message);
    return ack;
  }, [courtId]);

  const scores = optimisticScores(
    { homeScore: court?.homeScore ?? 0, awayScore: court?.awayScore ?? 0 },
    pending,
  );
  return { ...scores, pendingCount: pending.taps.length, tap, callTimeout, endTimeout, lastError };
}
