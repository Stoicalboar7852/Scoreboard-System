import { describe, expect, it } from 'vitest';
import { generateDraw, type DrawInput, type DrawSession } from './generate.js';
import { validateNight } from '../clash/validate.js';

const FOURS = {
  id: 'fours',
  name: 'Fours',
  halfSeconds: 1200,
  halfTimeSeconds: 60,
  betweenGamesSeconds: 60,
};
const PAIRS = {
  id: 'pairs',
  name: 'Pairs',
  halfSeconds: 840,
  halfTimeSeconds: 60,
  betweenGamesSeconds: 60,
};

const teams = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
const courts = (n: number, supported: (i: number) => string[] = () => ['fours', 'pairs']) =>
  Array.from({ length: n }, (_, i) => ({
    id: `court${i + 1}`,
    name: `Court ${i + 1}`,
    supportedFormatIds: supported(i),
  }));

/** The demo venue from the brief: Monday 3 pairs grades of 6; Wednesday fours + pairs of 8 with clashes. */
function demoInput(overrides: Partial<DrawInput> = {}): DrawInput {
  return {
    weeks: 10,
    startDate: '2026-02-02',
    skippedDates: [],
    formats: [FOURS, PAIRS],
    courts: courts(6),
    competitions: [
      {
        id: 'monA',
        name: 'Monday A Pairs',
        nightOfWeek: 1,
        formatId: 'pairs',
        teamIds: teams('MA', 6),
      },
      {
        id: 'monB',
        name: 'Monday B Pairs',
        nightOfWeek: 1,
        formatId: 'pairs',
        teamIds: teams('MB', 6),
      },
      {
        id: 'monC',
        name: 'Monday C Pairs',
        nightOfWeek: 1,
        formatId: 'pairs',
        teamIds: teams('MC', 6),
      },
      {
        id: 'wedF',
        name: 'Wednesday Fours',
        nightOfWeek: 3,
        formatId: 'fours',
        teamIds: teams('WF', 8),
      },
      {
        id: 'wedP',
        name: 'Wednesday Pairs',
        nightOfWeek: 3,
        formatId: 'pairs',
        teamIds: teams('WP', 8),
      },
    ],
    nights: [
      {
        nightOfWeek: 1,
        courtIds: ['court1', 'court2', 'court3', 'court4', 'court5', 'court6'],
        firstSlotTime: '18:30',
        linkShorterToLonger: false,
      },
      {
        nightOfWeek: 3,
        courtIds: ['court1', 'court2', 'court3', 'court4', 'court5', 'court6'],
        firstSlotTime: '18:30',
        linkShorterToLonger: true,
      },
    ],
    clashes: [
      { teamAId: 'WF1', teamBId: 'WP3' },
      { teamAId: 'WF5', teamBId: 'WP7' },
    ],
    seed: 42,
    ...overrides,
  };
}

function assertNightInvariants(session: DrawSession, input: DrawInput): void {
  const competitions = new Map(input.competitions.map((c) => [c.id, c]));
  const night = input.nights.find((n) => n.nightOfWeek === session.nightOfWeek);
  if (!night) throw new Error('night config missing');
  const played = new Map<string, number>();
  for (const f of session.fixtures) {
    played.set(f.homeTeamId, (played.get(f.homeTeamId) ?? 0) + 1);
    if (f.awayTeamId) played.set(f.awayTeamId, (played.get(f.awayTeamId) ?? 0) + 1);
  }
  for (const comp of input.competitions.filter((c) => c.nightOfWeek === session.nightOfWeek)) {
    for (const team of comp.teamIds)
      expect(played.get(team), `${team} plays once on ${session.date}`).toBe(1);
  }
  for (const f of session.fixtures) {
    if (f.status === 'BYE') {
      expect(f.slotIndex).toBeNull();
      expect(f.courtId).toBeNull();
    } else {
      expect(f.slotIndex).not.toBeNull();
      expect(night.courtIds).toContain(f.courtId);
      expect(f.slotIndex as number).toBeLessThan(session.slotCount);
    }
  }
  const issues = validateNight(
    session.fixtures.map((f, i) => ({
      id: `f${i}`,
      competitionId: f.competitionId,
      formatId: competitions.get(f.competitionId)?.formatId ?? null,
      slotIndex: f.slotIndex,
      courtId: f.courtId,
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
      status: f.status,
    })),
    {
      courts: input.courts,
      clashes: input.clashes,
      linkShorterToLonger: night.linkShorterToLonger,
      slotCount: session.slotCount,
    },
  );
  expect(issues, `${session.date}: ${issues.map((i) => i.message).join('; ')}`).toEqual([]);
}

