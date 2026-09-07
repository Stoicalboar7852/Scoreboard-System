import { useEffect } from 'react';
import type { ClockState, CourtLiveState } from '@scoreboard/shared';
import { liveSocket } from '../lib/socket.js';
import { useLiveStore } from '../store/liveStore.js';

export interface CourtLive {
  court: CourtLiveState | null;
  clock: ClockState | null;
  linkedClock: ClockState | null;
}

/** Joins a court room (re-joining after every reconnect) and selects its live state. */
export function useCourtLive(courtId: string | null, role: 'CONTROLLER' | 'SCOREBOARD'): CourtLive {
  useEffect(() => {
    if (!courtId) return;
    const socket = liveSocket();
    socket.connect();
    const join = () => {
      void socket.emit('court:join', { courtId, role }).then((ack) => {
        if (!ack.ok)
          useLiveStore.getState().reportFault(`Could not join court: ${ack.error.message}`);
      });
    };
    if (socket.connected) join();
    const off = socket.onReconnect(join);
    return () => {
      off();
      if (socket.connected) void socket.emit('court:leave', { courtId });
    };
  }, [courtId, role]);

  const court = useLiveStore((s) => (courtId ? (s.courts[courtId] ?? null) : null));
  const clock = useLiveStore((s) => (court?.clockId ? (s.clocks[court.clockId] ?? null) : null));
  const linkedClock = useLiveStore((s) =>
    clock?.linkedClockId ? (s.clocks[clock.linkedClockId] ?? null) : null,
  );
  return { court, clock, linkedClock };
}
