import { describe, expect, it } from 'vitest';
import {
  formatClock,
  formatSlotMinutes,
  formatTimeOfDay,
  formatTimeOfDay12h,
  parseTimeOfDay,
  slotIndexForTime,
  slotStartMinutes,
} from './format.js';

describe('formatClock', () => {
  it('rounds seconds up so 0:01 shows until the phase truly ends', () => {
    expect(formatClock(754_000)).toBe('12:34');
    expect(formatClock(753_001)).toBe('12:34');
    expect(formatClock(1)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-5000)).toBe('0:00');
  });
  it('shows hours when needed', () => {
    expect(formatClock(3_600_000)).toBe('1:00:00');
    expect(formatClock(3_661_000)).toBe('1:01:01');
  });
});

describe('time of day helpers', () => {
  it('parses and formats HH:mm', () => {
    expect(parseTimeOfDay('18:30')).toBe(1110);
    expect(parseTimeOfDay('6:05')).toBe(365);
    expect(formatTimeOfDay(1110)).toBe('18:30');
    expect(formatTimeOfDay(1440 + 5)).toBe('00:05');
    expect(() => parseTimeOfDay('25:00')).toThrow();
    expect(() => parseTimeOfDay('abc')).toThrow();
  });
  it('formats 12-hour labels', () => {
    expect(formatTimeOfDay12h(1215)).toBe('8:15pm');
    expect(formatTimeOfDay12h(0)).toBe('12:00am');
    expect(formatTimeOfDay12h(720)).toBe('12:00pm');
    expect(formatTimeOfDay12h(-60)).toBe('11:00pm');
  });
  it('computes slot start times and reverse lookups', () => {
    expect(slotStartMinutes('18:00', 43, 2)).toBe(1080 + 86);
    expect(slotIndexForTime('18:00', 43, '19:26')).toBe(2);
    expect(slotIndexForTime('18:00', 43, '19:27')).toBe(2);
    expect(slotIndexForTime('18:00', 43, '19:10')).toBeNull();
    expect(slotIndexForTime('18:00', 43, '17:00')).toBeNull();
  });
  it('derives slot minutes from a format', () => {
    expect(
      formatSlotMinutes({ halfSeconds: 1200, halfTimeSeconds: 60, betweenGamesSeconds: 60 }),
    ).toBe(42);
    expect(
      formatSlotMinutes({ halfSeconds: 840, halfTimeSeconds: 60, betweenGamesSeconds: 60 }),
    ).toBe(30);
    expect(
      formatSlotMinutes({ halfSeconds: 601, halfTimeSeconds: 0, betweenGamesSeconds: 0 }),
    ).toBe(21);
  });
});
