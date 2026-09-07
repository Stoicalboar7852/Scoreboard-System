import { io, type Socket } from 'socket.io-client';
import type {
  Ack,
  ClientEventName,
  ClientEventPayload,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@scoreboard/shared';
import { getDeviceToken } from './deviceAuth.js';
import { TimeSync } from './timeSync.js';
import { isNewerBuild } from './version.js';
import { useLiveStore } from '../store/liveStore.js';

export type LiveClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const TIME_SYNC_INTERVAL_MS = 60_000;
const OFFLINE_AFTER_MS = 10_000;
const ACK_TIMEOUT_MS = 8_000;

/**
 * One socket for the whole app. Feeds the live store, keeps server time in sync, tracks
 * connection status and exposes acked emits. Reconnection is handled by Socket.IO.
 */
class LiveSocket {
  readonly socket: LiveClientSocket;
  readonly timeSync = new TimeSync();
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private offlineTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly reconnectListeners = new Set<() => void>();

  constructor() {
    this.socket = io({
      path: '/socket.io',
      autoConnect: false,
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.3,
      timeout: 10_000,
      auth: (cb) => cb({ deviceToken: getDeviceToken() ?? undefined }),
    });
    const store = useLiveStore;

    this.socket.on('connect', () => {
      this.clearOfflineTimer();
      store.getState().setStatus('connected');
      this.timeSync.reset();
      void this.ping();
      this.startSyncTimer();
      for (const listener of this.reconnectListeners) listener();
    });
    this.socket.on('disconnect', () => {
      store.getState().setStatus('reconnecting');
      this.stopSyncTimer();
      this.armOfflineTimer();
    });
    this.socket.io.on('reconnect_attempt', () => {
      if (store.getState().status !== 'offline') store.getState().setStatus('reconnecting');
    });
    this.socket.on('connect_error', () => this.armOfflineTimer());

    this.socket.on('time:pong', ({ clientSentMs, serverNowMs }) => {
      this.timeSync.addSample({ clientSentMs, serverNowMs, clientReceivedMs: Date.now() });
      store
        .getState()
        .setTime(this.timeSync.offsetMs, this.timeSync.rttMs, this.timeSync.rttWarning);
    });
    this.socket.on('live:snapshot', (snapshot) => store.getState().applySnapshot(snapshot));
    this.socket.on('court:state', (court) => store.getState().applyCourt(court));
    this.socket.on('clock:state', (clock) => store.getState().applyClock(clock));
    this.socket.on('session:state', (session) => store.getState().applySession(session));
    this.socket.on('live:warnings', (warnings) => store.getState().setWarnings(warnings));
    this.socket.on('app:version', ({ version }) => {
      if (isNewerBuild(version)) store.getState().setUpdateAvailable(version);
    });

    if (typeof window !== 'undefined') {
      // The browser knows about network changes long before the transport's ping timeout does:
      // drop the dead connection at once and reconnect the moment the network is back.
      window.addEventListener('offline', () => {
        store.getState().setStatus('offline');
        this.socket.disconnect();
      });
      window.addEventListener('online', () => {
        if (this.socket.connected) this.socket.disconnect();
        store.getState().setStatus('reconnecting');
        this.socket.connect();
      });
    }
  }

  connect(): void {
    if (!this.socket.connected) this.socket.connect();
  }

  disconnect(): void {
    this.socket.disconnect();
  }

  /** Re-authenticates (e.g. after the device token or admin cookie changed). */
  reconnect(): void {
    this.socket.disconnect();
    this.socket.connect();
  }

  get connected(): boolean {
    return this.socket.connected;
  }

  onReconnect(listener: () => void): () => void {
    this.reconnectListeners.add(listener);
    return () => this.reconnectListeners.delete(listener);
  }

  /** Emits with an ack; resolves `{ ok: false, error: { code: 'TIMEOUT' } }` if nothing comes back. */
  emit<E extends ClientEventName>(event: E, payload: ClientEventPayload<E>): Promise<Ack> {
    return new Promise((resolve) => {
      if (!this.socket.connected) {
        resolve({ ok: false, error: { code: 'DISCONNECTED', message: 'Not connected' } });
        return;
      }
      (this.socket as unknown as Socket)
        .timeout(ACK_TIMEOUT_MS)
        .emit(event as string, payload, (err: Error | null, ack?: Ack) => {
          if (err || !ack)
            resolve({ ok: false, error: { code: 'TIMEOUT', message: 'No reply from the server' } });
          else resolve(ack);
        });
    });
  }

  private async ping(): Promise<void> {
    if (!this.socket.connected) return;
    this.socket.emit('time:ping', { clientSentMs: Date.now() }, () => undefined);
  }

  private startSyncTimer(): void {
    this.stopSyncTimer();
    // A quick burst gives five samples for the median, then once a minute.
    let burst = 4;
    const burstTimer = setInterval(() => {
      void this.ping();
      burst -= 1;
      if (burst <= 0) clearInterval(burstTimer);
    }, 1500);
    this.syncTimer = setInterval(() => void this.ping(), TIME_SYNC_INTERVAL_MS);
  }

  private stopSyncTimer(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = null;
  }

  private armOfflineTimer(): void {
    if (this.offlineTimer) return;
    this.offlineTimer = setTimeout(() => {
      this.offlineTimer = null;
      if (!this.socket.connected) useLiveStore.getState().setStatus('offline');
    }, OFFLINE_AFTER_MS);
  }

  private clearOfflineTimer(): void {
    if (this.offlineTimer) clearTimeout(this.offlineTimer);
    this.offlineTimer = null;
  }
}

let instance: LiveSocket | null = null;

export function liveSocket(): LiveSocket {
  if (!instance) instance = new LiveSocket();
  return instance;
}