describe('generateDraw', () => {
  it('produces a complete, valid draw for the demo venue', () => {
    const input = demoInput();
    const result = generateDraw(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sessions).toHaveLength(20);
    for (const session of result.sessions) assertNightInvariants(session, input);

    const monday = result.sessions.filter((s) => s.nightOfWeek === 1);
    expect(monday.map((s) => s.date).slice(0, 3)).toEqual([
      '2026-02-02',
      '2026-02-09',
      '2026-02-16',
    ]);
    expect(monday[0]?.slotLengthMinutes).toBe(30);
    expect(monday[0]?.slotCount).toBe(2);
    const wednesday = result.sessions.filter((s) => s.nightOfWeek === 3);
    expect(wednesday[0]?.date).toBe('2026-02-04');
    expect(wednesday[0]?.slotLengthMinutes).toBe(42);
    expect(wednesday[0]?.slotCount).toBe(2);
  });

  it('meets each pair the expected number of times and spreads byes evenly', () => {
    const input = demoInput({
      weeks: 10,
      competitions: [
        { id: 'odd', name: 'Odd', nightOfWeek: 1, formatId: 'pairs', teamIds: teams('O', 5) },
        { id: 'even', name: 'Even', nightOfWeek: 1, formatId: 'pairs', teamIds: teams('E', 6) },
      ],
      nights: [
        {
          nightOfWeek: 1,
          courtIds: ['court1', 'court2', 'court3', 'court4', 'court5', 'court6'],
          firstSlotTime: '18:30',
          linkShorterToLonger: false,
        },
      ],
      clashes: [],
    });
    const result = generateDraw(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const meetings = new Map<string, number>();
    const byes = new Map<string, number>();
    for (const session of result.sessions) {
      for (const f of session.fixtures) {
        if (f.awayTeamId === null) {
          byes.set(f.homeTeamId, (byes.get(f.homeTeamId) ?? 0) + 1);
          continue;
        }
        const key = [f.homeTeamId, f.awayTeamId].sort().join('|');
        meetings.set(key, (meetings.get(key) ?? 0) + 1);
      }
    }
    for (const t of teams('O', 5)) expect(byes.get(t)).toBe(2);
    expect(
      [...meetings.entries()].filter(([k]) => k.startsWith('E')).every(([, v]) => v === 2),
    ).toBe(true);
    expect(
      [...meetings.entries()].filter(([k]) => k.startsWith('O')).every(([, v]) => v === 2),
    ).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('is deterministic for a seed and different for another seed', () => {
    const a = generateDraw(demoInput({ seed: 7 }));
    const b = generateDraw(demoInput({ seed: 7 }));
    const c = generateDraw(demoInput({ seed: 8 }));
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (!a.ok || !b.ok || !c.ok) return;
    expect(a.sessions).toEqual(b.sessions);
    expect(a.warnings).toEqual(b.warnings);
    expect(JSON.stringify(a.sessions)).not.toEqual(JSON.stringify(c.sessions));
  });

  it('respects court format support and one-format-per-court on unlinked nights', () => {
    const input = demoInput({
      courts: courts(6, (i) => (i < 3 ? ['fours'] : ['fours', 'pairs'])),
      competitions: [
        { id: 'f', name: 'Fours', nightOfWeek: 1, formatId: 'fours', teamIds: teams('F', 6) },
        { id: 'p', name: 'Pairs', nightOfWeek: 1, formatId: 'pairs', teamIds: teams('P', 6) },
      ],
      nights: [
        {
          nightOfWeek: 1,
          courtIds: ['court1', 'court2', 'court3', 'court4', 'court5', 'court6'],
          firstSlotTime: '18:30',
          linkShorterToLonger: false,
        },
      ],
      clashes: [],
      weeks: 5,
    });
    const result = generateDraw(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const session of result.sessions) {
      assertNightInvariants(session, input);
      for (const f of session.fixtures) {
        if (f.competitionId === 'p') expect(['court4', 'court5', 'court6']).toContain(f.courtId);
      }
    }
  });

  it('reports an infeasible night with the conflicting fixture and suggestions instead of a partial draw', () => {
    const input = demoInput({
      weeks: 2,
      courts: courts(2),
      competitions: [
        { id: 'x', name: 'X', nightOfWeek: 1, formatId: 'pairs', teamIds: teams('X', 4) },
      ],
      nights: [
        {
          nightOfWeek: 1,
          courtIds: ['court1', 'court2'],
          firstSlotTime: '18:30',
          linkShorterToLonger: false,
        },
      ],
      clashes: [
        { teamAId: 'X1', teamBId: 'X2' },
        { teamAId: 'X1', teamBId: 'X3' },
        { teamAId: 'X1', teamBId: 'X4' },
      ],
    });
    const result = generateDraw(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.sessions).toEqual([]);
    expect(result.conflicts.length).toBeGreaterThan(0);
    const conflict = result.conflicts[0];
    expect(conflict?.fixture.competitionId).toBe('x');
    expect(conflict?.suggestions.join(' ')).toMatch(/slot|clash/i);
  });

  it('can be told to open extra slots to resolve clashes', () => {
    const input = demoInput({
      weeks: 3,
      courts: courts(2),
      competitions: [
        { id: 'x', name: 'X', nightOfWeek: 1, formatId: 'pairs', teamIds: teams('X', 4) },
      ],
      nights: [
        {
          nightOfWeek: 1,
          courtIds: ['court1', 'court2'],
          firstSlotTime: '18:30',
          linkShorterToLonger: false,
          extraSlots: 1,
        },
      ],
      clashes: [
        { teamAId: 'X1', teamBId: 'X2' },
        { teamAId: 'X1', teamBId: 'X3' },
        { teamAId: 'X1', teamBId: 'X4' },
      ],
    });
    const result = generateDraw(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const session of result.sessions) assertNightInvariants(session, input);
    expect(result.sessions[0]?.slotCount).toBe(2);
  });

  it('skips dates and warns about short seasons', () => {
    const result = generateDraw(demoInput({ weeks: 3, skippedDates: ['2026-02-09'] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sessions.filter((s) => s.nightOfWeek === 1).map((s) => s.date)).toEqual([
      '2026-02-02',
      '2026-02-16',
      '2026-02-23',
    ]);
    expect(result.warnings.some((w) => /not every pair/i.test(w))).toBe(true);
  });

  it('fails clearly when a competition plays on a night without courts', () => {
    const result = generateDraw(
      demoInput({ nights: [demoInput().nights[0] as DrawInput['nights'][number]] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.conflicts[0]?.reason).toMatch(/no courts/i);
  });

  it('generates 10 competitions × 12 teams × 20 weeks in under 10 seconds with no violations', () => {
    const competitions = Array.from({ length: 10 }, (_, i) => ({
      id: `comp${i}`,
      name: `Comp ${i}`,
      nightOfWeek: (i % 4) + 1,
      formatId: i % 3 === 0 ? 'fours' : 'pairs',
      teamIds: teams(`C${i}T`, 12),
    }));
    const clashes = Array.from({ length: 12 }, (_, i) => ({
      teamAId: `C${(i % 4) * 2}T${(i % 12) + 1}`,
      teamBId: `C${(i % 4) * 2 + 1}T${((i * 5) % 12) + 1}`,
    })).filter((c) => {
      const a = competitions.find((comp) => comp.teamIds.includes(c.teamAId));
      const b = competitions.find((comp) => comp.teamIds.includes(c.teamBId));
      return a && b && a.nightOfWeek === b.nightOfWeek;
    });
    const nightIds = courts(10).map((c) => c.id);
    const input: DrawInput = {
      weeks: 20,
      startDate: '2026-02-02',
      skippedDates: [],
      formats: [FOURS, PAIRS],
      courts: courts(10),
      competitions,
      nights: [1, 2, 3, 4].map((n) => ({
        nightOfWeek: n,
        courtIds: nightIds,
        firstSlotTime: '18:00',
        linkShorterToLonger: true,
      })),
      clashes,
      seed: 1,
    };
    const started = performance.now();
    const result = generateDraw(input);
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(10_000);
    expect(result.ok, result.ok ? '' : JSON.stringify(result.conflicts.slice(0, 2))).toBe(true);
    if (!result.ok) return;
    expect(result.sessions).toHaveLength(80);
    for (const session of result.sessions) assertNightInvariants(session, input);
  });

  it("keeps each team's slot usage roughly balanced over a season", () => {
    const result = generateDraw(demoInput({ weeks: 15 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const counts = new Map<string, number[]>();
    for (const session of result.sessions.filter((s) => s.nightOfWeek === 3)) {
      for (const f of session.fixtures) {
        if (f.slotIndex === null) continue;
        for (const t of [f.homeTeamId, f.awayTeamId]) {
          if (!t) continue;
          const arr = counts.get(t) ?? [0, 0];
          arr[f.slotIndex] = (arr[f.slotIndex] ?? 0) + 1;
          counts.set(t, arr);
        }
      }
    }
    for (const [team, arr] of counts) {
      const spread = Math.abs((arr[0] ?? 0) - (arr[1] ?? 0));
      expect(spread, `${team} slot spread ${arr.join('/')}`).toBeLessThanOrEqual(5);
    }
  });
});
