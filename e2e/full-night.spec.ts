import { expect, test, type APIRequestContext } from '@playwright/test';
import { adminCookie, adminSocket } from './helpers.js';

/**
 * §11: a whole night in AUTO mode with linked clocks. Uses throw-away formats with 3-second
 * halves so two slots of Fours + Pairs finish in well under a minute.
 */
async function setupNight(request: APIRequestContext, base: string, cookie: string) {
  const post = async <T>(
    url: string,
    data: unknown,
    method: 'post' | 'put' = 'post',
  ): Promise<T> => {
    const res = await request[method](`${base}${url}`, { data, headers: { cookie } });
    if (!res.ok()) throw new Error(`${url}: ${res.status()} ${await res.text()}`);
    return (await res.json()) as T;
  };
  const long = await post<{ id: string }>('/api/formats', {
    name: `E2E Long ${Date.now()}`,
    halfSeconds: 4,
    halfTimeSeconds: 1,
    betweenGamesSeconds: 2,
    timeoutSeconds: 60,
    colour: '#38BDF8',
  });
  const short = await post<{ id: string }>('/api/formats', {
    name: `E2E Short ${Date.now()}`,
    halfSeconds: 2,
    halfTimeSeconds: 1,
    betweenGamesSeconds: 2,
    timeoutSeconds: 60,
    colour: '#A78BFA',
  });
  const courts = (await (
    await request.get(`${base}/api/courts`, { headers: { cookie } })
  ).json()) as Array<{ id: string; name: string }>;
  const [c1, c2] = courts as [{ id: string }, { id: string }];
  const season = await post<{ id: string }>('/api/seasons', {
    name: `E2E ${Date.now()}`,
    startDate: '2026-01-05',
    regularWeeks: 2,
  });
  const compLong = await post<{ id: string }>('/api/competitions', {
    seasonId: season.id,
    name: 'E2E Fours',
    nightOfWeek: 1,
    formatId: long.id,
    published: true,
  });
  const compShort = await post<{ id: string }>('/api/competitions', {
    seasonId: season.id,
    name: 'E2E Pairs',
    nightOfWeek: 1,
    formatId: short.id,
    published: true,
  });
  const team = (competitionId: string, name: string) =>
    post<{ id: string }>('/api/teams', { competitionId, name, colour: null });
  const [l1, l2, l3, l4] = await Promise.all(
    ['L1', 'L2', 'L3', 'L4'].map((n) => team(compLong.id, n)),
  );
  const [s1, s2, s3, s4] = await Promise.all(
    ['S1', 'S2', 'S3', 'S4'].map((n) => team(compShort.id, n)),
  );
  // Tomorrow's date so it never collides with the seeded session, and end any live session first.
  const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const session = await post<{ id: string }>('/api/sessions', {
    seasonId: season.id,
    date,
    firstSlotTime: '18:00',
    slotLengthMinutes: 1,
    slotCount: 2,
    linkShorterToLonger: true,
    published: true,
  });
  const grid = await request.put(`${base}/api/sessions/${session.id}/grid`, {
    data: {
      slotCount: 2,
      fixtures: [
        {
          competitionId: compLong.id,
          homeTeamId: l1!.id,
          awayTeamId: l2!.id,
          slotIndex: 0,
          courtId: c1.id,
        },
        {
          competitionId: compLong.id,
          homeTeamId: l3!.id,
          awayTeamId: l4!.id,
          slotIndex: 1,
          courtId: c1.id,
        },
        {
          competitionId: compShort.id,
          homeTeamId: s1!.id,
          awayTeamId: s2!.id,
          slotIndex: 0,
          courtId: c2.id,
        },
        {
          competitionId: compShort.id,
          homeTeamId: s3!.id,
          awayTeamId: s4!.id,
          slotIndex: 1,
          courtId: c2.id,
        },
      ],
    },
    headers: { cookie },
  });
  if (!grid.ok()) throw new Error(`grid: ${grid.status()} ${await grid.text()}`);
  return {
    session,
    long,
    short,
    courts: { c1, c2 },
    compLong,
    compShort,
    cleanup: async () => {
      await request.delete(`${base}/api/seasons/${season.id}`, { headers: { cookie } });
      await request.delete(`${base}/api/formats/${long.id}`, { headers: { cookie } });
      await request.delete(`${base}/api/formats/${short.id}`, { headers: { cookie } });
    },
  };
}

test('a full AUTO night with linked clocks runs itself to the end', async ({
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const base = baseURL as string;
  const cookie = await adminCookie(request, base);
  const admin = await adminSocket(base, cookie);
  const existing = await admin.snapshot();
  if (existing.session) await admin.emit('session:end', { sessionId: existing.session.sessionId });
  const night = await setupNight(request, base, cookie);
  try {
    const live = await admin.emit('session:goLive', { sessionId: night.session.id });
    expect(live.ok).toBe(true);
    const snap = await admin.snapshot();
    const longClock = snap.clocks.find((c) => c.formatId === night.long.id)!;
    const shortClock = snap.clocks.find((c) => c.formatId === night.short.id)!;
    expect(shortClock).toBeTruthy();
    const phases = new Map<string, string[]>();
    const record = (label: string, phase: string) => {
      const list = phases.get(label) ?? [];
      if (list[list.length - 1] !== phase) list.push(phase);
      phases.set(label, list);
    };
    // Poll the snapshot until both clocks finish (the socket events also arrive, polling keeps the test simple).
    for (const c of [longClock, shortClock]) record(c.label, c.phase);
    expect((await admin.emit('clock:start', { clockId: longClock.id })).ok).toBe(true);
    expect((await admin.emit('clock:start', { clockId: shortClock.id })).ok).toBe(true);
    const deadline = Date.now() + 90_000;
    let finished = false;
    while (Date.now() < deadline) {
      const s = await admin.snapshot();
      const l = s.clocks.find((c) => c.id === longClock.id);
      const sh = s.clocks.find((c) => c.id === shortClock.id);
      if (l) record('long', l.phase);
      if (sh) record('short', sh.phase);
      if (l?.phase === 'FINISHED' && sh?.phase === 'FINISHED') {
        finished = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(finished, JSON.stringify(Object.fromEntries(phases))).toBe(true);
    // The shorter clock waited for the longer one before the shared gap, then both ran slot 2.
    expect(phases.get('short')).toContain('WAITING_FOR_LINKED');
    expect(phases.get('short')?.filter((p) => p === 'HALF_1').length).toBe(2);
    expect(phases.get('long')?.filter((p) => p === 'HALF_1').length).toBe(2);
    // All four fixtures were finalised automatically with results.
    const fixtures = (await (
      await request.get(`${base}/api/fixtures?sessionId=${night.session.id}`, {
        headers: { cookie },
      })
    ).json()) as Array<{ status: string }>;
    expect(fixtures.map((f) => f.status)).toEqual([
      'COMPLETED',
      'COMPLETED',
      'COMPLETED',
      'COMPLETED',
    ]);
    await admin.emit('session:end', { sessionId: night.session.id });
  } finally {
    admin.close();
    await night.cleanup();
  }
});
