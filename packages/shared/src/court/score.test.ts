import { describe, expect, it } from 'vitest';
import { applyScoreDelta, canScore, resultFromScores } from './score.js';

describe('applyScoreDelta', () => {
  it('adds and subtracts, never below zero', () => {
    expect(applyScoreDelta({ homeScore: 3, awayScore: 5 }, 'HOME', 1)).toEqual({
      homeScore: 4,
      awayScore: 5,
    });
    expect(applyScoreDelta({ homeScore: 3, awayScore: 5 }, 'AWAY', -1)).toEqual({
      homeScore: 3,
      awayScore: 4,
    });
    expect(applyScoreDelta({ homeScore: 0, awayScore: 0 }, 'HOME', -1)).toEqual({
      homeScore: 0,
      awayScore: 0,
    });
    expect(applyScoreDelta({ homeScore: 2, awayScore: 0 }, 'HOME', -5)).toEqual({
      homeScore: 0,
      awayScore: 0,
    });
  });
  it('rejects non-integer deltas', () => {
    expect(() => applyScoreDelta({ homeScore: 0, awayScore: 0 }, 'HOME', 0.5)).toThrow();
  });
});

describe('canScore', () => {
  it('only allows scoring on a live fixture', () => {
    expect(canScore({ current: { status: 'LIVE' } })).toBe(true);
    expect(canScore({ current: { status: 'SCHEDULED' } })).toBe(false);
    expect(canScore({ current: { status: 'COMPLETED' } })).toBe(false);
    expect(canScore({ current: null })).toBe(false);
  });
});

describe('resultFromScores', () => {
  it('classifies the result from the home perspective', () => {
    expect(resultFromScores(10, 5)).toBe('HOME');
    expect(resultFromScores(5, 10)).toBe('AWAY');
    expect(resultFromScores(7, 7)).toBe('DRAW');
  });
});
