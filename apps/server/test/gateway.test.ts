import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import {
  type Ack,
  type ClockState,
  type CourtLiveState,
  type LiveSnapshot,
} from '@scoreboard/shared';
import { createTestContext, seedLiveNight, type TestContext } from './helpers.js';

interface Connected {
  socket: Socket;
  /** The app:version announcement, captured before the connect event can race it. */
  version: Promise<{ version: string }>;
}

function connect(
  url: string,
  opts: { deviceToken?: string; cookie?: string } = {},
): Promise<Connected> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(url, {
      transports: ['websocket'],
      auth: opts.deviceToken ? { deviceToken: opts.deviceToken } : undefined,
      extraHeaders: opts.cookie ? { cookie: opts.cookie } : undefined,
      reconnection: false,
    });
    const version = new Promise<{ version: string }>((res) => socket.once('app:version', res));
    socket.once('connect', () => resolve({ socket, version }));
    socket.once('connect_error', reject);
  });
}

function emitAck<T = unknown>(socket: Socket, event: string, payload: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => socket.emit(event, payload, (ack: Ack<T>) => resolve(ack)));
}

function waitFor<T>(
  socket: Socket,
  event: string,
  predicate: (payload: T) => boolean = () => true,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    const handler = (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

describe('socket gateway', () => {
  let ctx: TestContext;
  let url: string;
  let night: Awaited<ReturnType<typeof seedLiveNight>>;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    ctx = await createTestContext({ startMs: Date.now() });
    ctx.clock.nowMs = Date.now();
    night = await seedLiveNight(ctx.db);
    await ctx.app.listen({ port: 0, host: '127.0.0.1' });
    const address = ctx.app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    url = `http://127.0.0.1:${port}`;
    await ctx.app.services.live.start();
  });
  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await ctx.close();
  });

  it('answers time pings and announces the app version', async () => {
    const { socket, version } = await connect(url);
    sockets.push(socket);
    expect((await version).version).toBe(ctx.config.APP_VERSION);
    const sent = Date.now();
    const pong = waitFor<{ clientSentMs: number; serverNowMs: number }>(socket, 'time:pong');
    await emitAck(socket, 'time:ping', { clientSentMs: sent });
    expect((await pong).clientSentMs).toBe(sent);
  });

  it('rejects invalid payloads and unauthenticated admin events with typed acks', async () => {
    const { socket } = await connect(url);
    sockets.push(socket);
    const bad = await emitAck(socket, 'court:join', { courtId: 'nope' });
    expect(bad).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    const denied = await emitAck(socket, 'session:goLive', {
      actionId: 'abcdefghij',
      sessionId: night.session.id,
    });
    expect(denied).toMatchObject({ ok: false, error: { code: 'AUTH' } });
    const scoreDenied = await emitAck(socket, 'controller:score', {
      actionId: 'abcdefghij',
      courtId: night.court1.id,
      team: 'HOME',
      delta: 1,
    });
    expect(scoreDenied).toMatchObject({ ok: false, error: { code: 'AUTH' } });
  });

  it('runs a scoreboard/controller/admin flow end to end with idempotent actions', async () => {
    const admin = (await connect(url, { cookie: ctx.admin.cookie })).socket;
    const controller = (await connect(url, { deviceToken: ctx.controllerToken })).socket;
    const scoreboard = (await connect(url)).socket;
    sockets.push(admin, controller, scoreboard);

    const adminJoin = await emitAck<LiveSnapshot>(admin, 'admin:join', {});
    expect(adminJoin.ok).toBe(true);

    const goLive = await emitAck(admin, 'session:goLive', {
      actionId: 'golive-0001',
      sessionId: night.session.id,
    });
    expect(goLive).toMatchObject({ ok: true, state: { status: 'LIVE' } });

    const boardJoin = await emitAck<LiveSnapshot>(scoreboard, 'court:join', {
      courtId: night.court1.id,
      role: 'SCOREBOARD',
    });
    expect(boardJoin.ok).toBe(true);
    if (!boardJoin.ok) return;
    expect(boardJoin.state?.courts[0]?.current?.homeName).toBe('F1');
    expect(boardJoin.state?.clocks.length).toBeGreaterThan(0);

    const controllerJoin = await emitAck<LiveSnapshot>(controller, 'court:join', {
      courtId: night.court1.id,
      role: 'CONTROLLER',
    });
    expect(controllerJoin.ok).toBe(true);
    const foursClockId = (controllerJoin.ok &&
      controllerJoin.state?.clocks.find((c) => c.formatId === night.fours.id)?.id) as string;

    const wrongCourt = await emitAck(controller, 'controller:score', {
      actionId: 'wrong-court-1',
      courtId: night.court2.id,
      team: 'HOME',
      delta: 1,
    });
    expect(wrongCourt).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });

    const notLive = await emitAck(controller, 'controller:score', {
      actionId: 'not-live-001',
      courtId: night.court1.id,
      team: 'HOME',
      delta: 1,
    });
    expect(notLive).toMatchObject({ ok: false, error: { code: 'RULE_VIOLATION' } });

    const clockOnBoard = waitFor<ClockState>(
      scoreboard,
      'clock:state',
      (c) => c.phase === 'HALF_1',
    );
    const start = await emitAck<ClockState>(admin, 'clock:start', {
      actionId: 'start-00001',
      clockId: foursClockId,
    });
    expect(start).toMatchObject({ ok: true, state: { phase: 'HALF_1' } });
    expect((await clockOnBoard).status).toBe('RUNNING');

    const scored = waitFor<CourtLiveState>(scoreboard, 'court:state', (c) => c.homeScore === 1);
    const first = await emitAck<CourtLiveState>(controller, 'controller:score', {
      actionId: 'score-000001',
      courtId: night.court1.id,
      team: 'HOME',
      delta: 1,
    });
    expect(first).toMatchObject({ ok: true, state: { homeScore: 1 } });
    expect((await scored).homeScore).toBe(1);

    const retry = await emitAck<CourtLiveState>(controller, 'controller:score', {
      actionId: 'score-000001',
      courtId: night.court1.id,
      team: 'HOME',
      delta: 1,
    });
    expect(retry).toMatchObject({ ok: true, state: { homeScore: 1 } });
    expect(ctx.app.services.live.getCourt(night.court1.id)?.homeScore).toBe(1);

    const timeout = await emitAck<CourtLiveState>(controller, 'controller:timeout', {
      actionId: 'timeout-0001',
      courtId: night.court1.id,
      team: 'AWAY',
    });
    expect(timeout).toMatchObject({
      ok: true,
      state: { timeout: { active: true, calledBy: 'AWAY' } },
    });
    const endTimeout = await emitAck<CourtLiveState>(controller, 'controller:endTimeout', {
      actionId: 'timeout-end1',
      courtId: night.court1.id,
    });
    expect(endTimeout).toMatchObject({ ok: true, state: { timeout: { active: false } } });

    const adminScore = await emitAck<CourtLiveState>(admin, 'court:setScore', {
      actionId: 'setscore-001',
      courtId: night.court1.id,
      homeScore: 5,
      awayScore: 3,
    });
    expect(adminScore).toMatchObject({ ok: true, state: { homeScore: 5, awayScore: 3 } });

    const ended = await emitAck<CourtLiveState>(admin, 'court:endGame', {
      actionId: 'endgame-0001',
      courtId: night.court1.id,
    });
    expect(ended).toMatchObject({ ok: true, state: { current: { status: 'COMPLETED' } } });
    const fixture = await ctx.db.fixture.findUniqueOrThrow({
      where: { id: night.fixtures.fours0.id },
    });
    expect(fixture).toMatchObject({ status: 'COMPLETED', homeScore: 5, awayScore: 3 });

    const audit = await ctx.db.auditLog.findMany({ where: { action: 'score.change' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.deviceId).not.toBeNull();

    const end = await emitAck(admin, 'session:end', {
      actionId: 'end-session-1',
      sessionId: night.session.id,
    });
    expect(end.ok).toBe(true);
  });
});
