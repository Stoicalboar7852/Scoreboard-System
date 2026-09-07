import { describe, expect, it } from 'vitest';
import {
  FIXTURE_TEMPLATE_HEADERS,
  normaliseHeader,
  parseFixtureRows,
  type ImportContext,
  type RawRow,
} from './rows.js';

const ctx: ImportContext = {
  competitions: [
    {
      id: 'compA',
      name: 'A Grade Pairs',
      teams: [
        { id: 'a1', name: 'Aces' },
        { id: 'a2', name: 'Blockers' },
        { id: 'a3', name: 'Crushers' },
      ],
    },
  ],
  courts: [
    { id: 'c1', name: 'Court 1' },
    { id: 'c2', name: 'Court 2' },
  ],
  session: { date: '2026-02-02', firstSlotTime: '18:30', slotLengthMinutes: 30 },
  autoCreateTeams: false,
};

function row(rowNumber: number, cells: Record<string, unknown>): RawRow {
  return { rowNumber, cells };
}

const good = {
  Date: '2026-02-02',
  'Start Time or Slot': '19:00',
  Court: 'Court 1',
  Competition: 'A Grade Pairs',
  'Home Team': 'Aces',
  'Away Team': 'Blockers',
  Round: 3,
};

describe('normaliseHeader', () => {
  it('ignores case, spacing and punctuation', () => {
    expect(normaliseHeader('  Home  Team ')).toBe('home team');
    expect(normaliseHeader('Start_Time/Slot')).toBe('start time slot');
    expect(FIXTURE_TEMPLATE_HEADERS).toHaveLength(7);
  });
});

describe('parseFixtureRows', () => {
  it('parses a clean row', () => {
    const [parsed] = parseFixtureRows([row(2, good)], ctx);
    expect(parsed).toMatchObject({
      rowNumber: 2,
      ok: true,
      errors: [],
      value: {
        date: '2026-02-02',
        slotIndex: 1,
        startTime: '19:00',
        courtId: 'c1',
        competitionId: 'compA',
        homeTeamId: 'a1',
        awayTeamId: 'a2',
        roundNumber: 3,
        createTeams: [],
      },
    });
  });

  it('accepts slot numbers, JS dates, Excel serials and 12-hour times', () => {
    const rows = parseFixtureRows(
      [
        row(2, { ...good, 'Start Time or Slot': 'Slot 2' }),
        row(3, { ...good, 'Start Time or Slot': 3 }),
        row(4, { ...good, Date: new Date(Date.UTC(2026, 1, 2)), 'Start Time or Slot': '7:00 pm' }),
        row(5, {
          ...good,
          Date: 46055,
          'Start Time or Slot': new Date(Date.UTC(1899, 11, 30, 19, 0)),
        }),
        row(6, { ...good, Date: '02/02/2026', 'Start Time or Slot': 19 / 24 }),
      ],
      ctx,
    );
    expect(rows.map((r) => r.value.slotIndex)).toEqual([1, 2, 1, 1, 1]);
    expect(rows.every((r) => r.value.date === '2026-02-02')).toBe(true);
    expect(rows.every((r) => r.ok)).toBe(true);
  });

  it('matches names case-insensitively and trims whitespace', () => {
    const [parsed] = parseFixtureRows(
      [row(2, { ...good, Court: ' court 2 ', Competition: 'a grade pairs', 'Home Team': 'ACES ' })],
      ctx,
    );
    expect(parsed?.ok).toBe(true);
    expect(parsed?.value.courtId).toBe('c2');
  });

  it('reports every problem on a bad row', () => {
    const [parsed] = parseFixtureRows(
      [
        row(2, {
          Date: 'not a date',
          'Start Time or Slot': '18:45',
          Court: 'Court 9',
          Competition: 'Z Grade',
          'Home Team': 'Aces',
          'Away Team': 'Aces',
          Round: 'x',
        }),
      ],
      ctx,
    );
    expect(parsed?.ok).toBe(false);
    expect(parsed?.errors.map((e) => e.code).sort()).toEqual([
      'INVALID_DATE',
      'INVALID_ROUND',
      'SAME_TEAM',
      'TIME_NOT_ON_SLOT',
      'UNKNOWN_COMPETITION',
      'UNKNOWN_COURT',
    ]);
  });

  it('flags unknown teams, or queues them for creation when allowed', () => {
    const strict = parseFixtureRows([row(2, { ...good, 'Away Team': 'Newbies' })], ctx);
    expect(strict[0]?.ok).toBe(false);
    expect(strict[0]?.errors[0]).toMatchObject({ code: 'UNKNOWN_TEAM', field: 'awayTeam' });

    const lenient = parseFixtureRows([row(2, { ...good, 'Away Team': 'Newbies' })], {
      ...ctx,
      autoCreateTeams: true,
    });
    expect(lenient[0]?.ok).toBe(true);
    expect(lenient[0]?.warnings[0]).toMatchObject({ code: 'TEAM_WILL_BE_CREATED' });
    expect(lenient[0]?.value).toMatchObject({
      awayTeamId: null,
      awayTeamName: 'Newbies',
      createTeams: ['Newbies'],
    });
  });

  it('flags missing required cells and a date outside the session', () => {
    const rows = parseFixtureRows(
      [
        row(2, { ...good, 'Home Team': '' }),
        row(3, { ...good, Date: '2026-02-09' }),
        row(4, { ...good, Court: undefined }),
      ],
      ctx,
    );
    expect(rows[0]?.errors[0]?.code).toBe('MISSING');
    expect(rows[1]?.errors[0]?.code).toBe('DATE_NOT_IN_SESSION');
    expect(rows[2]?.errors[0]).toMatchObject({ code: 'MISSING', field: 'court' });
  });

  it('understands BYE rows', () => {
    const [parsed] = parseFixtureRows(
      [row(2, { ...good, 'Away Team': 'BYE', Court: '', 'Start Time or Slot': '' })],
      ctx,
    );
    expect(parsed?.ok).toBe(true);
    expect(parsed?.value).toMatchObject({
      isBye: true,
      awayTeamId: null,
      courtId: null,
      slotIndex: null,
    });
  });

  it('works without a session (date-only validation) and with slot numbers only', () => {
    const [parsed] = parseFixtureRows([row(2, { ...good, 'Start Time or Slot': '2' })], {
      ...ctx,
      session: null,
    });
    expect(parsed?.ok).toBe(true);
    expect(parsed?.value.slotIndex).toBe(1);
    const [timed] = parseFixtureRows([row(2, { ...good })], { ...ctx, session: null });
    expect(timed?.ok).toBe(false);
    expect(timed?.errors[0]?.code).toBe('TIME_WITHOUT_SESSION');
  });

  it('skips completely empty rows', () => {
    expect(parseFixtureRows([row(2, { Date: '', Court: '' })], ctx)).toEqual([]);
  });
});

