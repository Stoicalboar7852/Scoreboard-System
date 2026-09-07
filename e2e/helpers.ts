import { type APIRequestContext, type Page } from '@playwright/test';
import { io } from 'socket.io-client';

export const ADMIN = {
  email: process.env.ADMIN_EMAIL ?? 'admin@example.com',
  password: process.env.ADMIN_PASSWORD ?? 'admin-local-dev',
};
export const PIN = process.env.CONTROLLER_PIN ?? '1234';

/** Logs in through the API and returns the raw session cookie ("sb_session=…"). */
export async function adminCookie(request: APIRequestContext, baseURL: string): Promise<string> {
  const res = await request.post(`${baseURL}/api/auth/login`, { data: ADMIN });
  if (!res.ok()) throw new Error(`login failed: ${res.status()} ${await res.text()}`);
  const header = res.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie')?.value ?? '';
  return header.split(';')[0] as string;
}

type Ack = { ok: true; state?: unknown } | { ok: false; error: { code: string; message: string } };

/** Admin socket helper for driving the night from a test. */
export async function adminSocket(baseURL: string, cookie: string) {
  const socket = io(baseURL, { transports: ['websocket'], extraHeaders: { cookie } });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  const emit = (event: string, payload: Record<string, unknown>): Promise<Ack> =>
    new Promise((resolve) =>
      socket.emit(
        event,
        { actionId: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, ...payload },
        resolve,
      ),
    );
  return {
    emit,
    async snapshot() {
      const ack = await emit('admin:join', {});
      if (!ack.ok) throw new Error(ack.error.message);
      return ack.state as {
        session: { sessionId: string; status: string } | null;
        clocks: Array<{ id: string; label: string; phase: string; formatId: string | null }>;
        courts: Array<{
          courtId: string;
          courtName: string;
          clockId: string | null;
          current: { status: string; homeName: string; awayName: string } | null;
          homeScore: number;
          awayScore: number;
        }>;
      };
    },
    close: () => socket.disconnect(),
  };
}

/** Puts a court live: ends any live session, goes live with today's, starts every clock. */
export async function startTonight(request: APIRequestContext, baseURL: string) {
  const cookie = await adminCookie(request, baseURL);
  const admin = await adminSocket(baseURL, cookie);
  const before = await admin.snapshot();
  if (before.session) await admin.emit('session:end', { sessionId: before.session.sessionId });
  const today = (await (
    await request.get(`${baseURL}/api/sessions/today`, { headers: { cookie } })
  ).json()) as { date: string; sessions: Array<{ id: string }> };
  const sessionId = today.sessions[0]?.id;
  if (!sessionId) throw new Error(`no seeded session for ${today.date}`);
  const live = await admin.emit('session:goLive', { sessionId });
  if (!live.ok) throw new Error(live.error.message);
  const snap = await admin.snapshot();
  for (const clock of snap.clocks) {
    const started = await admin.emit('clock:start', { clockId: clock.id });
    if (!started.ok) throw new Error(started.error.message);
  }
  const after = await admin.snapshot();
  const court = after.courts.find((c) => c.current?.status === 'LIVE');
  if (!court) throw new Error('no court has a live fixture');
  return { admin, cookie, sessionId, court };
}

/** Registers the browser page as a controller device by typing the PIN on the PIN gate. */
export async function enterPin(page: Page): Promise<void> {
  for (const digit of PIN) await page.getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: 'OK' }).click();
}
