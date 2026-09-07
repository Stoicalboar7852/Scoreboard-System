import { describe, expect, it } from 'vitest';
import { addDays, dayOfWeek, sessionDates } from './dates.js';

describe('date helpers', () => {
  it('computes day of week and adds days without timezone drift', () => {
    expect(dayOfWeek('2026-02-02')).toBe(1);
    expect(dayOfWeek('2026-02-08')).toBe(0);
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('lists the dates a night plays, one per week from the start date', () => {
    expect(sessionDates('2026-02-02', 3, 3, [])).toEqual([
      '2026-02-04',
      '2026-02-11',
      '2026-02-18',
    ]);
    expect(sessionDates('2026-02-02', 2, 1, [])).toEqual(['2026-02-02', '2026-02-09']);
    expect(sessionDates('2026-02-04', 2, 1, [])).toEqual(['2026-02-09', '2026-02-16']);
  });

  it('pushes the whole schedule back over skipped dates', () => {
    expect(sessionDates('2026-02-02', 3, 3, ['2026-02-11'])).toEqual([
      '2026-02-04',
      '2026-02-18',
      '2026-02-25',
    ]);
    expect(sessionDates('2026-02-02', 2, 3, ['2026-02-11', '2026-02-18'])).toEqual([
      '2026-02-04',
      '2026-02-25',
    ]);
  });
});
