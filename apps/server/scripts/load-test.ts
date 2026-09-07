/**
 * Load test (§4.6): 30 courts and 150 clients on one server.
 *
 *   DATABASE_URL=… LOAD_URL=http://localhost:3000 pnpm --filter @scoreboard/server load:test
 *
 * 1. Creates (or reuses) a "Load" format, 30 load courts, a session dated today with 30 fixtures
 *    in slot 1 (ad-hoc names) in the target database.
 * 2. Connects 30 controller sockets, 90 scoreboard sockets (3 per court) and 30 admin sockets.
 * 3. Goes live, starts the clock, then every controller taps +1 every 2 s for 30 s while every
 *    scoreboard records the delay between the tap's server ack and the broadcast arriving.
 * 4. Prints ack latency, broadcast propagation latency, clock broadcast fan-out and the spread
 *    of time offsets across clients.
 */
import { io, type Socket } from 'socket.io-client';
import { formatInTimeZone } from 'date-fns-tz';
import { loadConfig } from '../src/config.js';
import { createPrisma } from '../src/db/prisma.js';

const config = loadConfig();
const base = process.env.LOAD_URL ?? `http://localhost:${config.PORT}`;
const COURTS = Number(process.env.LOAD_COURTS ?? 30);
const BOARDS_PER_COURT = Number(process.env.LOAD_BOARDS ?? 3);
const ADMINS = Number(process.env.LOAD_ADMINS ?? 30);
const DURATION_MS = Number(process.env.LOAD_SECONDS ?? 30) * 1000;
const TAP_EVERY_MS = 2000;

type Ack = { ok: true; state?: unknown } | { ok: false; error: { code: string; message: string } };

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] as number;
}

async function prepare(): Promise<{
  sessionId: string;
  courtIds: string[];
  cleanup: () => Promise<void>;
}> {
  const db = createPrisma(config);
  const today = formatInTimeZone(new Date(), config.VENUE_TIMEZONE, 'yyyy-MM-dd');
  let format = await db.gameFormat.findFirst({ where: { name: 'Load' } });
  if (!format)
    format = await db.gameFormat.create({
      data: {
        name: 'Load',
        halfSeconds: 600,
        halfTimeSeconds: 30,
        betweenGamesSeconds: 30,
        timeoutSeconds: 60,
        colour: '#F87171',
      },
    });
  const courtIds: string[] = [];
  for (let i = 1; i <= COURTS; i++) {
    const name = `Load Court ${i}`;
    const court =
      (await db.court.findUnique({ where: { name } })) ??
      (await db.court.create({
        data: {
          name,
          displayOrder: 100 + i,
          supportedFormats: { create: [{ formatId: format.id }] },
        },
      }));
    courtIds.push(court.id);
  }
  await db.session.updateMany({ where: { status: 'LIVE' }, data: { status: 'COMPLETE' } });
  await db.clock.deleteMany({});
  const session = await db.session.create({
    data: {
      date: today,
      nightOfWeek: new Date().getDay(),
      firstSlotTime: '18:00',
      slotLengthMinutes: 22,
      slotCount: 1,
      linkShorterToLonger: false,
      published: false,
    },
  });
  await db.fixture.createMany({
    data: courtIds.map((courtId, i) => ({
      sessionId: session.id,
      formatId: format!.id,
      courtId,
      slotIndex: 0,
      homeName: `Home ${i + 1}`,
      awayName: `Away ${i + 1}`,
      status: 'SCHEDULED',
    })),
  });
  return {
    sessionId: session.id,
    courtIds,
    cleanup: async () => {
      await db.fixture.deleteMany({ where: { sessionId: session.id } });
      await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
      await db.$disconnect();
    },
  };
}

async function login(): Promise<string> {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: config.ADMIN_EMAIL, password: config.ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  return (res.headers.get('set-cookie') ?? '').split(';')[0] as string;
}

async function deviceToken(): Promise<string> {
  const res = await fetch(`${base}/api/auth/controller`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin: config.CONTROLLER_PIN, deviceName: 'load-test' }),
  });
  if (!res.ok) throw new Error(`pin exchange failed ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

function connect(opts: { cookie?: string; token?: string }): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(base, {
      transports: ['websocket'],
      auth: opts.token ? { deviceToken: opts.token } : undefined,
      extraHeaders: opts.cookie ? { cookie: opts.cookie } : undefined,
      reconnection: true,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

const emit = (socket: Socket, event: string, payload: Record<string, unknown>): Promise<Ack> =>
  new Promise((resolve) =>
    socket.emit(
      event,
      { actionId: `load-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, ...payload },
      resolve,
    ),
  );

