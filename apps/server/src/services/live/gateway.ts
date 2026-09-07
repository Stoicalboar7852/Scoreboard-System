import { type FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import {
  ADMIN_EVENTS,
  ADMIN_ROOM,
  CLIENT_EVENTS,
  CONTROLLER_EVENTS,
  clockRoom,
  courtRoom,
  sessionRoom,
  type Ack,
  type ClientEventName,
  type ClientEventPayload,
  type ClientToServerEvents,
  type ClockState,
  type CourtLiveState,
  type ServerToClientEvents,
  type SessionLiveState,
} from '@scoreboard/shared';
import { type z } from 'zod';
import { AppError, toErrorBody } from '../../errors.js';
import { SESSION_COOKIE, readBearer } from '../../plugins/auth.js';
import { type AdminIdentity, type DeviceIdentity } from '../auth.service.js';
import { type Services } from '../index.js';

interface SocketData {
  admin: AdminIdentity | null;
  device: DeviceIdentity | null;
  courtId: string | null;
  role: 'CONTROLLER' | 'SCOREBOARD' | null;
}

type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
export type AppIo = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

const HEARTBEAT_MS = 20_000;

/**
 * Socket.IO gateway: authenticates handshakes, validates every payload with the shared
 * Zod schemas, replies with acks, joins rooms with snapshots and fans out live state.
 */
export function attachGateway(app: FastifyInstance, s: Services): AppIo {
  const io: AppIo = new Server(app.server, {
    path: '/socket.io',
    cors: { origin: s.config.APP_ORIGIN, credentials: true },
    pingInterval: 10_000,
    pingTimeout: 8_000,
    transports: ['websocket', 'polling'],
  });
  const live = s.live;

  // ---- fan-out -------------------------------------------------------------------------
  live.events.on('court', (state: CourtLiveState) => {
    io.to(courtRoom(state.courtId)).to(ADMIN_ROOM).emit('court:state', state);
    if (state.sessionId) io.to(sessionRoom(state.sessionId)).emit('court:state', state);
  });
  live.events.on('clock', (state: ClockState) => {
    const rooms = [
      clockRoom(state.id),
      ADMIN_ROOM,
      sessionRoom(state.sessionId),
      ...live.courtsFollowingClock(state.id).map(courtRoom),
    ];
    io.to(rooms).emit('clock:state', state);
    io.to(ADMIN_ROOM).emit('live:warnings', live.warnings(state.sessionId));
  });
  live.events.on('session', (state: SessionLiveState) => {
    io.to(ADMIN_ROOM).to(sessionRoom(state.sessionId)).emit('session:state', state);
    for (const courtId of state.courtIds) io.to(courtRoom(courtId)).emit('session:state', state);
    io.to(ADMIN_ROOM).emit('live:warnings', live.warnings(state.sessionId));
  });

  // ---- auth on handshake -----------------------------------------------------------------
  io.use((socket, next) => {
    void (async () => {
      const data: SocketData = { admin: null, device: null, courtId: null, role: null };
      try {
        const cookieHeader = socket.request.headers.cookie ?? '';
        const match = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(cookieHeader);
        if (match?.[1]) {
          const unsigned = app.unsignCookie(decodeURIComponent(match[1]));
          if (unsigned.valid && unsigned.value)
            data.admin = await s.auth.resolveSession(unsigned.value);
        }
        const auth = socket.handshake.auth as { deviceToken?: string } | undefined;
        const token = auth?.deviceToken ?? readBearer(socket.request.headers.authorization);
        if (token) data.device = await s.auth.resolveDevice(token);
        socket.data = data;
        next();
      } catch (err) {
        app.log.error({ err }, 'socket auth failed');
        socket.data = data;
        next();
      }
    })();
  });

  const heartbeat = setInterval(() => {
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.courtId && socket.data.role) live.seen(socket.data.courtId, socket.data.role);
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();
  app.addHook('onClose', async () => {
    clearInterval(heartbeat);
    await io.close();
  });

  // ---- handlers ----------------------------------------------------------------------------
  io.on('connection', (socket: AppSocket) => {
    socket.emit('app:version', { version: s.config.APP_VERSION });

    const handle = <E extends ClientEventName>(
      event: E,
      fn: (payload: ClientEventPayload<E>) => Promise<unknown>,
    ): void => {
      (socket as unknown as Socket).on(
        event as string,
        ((rawPayload: unknown, ack?: (response: Ack) => void) => {
          const reply = (response: Ack): void => {
            if (typeof ack === 'function') ack(response);
          };
          void (async () => {
            const schema = CLIENT_EVENTS[event] as z.ZodTypeAny;
            const parsed = schema.safeParse(rawPayload);
            if (!parsed.success) {
              reply({
                ok: false,
                error: {
                  code: 'VALIDATION',
                  message: 'Invalid payload',
                  details: parsed.error.issues.map((i) => ({
                    path: i.path.join('.'),
                    message: i.message,
                  })),
                },
              });
              return;
            }
            const payload = parsed.data as ClientEventPayload<E>;
            if (ADMIN_EVENTS.has(event) && !socket.data.admin) {
              reply({ ok: false, error: { code: 'AUTH', message: 'Admin login required' } });
              return;
            }
            if (CONTROLLER_EVENTS.has(event)) {
              if (!socket.data.device && !socket.data.admin) {
                reply({
                  ok: false,
                  error: { code: 'AUTH', message: 'Controller device token required' },
                });
                return;
              }
              const courtId = (payload as { courtId?: string }).courtId;
              if (socket.data.device && courtId && socket.data.courtId !== courtId) {
                reply({
                  ok: false,
                  error: { code: 'FORBIDDEN', message: 'This device is not joined to that court' },
                });
                return;
              }
            }
            const actionId = (payload as { actionId?: string }).actionId;
            if (actionId) {
              const cached = live.actions.get(actionId);
              if (cached) {
                reply(cached);
                return;
              }
            }
            try {
              const state = await fn(payload);
              const response: Ack = { ok: true, state };
              if (actionId) live.actions.set(actionId, response);
              reply(response);
            } catch (err) {
              const { body } = toErrorBody(err);
              const response: Ack = { ok: false, error: body.error };
              if (actionId && err instanceof AppError && err.code !== 'INTERNAL')
                live.actions.set(actionId, response);
              if (!(err instanceof AppError))
                app.log.error({ err, event }, 'socket handler failed');
              reply(response);
            }
          })();
        }) as never,
      );
    };

    const actor = (): string =>
      socket.data.admin?.email ??
      (socket.data.device ? `device:${socket.data.device.deviceName}` : 'anonymous');
    const deviceId = (): string | null => socket.data.device?.deviceId ?? null;

    handle('time:ping', async ({ clientSentMs }) => {
      socket.emit('time:pong', { clientSentMs, serverNowMs: s.now() });
      return null;
    });

    handle('court:join', async ({ courtId, role }) => {
      // Record the court before any await: a controller re-joining after a reconnect replays
      // its queued taps straight after this packet, and those are checked against socket.data.
      const previous = socket.data.courtId;
      socket.data.courtId = courtId;
      socket.data.role = role;
      const court = await live.ensureCourt(courtId);
      if (!court) {
        socket.data.courtId = previous;
        throw new AppError('NOT_FOUND', 404, `Court ${courtId} not found`);
      }
      if (previous && previous !== courtId) await socket.leave(courtRoom(previous));
      await socket.join(courtRoom(courtId));
      live.seen(courtId, role);
      if (role === 'CONTROLLER' && socket.data.device)
        await s.auth.touchDevice(socket.data.device.deviceId, courtId);
      const snapshot = live.snapshot({ courtId });
      socket.emit('live:snapshot', snapshot);
      return snapshot;
    });

    handle('court:leave', async ({ courtId }) => {
      // Clear before any await so a join → leave → join sequence resolves in packet order.
      if (socket.data.courtId === courtId) {
        socket.data.courtId = null;
        socket.data.role = null;
      }
      await socket.leave(courtRoom(courtId));
      return null;
    });

    handle('session:join', async ({ sessionId }) => {
      await socket.join(sessionRoom(sessionId));
      const snapshot = live.snapshot({ sessionId });
      socket.emit('live:snapshot', snapshot);
      return snapshot;
    });

    handle('admin:join', async () => {
      await socket.join(ADMIN_ROOM);
      const snapshot = live.snapshot();
      socket.emit('live:snapshot', snapshot);
      socket.emit('live:warnings', live.warnings());
      return snapshot;
    });

    handle('controller:score', async ({ courtId, team, delta, actionId }) => {
      const state = await live.score(courtId, team, delta);
      live.seen(courtId, 'CONTROLLER');
      await s.audit.record({
        actor: actor(),
        deviceId: deviceId(),
        action: 'score.change',
        payload: {
          courtId,
          team,
          delta,
          actionId,
          homeScore: state.homeScore,
          awayScore: state.awayScore,
          fixtureId: state.currentFixtureId,
        },
      });
      return state;
    });
    handle('controller:timeout', async ({ courtId, team }) => {
      const state = await live.callTimeout(courtId, team ?? null);
      await s.audit.record({
        actor: actor(),
        deviceId: deviceId(),
        action: 'timeout.call',
        payload: { courtId, team: team ?? null, fixtureId: state.currentFixtureId },
      });
      return state;
    });
    handle('controller:endTimeout', async ({ courtId }) => {
      const state = await live.endTimeout(courtId);
      await s.audit.record({
        actor: actor(),
        deviceId: deviceId(),
        action: 'timeout.end',
        payload: { courtId },
      });
      return state;
    });

    const clockAction = (
      event:
        | 'clock:start'
        | 'clock:pause'
        | 'clock:resume'
        | 'clock:skipPhase'
        | 'clock:reset'
        | 'clock:endGame',
      action: Parameters<typeof live.clockAction>[1],
    ) =>
      handle(event, async ({ clockId }) => {
        const state = await live.clockAction(clockId, action);
        await s.audit.record({
          actor: actor(),
          action: event,
          payload: { clockId, phase: state.phase, slotIndex: state.slotIndex },
        });
        return state;
      });
    clockAction('clock:start', 'start');
    clockAction('clock:pause', 'pause');
    clockAction('clock:resume', 'resume');
    clockAction('clock:skipPhase', 'skipPhase');
    clockAction('clock:reset', 'reset');
    clockAction('clock:endGame', 'endGame');
    handle('clock:adjust', async ({ clockId, deltaSeconds }) => {
      const state = await live.clockAdjust(clockId, deltaSeconds);
      await s.audit.record({
        actor: actor(),
        action: 'clock:adjust',
        payload: { clockId, deltaSeconds },
      });
      return state;
    });
    handle('clock:setMode', async ({ clockId, mode }) => {
      const state = await live.clockSetMode(clockId, mode);
      await s.audit.record({ actor: actor(), action: 'clock:setMode', payload: { clockId, mode } });
      return state;
    });
    handle('clock:setLink', async ({ clockId, linkedClockId }) => {
      const state = await live.clockSetLink(clockId, linkedClockId);
      await s.audit.record({
        actor: actor(),
        action: 'clock:setLink',
        payload: { clockId, linkedClockId },
      });
      return state;
    });

    handle('court:assignFixture', async ({ courtId, fixtureId }) => {
      const state = await live.assignFixture(courtId, fixtureId);
      await s.audit.record({
        actor: actor(),
        action: 'court:assignFixture',
        payload: { courtId, fixtureId },
      });
      return state;
    });
    handle('court:quickGame', async ({ courtId, homeName, awayName, formatId }) => {
      const state = await live.quickGame(courtId, homeName, awayName, formatId);
      await s.audit.record({
        actor: actor(),
        action: 'court:quickGame',
        payload: { courtId, homeName, awayName, formatId },
      });
      return state;
    });
    handle('court:setScore', async ({ courtId, homeScore, awayScore }) => {
      const state = await live.setScore(courtId, homeScore, awayScore);
      await s.audit.record({
        actor: actor(),
        action: 'court:setScore',
        payload: { courtId, homeScore, awayScore, fixtureId: state.currentFixtureId },
      });
      return state;
    });
    handle('court:endGame', async ({ courtId }) => {
      const state = await live.endGame(courtId);
      await s.audit.record({
        actor: actor(),
        action: 'court:endGame',
        payload: {
          courtId,
          fixtureId: state.currentFixtureId,
          homeScore: state.homeScore,
          awayScore: state.awayScore,
        },
      });
      return state;
    });
    handle('court:reopenGame', async ({ courtId }) => {
      const state = await live.reopenGame(courtId);
      await s.audit.record({
        actor: actor(),
        action: 'court:reopenGame',
        payload: { courtId, fixtureId: state.currentFixtureId },
      });
      return state;
    });

    handle('session:goLive', async ({ sessionId }) => {
      const state = await live.goLive(sessionId);
      await s.audit.record({ actor: actor(), action: 'session:goLive', payload: { sessionId } });
      return state;
    });
    handle('session:end', async ({ sessionId }) => {
      await live.endSession(sessionId);
      await s.audit.record({ actor: actor(), action: 'session:end', payload: { sessionId } });
      return null;
    });
    handle('session:advanceSlot', async ({ clockId }) => {
      const state = await live.clockAction(clockId, 'advanceSlot');
      await s.audit.record({
        actor: actor(),
        action: 'session:advanceSlot',
        payload: { clockId, slotIndex: state.slotIndex },
      });
      return state;
    });
    handle('session:setLinkFlag', async ({ sessionId, linkShorterToLonger }) => {
      const state = await live.setLinkFlag(sessionId, linkShorterToLonger);
      await s.audit.record({
        actor: actor(),
        action: 'session:setLinkFlag',
        payload: { sessionId, linkShorterToLonger },
      });
      return state;
    });
  });

  return io;
}
