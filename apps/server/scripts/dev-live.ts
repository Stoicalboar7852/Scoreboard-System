/**
 * Developer helper: drive tonight's live session from the terminal.
 *   pnpm --filter @scoreboard/server dev:live status
 *   pnpm --filter @scoreboard/server dev:live go       # go live with today's session and start every clock
 *   pnpm --filter @scoreboard/server dev:live end      # end the live session
 * Uses ADMIN_EMAIL / ADMIN_PASSWORD from .env against http://localhost:PORT.
 */
import { io } from 'socket.io-client';
import { loadConfig } from '../src/config.js';

const config = loadConfig();
const base = process.env.DEV_LIVE_URL ?? `http://localhost:${config.PORT}`;
const command = process.argv[2] ?? 'status';

async function main(): Promise<void> {
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: config.ADMIN_EMAIL, password: config.ADMIN_PASSWORD }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status} ${await login.text()}`);
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] as string;
  const socket = io(base, { transports: ['websocket'], extraHeaders: { cookie } });
  const emit = (
    event: string,
    payload: unknown,
  ): Promise<{ ok: boolean; state?: unknown; error?: { message: string } }> =>
    new Promise((resolve) => socket.emit(event, payload, resolve));
  await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
  const snapshot = await emit('admin:join', {});
  const state = snapshot.state as {
    session: { sessionId: string; status: string; date: string } | null;
    clocks: Array<{ id: string; label: string; phase: string; status: string; slotIndex: number }>;
  };

  if (command === 'status') {
    console.log(
      'session:',
      state.session ? `${state.session.date} ${state.session.status}` : 'none live',
    );
    for (const c of state.clocks)
      console.log(`clock ${c.label}: ${c.phase} ${c.status} slot ${c.slotIndex + 1}`);
  } else if (command === 'go') {
    const today = (await fetch(`${base}/api/sessions/today`, { headers: { cookie } }).then((r) =>
      r.json(),
    )) as { date: string; sessions: Array<{ id: string }> };
    const sessionId = today.sessions[0]?.id;
    if (!sessionId) throw new Error(`no session for ${today.date}; run pnpm seed`);
    const live = await emit('session:goLive', { actionId: `dev-golive-${Date.now()}`, sessionId });
    if (!live.ok) throw new Error(live.error?.message);
    const after = (await emit('admin:join', {})).state as typeof state;
    for (const c of after.clocks) {
      const started = await emit('clock:start', {
        actionId: `dev-start-${c.id}-${Date.now()}`,
        clockId: c.id,
      });
      console.log(`start ${c.label}:`, started.ok ? 'HALF_1' : started.error?.message);
    }
  } else if (command === 'end') {
    if (!state.session) throw new Error('no live session');
    const ended = await emit('session:end', {
      actionId: `dev-end-${Date.now()}`,
      sessionId: state.session.sessionId,
    });
    console.log('ended:', ended.ok ? state.session.date : ended.error?.message);
  } else {
    throw new Error(`unknown command ${command}`);
  }
  socket.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