describe('cell parsing edge cases', () => {
  it('parses more time and date spellings', () => {
    const rows = parseFixtureRows(
      [
        row(2, { ...good, 'Start Time or Slot': '7pm' }),
        row(3, { ...good, 'Start Time or Slot': '19.00' }),
        row(4, { ...good, 'Start Time or Slot': '12:00 am', Date: { text: '2026-02-02' } }),
        row(5, {
          ...good,
          'Start Time or Slot': { result: '19:00' },
          Date: { result: '2026-02-02' },
        }),
        row(6, { ...good, 'Start Time or Slot': 'nineteen' }),
        row(7, { ...good, 'Start Time or Slot': '25:00' }),
        row(8, { ...good, 'Start Time or Slot': 1.5 }),
        row(9, { ...good, Date: '31/02/2026' }),
        row(10, { ...good, Date: new Date('invalid') }),
        row(11, { ...good, Date: 0 }),
        row(12, { ...good, 'Start Time or Slot': new Date('invalid') }),
        row(13, { ...good, 'Start Time or Slot': '12 am' }),
      ],
      ctx,
    );
    expect(rows[0]?.value.slotIndex).toBe(1);
    expect(rows[1]?.value.slotIndex).toBe(1);
    expect(rows[2]?.errors[0]?.code).toBe('TIME_NOT_ON_SLOT');
    expect(rows[3]?.ok).toBe(true);
    expect(rows[4]?.errors[0]?.code).toBe('INVALID_TIME');
    expect(rows[5]?.errors[0]?.code).toBe('INVALID_TIME');
    expect(rows[6]?.errors[0]?.code).toBe('INVALID_TIME');
    expect(rows[7]?.errors[0]?.code).toBe('INVALID_DATE');
    expect(rows[8]?.errors[0]?.code).toBe('INVALID_DATE');
    expect(rows[9]?.errors[0]?.code).toBe('INVALID_DATE');
    expect(rows[10]?.errors[0]?.code).toBe('INVALID_TIME');
    expect(rows[11]?.errors[0]?.code).toBe('TIME_NOT_ON_SLOT');
  });

  it('uses the session date when the date cell is blank and reports missing competition and teams', () => {
    const rows = parseFixtureRows(
      [
        row(2, { ...good, Date: '' }),
        row(3, { ...good, Competition: '', 'Home Team': '', 'Away Team': '' }),
      ],
      ctx,
    );
    expect(rows[0]?.ok).toBe(true);
    expect(rows[0]?.value.date).toBe('2026-02-02');
    expect(rows[1]?.errors.map((e) => e.code)).toEqual(['MISSING', 'MISSING', 'MISSING']);
    const noSession = parseFixtureRows([row(2, { ...good, Date: '', 'Start Time or Slot': '1' })], {
      ...ctx,
      session: null,
    });
    expect(noSession[0]?.errors[0]?.code).toBe('MISSING');
  });

  it('deduplicates teams queued for creation and accepts header aliases', () => {
    const rows = parseFixtureRows(
      [
        row(2, {
          date: '2026-02-02',
          slot: '1',
          court: 'Court 1',
          grade: 'A Grade Pairs',
          home: 'Newbies',
          away: 'newbies',
          week: '2',
        }),
      ],
      { ...ctx, autoCreateTeams: true },
    );
    expect(rows[0]?.errors.map((e) => e.code)).toEqual(['SAME_TEAM']);
    expect(rows[0]?.value.createTeams).toEqual(['Newbies']);
    expect(rows[0]?.value.roundNumber).toBe(2);
  });
});
