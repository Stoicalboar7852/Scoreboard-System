import { describe, expect, it } from 'vitest';
import { describeIdle } from './nextGame.js';
import { type FixtureDisplay } from '../domain/live.js';

const T0 = 1_700_000_000_000;
const MIN = 60_000;
const fixture = (overrides: Partial<FixtureDisplay> = {}): FixtureDisplay => ({
  fixtureId: '11111111-1111-4111-8111-111111111111',
  competitionId: null,
  competitionName: 'A Grade',
  formatId: null,
  formatName: 'Fours',
  stage: 'REGULAR',
  status: 'SCHEDULED',
  homeName: 'Aces',
  awayName: 'Blockers',
  homeShortName: null,
  awayShortName: null,
  slotIndex: 1,
  scheduledStartMs: T0 + 20 * MIN,
  adHoc: false,
  ...overrides,
});

describe('describeIdle', () => {
  it('reports LIVE while a game is on', () => {
    expect(
      describeIdle({ current: fixture({ status: 'LIVE' }), next: null }, T0, 30 * MIN),
    ).toEqual({ kind: 'LIVE' });
  });
  it('highlights the next fixture inside the window', () => {
    const view = describeIdle({ current: null, next: fixture() }, T0, 30 * MIN);
    expect(view).toMatchObject({ kind: 'NEXT_SOON', startsInMs: 20 * MIN });
  });
  it('falls back to court-name-large outside the window', () => {
    const view = describeIdle(
      { current: null, next: fixture({ scheduledStartMs: T0 + 90 * MIN }) },
      T0,
      30 * MIN,
    );
    expect(view).toMatchObject({ kind: 'NEXT_LATER', startsInMs: 90 * MIN });
  });
  it('treats an assigned but not started fixture as the next game', () => {
    const view = describeIdle(
      { current: fixture({ status: 'SCHEDULED', scheduledStartMs: null }), next: null },
      T0,
      30 * MIN,
    );
    expect(view).toMatchObject({ kind: 'NEXT_SOON', startsInMs: null });
  });
  it('says no more games when nothing is scheduled', () => {
    expect(describeIdle({ current: null, next: null }, T0, 30 * MIN)).toEqual({
      kind: 'NO_MORE_GAMES',
    });
    expect(
      describeIdle({ current: fixture({ status: 'COMPLETED' }), next: null }, T0, 30 * MIN),
    ).toEqual({ kind: 'NO_MORE_GAMES' });
  });
});
