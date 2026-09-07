import { create } from 'zustand';
import type {
  ClockState,
  CourtLiveState,
  LiveSnapshot,
  LiveWarning,
  SessionLiveState,
} from '@scoreboard/shared';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

export interface LiveState {
  status: ConnectionStatus;
  /** Milliseconds to add to Date.now() to get server time. */
  offsetMs: number;
  rttMs: number | null;
  rttWarning: boolean;
  /** True once at least one time sample has been taken on this connection. */
  synced: boolean;
  lastSnapshotAtMs: number | null;
  session: SessionLiveState | null;
  clocks: Record<string, ClockState>;
  courts: Record<string, CourtLiveState>;
  warnings: LiveWarning[];
  /** A build newer than this one is running on the server. */
  updateAvailable: string | null;
  faults: string[];

  setStatus: (status: ConnectionStatus) => void;
  setTime: (offsetMs: number, rttMs: number | null, rttWarning: boolean) => void;
  applySnapshot: (snapshot: LiveSnapshot) => void;
  applyClock: (clock: ClockState) => void;
  applyCourt: (court: CourtLiveState) => void;
  applySession: (session: SessionLiveState) => void;
  setWarnings: (warnings: LiveWarning[]) => void;
  setUpdateAvailable: (version: string | null) => void;
  reportFault: (message: string) => void;
  clearFaults: () => void;
}

/** Keeps the newest version of a record; stale broadcasts (older version) are ignored. */
function newer<T extends { version: number }>(existing: T | undefined, incoming: T): boolean {
  return !existing || incoming.version >= existing.version;
}

export const useLiveStore = create<LiveState>((set) => ({
  status: 'reconnecting',
  offsetMs: 0,
  rttMs: null,
  rttWarning: false,
  synced: false,
  lastSnapshotAtMs: null,
  session: null,
  clocks: {},
  courts: {},
  warnings: [],
  updateAvailable: null,
  faults: [],

  setStatus: (status) => set({ status }),
  setTime: (offsetMs, rttMs, rttWarning) => set({ offsetMs, rttMs, rttWarning, synced: true }),
  applySnapshot: (snapshot) =>
    set((state) => {
      const clocks = { ...state.clocks };
      for (const clock of snapshot.clocks) clocks[clock.id] = clock;
      const courts = { ...state.courts };
      for (const court of snapshot.courts) courts[court.courtId] = court;
      return {
        clocks,
        courts,
        session: snapshot.session ?? (snapshot.courts.length === 1 ? state.session : null),
        lastSnapshotAtMs: Date.now(),
      };
    }),
  applyClock: (clock) =>
    set((state) =>
      newer(state.clocks[clock.id], clock)
        ? { clocks: { ...state.clocks, [clock.id]: clock } }
        : {},
    ),
  applyCourt: (court) =>
    set((state) =>
      newer(state.courts[court.courtId], court)
        ? { courts: { ...state.courts, [court.courtId]: court } }
        : {},
    ),
  applySession: (session) =>
    set((state) =>
      !state.session ||
      state.session.sessionId !== session.sessionId ||
      session.version >= state.session.version
        ? { session }
        : {},
    ),
  setWarnings: (warnings) => set({ warnings }),
  setUpdateAvailable: (version) => set({ updateAvailable: version }),
  reportFault: (message) => set((state) => ({ faults: [...state.faults.slice(-4), message] })),
  clearFaults: () => set({ faults: [] }),
}));

/** Server "now" from the last sync. Safe to call outside React. */
export function serverNow(): number {
  return Date.now() + useLiveStore.getState().offsetMs;
}