async function main(): Promise<void> {
  const prep = await prepare();
  const sockets: Socket[] = [];
  try {
    const cookie = await login();
    const token = await deviceToken();
    const started = Date.now();

    const admins: Socket[] = [];
    for (let i = 0; i < ADMINS; i++) {
      const s = await connect({ cookie });
      await emit(s, 'admin:join', {});
      admins.push(s);
      sockets.push(s);
    }
    const controllers: Socket[] = [];
    for (const courtId of prep.courtIds) {
      const s = await connect({ token });
      await emit(s, 'court:join', { courtId, role: 'CONTROLLER' });
      controllers.push(s);
      sockets.push(s);
    }
    const boards: Array<{ socket: Socket; courtId: string }> = [];
    for (const courtId of prep.courtIds) {
      for (let b = 0; b < BOARDS_PER_COURT; b++) {
        const s = await connect({});
        await emit(s, 'court:join', { courtId, role: 'SCOREBOARD' });
        boards.push({ socket: s, courtId });
        sockets.push(s);
      }
    }
    console.log(
      `connected ${sockets.length} clients in ${Date.now() - started} ms (${ADMINS} admin, ${controllers.length} controllers, ${boards.length} scoreboards)`,
    );

    // Time sync spread: each client pings once; offsets should agree within 100 ms.
    const offsets: number[] = [];
    await Promise.all(
      sockets.map(
        (s) =>
          new Promise<void>((resolve) => {
            const sent = Date.now();
            s.once('time:pong', (p: { serverNowMs: number }) => {
              const rtt = Date.now() - sent;
              offsets.push(p.serverNowMs - (sent + rtt / 2));
              resolve();
            });
            s.emit('time:ping', { clientSentMs: sent }, () => undefined);
          }),
      ),
    );
    const offsetSpread = Math.max(...offsets) - Math.min(...offsets);

    // Broadcast propagation: scoreboards stamp arrival of court:state by version.
    const arrivals = new Map<string, number[]>(); // `${courtId}:${version}` → arrival times
    for (const { socket, courtId } of boards) {
      socket.on('court:state', (state: { courtId: string; version: number }) => {
        if (state.courtId !== courtId) return;
        const key = `${courtId}:${state.version}`;
        arrivals.set(key, [...(arrivals.get(key) ?? []), Date.now()]);
      });
    }
    const clockArrivals: number[] = [];
    let clockBroadcastAt = 0;
    for (const s of sockets)
      s.on('clock:state', () => clockArrivals.push(Date.now() - clockBroadcastAt));

    const admin = admins[0] as Socket;
    const current = (await emit(admin, 'admin:join', {})) as {
      ok: true;
      state: { session: { sessionId: string } | null };
    };
    if (current.state.session)
      await emit(admin, 'session:end', { sessionId: current.state.session.sessionId });
    const live = await emit(admin, 'session:goLive', { sessionId: prep.sessionId });
    if (!live.ok) throw new Error(`goLive failed: ${live.error.message}`);
    const snap = (await emit(admin, 'admin:join', {})) as {
      ok: true;
      state: { clocks: Array<{ id: string }> };
    };
    const clockId = snap.state.clocks[0]?.id as string;
    clockBroadcastAt = Date.now();
    clockArrivals.length = 0;
    const startAck = await emit(admin, 'clock:start', { clockId });
    if (!startAck.ok) throw new Error(`start failed: ${startAck.error.message}`);
    await new Promise((r) => setTimeout(r, 1500));
    const clockFanout = {
      p50: percentile(clockArrivals, 50),
      p95: percentile(clockArrivals, 95),
      max: Math.max(0, ...clockArrivals),
      received: clockArrivals.length,
    };

    // Score taps.
    const ackLatencies: number[] = [];
    const propagation: number[] = [];
    const errors: string[] = [];
    const endAt = Date.now() + DURATION_MS;
    let taps = 0;
    while (Date.now() < endAt) {
      await Promise.all(
        controllers.map(async (s, i) => {
          const courtId = prep.courtIds[i] as string;
          const sent = Date.now();
          const ack = (await emit(s, 'controller:score', {
            courtId,
            team: i % 2 === 0 ? 'HOME' : 'AWAY',
            delta: 1,
          })) as Ack & { state?: { version: number } };
          const acked = Date.now();
          taps += 1;
          if (!ack.ok) {
            errors.push(ack.error.message);
            return;
          }
          ackLatencies.push(acked - sent);
          const version = ack.state?.version as number;
          // Give broadcasts a moment to land, then measure arrival relative to the tap.
          setTimeout(() => {
            for (const t of arrivals.get(`${courtId}:${version}`) ?? []) propagation.push(t - sent);
          }, 600);
        }),
      );
      await new Promise((r) => setTimeout(r, TAP_EVERY_MS));
    }
    await new Promise((r) => setTimeout(r, 1000));

    const expectedBroadcasts = ackLatencies.length * BOARDS_PER_COURT;
    console.log('\n=== Load test report ===');
    console.log(
      `clients: ${sockets.length} · courts: ${COURTS} · taps: ${taps} · errors: ${errors.length}${errors.length ? ` (${[...new Set(errors)].join('; ')})` : ''}`,
    );
    console.log(
      `score ack latency   p50 ${percentile(ackLatencies, 50)} ms · p95 ${percentile(ackLatencies, 95)} ms · max ${Math.max(0, ...ackLatencies)} ms`,
    );
    console.log(
      `tap → scoreboard    p50 ${percentile(propagation, 50)} ms · p95 ${percentile(propagation, 95)} ms · max ${Math.max(0, ...propagation)} ms · received ${propagation.length}/${expectedBroadcasts}`,
    );
    console.log(
      `clock start fan-out p50 ${clockFanout.p50} ms · p95 ${clockFanout.p95} ms · max ${clockFanout.max} ms · received ${clockFanout.received}`,
    );
    console.log(
      `time offset spread across ${offsets.length} clients: ${offsetSpread.toFixed(1)} ms`,
    );
    const mem = process.memoryUsage();
    console.log(`client process rss ${(mem.rss / 1048576).toFixed(0)} MB`);
    await emit(admin, 'session:end', { sessionId: prep.sessionId });
    const pass = percentile(propagation, 95) <= 250 && offsetSpread <= 100 && errors.length === 0;
    console.log(
      pass
        ? 'RESULT: PASS (p95 propagation ≤ 250 ms, offset spread ≤ 100 ms, no errors)'
        : 'RESULT: CHECK — targets not met',
    );
  } finally {
    for (const s of sockets) s.disconnect();
    await prep.cleanup();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
