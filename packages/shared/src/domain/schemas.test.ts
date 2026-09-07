import { describe, expect, it } from 'vitest';
import {
  competitionInputSchema,
  fixtureInputSchema,
  resultInputSchema,
  settingsUpdateSchema,
} from './inputs.js';
import { clockStateSchema, courtLiveStateSchema, INACTIVE_TIMEOUT } from './live.js';
import { fixtureSchema, sessionSchema } from './entities.js';
import { isoDateSchema, timeOfDaySchema } from './common.js';
import { nightName } from './enums.js';
import { VENUE_POINTS_RULE, detectLadderPreset, WINS_FOR_AGAINST_RULE } from '../ladder/rule.js';

const U = (n: number) =>
  `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;

describe('common schemas', () => {
  it('validates dates and times', () => {
    expect(isoDateSchema.safeParse('2026-02-30').success).toBe(true);
    expect(isoDateSchema.safeParse('2026-2-3').success).toBe(false);
    expect(timeOfDaySchema.safeParse('18:30').success).toBe(true);
    expect(timeOfDaySchema.safeParse('24:00').success).toBe(false);
  });
  it('names nights', () => {
    expect(nightName(1)).toBe('Monday');
    expect(nightName(9)).toBe('Night 9');
  });
});

describe('entity and input schemas', () => {
  it('parses a fixture and a session', () => {
    expect(
      fixtureSchema.safeParse({
        id: U(1),
        seasonId: null,
        competitionId: U(2),
        sessionId: null,
        roundNumber: 1,
        slotIndex: 0,
        courtId: U(3),
        homeTeamId: U(4),
        awayTeamId: U(5),
        homeName: null,
        awayName: null,
        stage: 'REGULAR',
        finalsKey: null,
        homeRef: null,
        awayRef: null,
        status: 'SCHEDULED',
        homeScore: 0,
        awayScore: 0,
        forfeitBy: null,
        completedAtMs: null,
        resultNotes: null,
      }).success,
    ).toBe(true);
    expect(
      sessionSchema.safeParse({
        id: U(1),
        seasonId: null,
        date: '2026-02-02',
        nightOfWeek: 1,
        firstSlotTime: '18:30',
        slotLengthMinutes: 42,
        slotCount: 3,
        linkShorterToLonger: true,
        status: 'PLANNED',
        published: false,
      }).success,
    ).toBe(true);
  });

  it('rejects a fixture with no sides and a team playing itself', () => {
    expect(fixtureInputSchema.safeParse({}).success).toBe(false);
    expect(fixtureInputSchema.safeParse({ homeTeamId: U(1), awayTeamId: U(1) }).success).toBe(
      false,
    );
    expect(fixtureInputSchema.safeParse({ homeTeamId: U(1), awayTeamId: U(2) }).success).toBe(true);
    expect(fixtureInputSchema.safeParse({ homeName: 'Walk-ins', awayName: 'Staff' }).success).toBe(
      true,
    );
    expect(fixtureInputSchema.safeParse({ status: 'BYE', homeTeamId: U(1) }).success).toBe(true);
  });

  it('requires forfeitBy on forfeits', () => {
    expect(
      resultInputSchema.safeParse({ homeScore: 0, awayScore: 0, status: 'FORFEIT' }).success,
    ).toBe(false);
    expect(
      resultInputSchema.safeParse({
        homeScore: 0,
        awayScore: 0,
        status: 'FORFEIT',
        forfeitBy: 'HOME',
      }).success,
    ).toBe(true);
  });

  it('accepts partial settings and competition inputs with a ladder rule', () => {
    expect(settingsUpdateSchema.safeParse({ nextGameWindowMinutes: 45 }).success).toBe(true);
    expect(settingsUpdateSchema.safeParse({ accentOverrides: { court: 'gold' } }).success).toBe(
      false,
    );
    const comp = competitionInputSchema.safeParse({
      seasonId: U(1),
      name: 'A',
      nightOfWeek: 1,
      formatId: U(2),
      ladderRule: VENUE_POINTS_RULE,
    });
    expect(comp.success).toBe(true);
    expect(
      competitionInputSchema.safeParse({
        seasonId: U(1),
        name: 'A',
        nightOfWeek: 7,
        formatId: U(2),
      }).success,
    ).toBe(false);
  });

  it('detects ladder presets', () => {
    expect(detectLadderPreset(VENUE_POINTS_RULE)).toBe('VENUE_POINTS');
    expect(detectLadderPreset(WINS_FOR_AGAINST_RULE)).toBe('WINS_FOR_AGAINST');
    expect(detectLadderPreset({ ...VENUE_POINTS_RULE, win: 5 })).toBe('CUSTOM');
  });

  it('parses live state shapes', () => {
    expect(
      clockStateSchema.safeParse({
        id: U(1),
        sessionId: U(2),
        formatId: null,
        label: 'x',
        mode: 'AUTO',
        status: 'IDLE',
        phase: 'PRE_GAME',
        phaseDurationMs: 1000,
        phaseStartedAtMs: null,
        remainingAtPauseMs: null,
        linkedClockId: null,
        slotIndex: 0,
        version: 0,
      }).success,
    ).toBe(true);
    expect(
      courtLiveStateSchema.safeParse({
        courtId: U(1),
        courtName: 'Court 1',
        sessionId: null,
        clockId: null,
        currentFixtureId: null,
        nextFixtureId: null,
        current: null,
        next: null,
        homeScore: 0,
        awayScore: 0,
        timeout: INACTIVE_TIMEOUT,
        lastControllerSeenMs: null,
        lastScoreboardSeenMs: null,
        version: 0,
      }).success,
    ).toBe(true);
  });
});
