import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  INACTIVE_TIMEOUT,
  type ClockState,
  type CourtLiveState,
  type FixtureDisplay,
} from '@scoreboard/shared';
import { ScoreboardView } from './ScoreboardView.js';

const MIN = 60_000;
const T0 = Date.UTC(2026, 1, 2, 7, 30, 0); // 18:30 Sydney

const fixture = (overrides: Partial<FixtureDisplay> = {}): FixtureDisplay => ({
  fixtureId: 'fx1',
  competitionId: 'comp',
  competitionName: 'A Grade Pairs',
  formatId: 'pairs',
  formatName: 'Pairs',
  stage: 'REGULAR',
  status: 'LIVE',
  homeName: 'Aces',
  awayName: 'Blockers',
  homeShortName: null,
  awayShortName: null,
  slotIndex: 0,
  scheduledStartMs: T0,
  adHoc: false,
  ...overrides,
});
const clock = (overrides: Partial<ClockState> = {}): ClockState => ({
  id: 'clock1',
  sessionId: 's1',
  formatId: 'pairs',
  label: 'Pairs',
  mode: 'AUTO',
  status: 'RUNNING',
  phase: 'HALF_1',
  phaseDurationMs: 14 * MIN,
  phaseStartedAtMs: T0,
  remainingAtPauseMs: null,
  linkedClockId: null,
  slotIndex: 0,
  version: 1,
  ...overrides,
});
const court = (overrides: Partial<CourtLiveState> = {}): CourtLiveState => ({
  courtId: 'court1',
  courtName: 'Court 1',
  sessionId: 's1',
  clockId: 'clock1',
  currentFixtureId: 'fx1',
  nextFixtureId: 'fx2',
  current: fixture(),
  next: fixture({
    fixtureId: 'fx2',
    status: 'SCHEDULED',
    homeName: 'Crushers',
    awayName: 'Diggers',
    slotIndex: 1,
    scheduledStartMs: T0 + 30 * MIN,
  }),
  homeScore: 7,
  awayScore: 4,
  timeout: INACTIVE_TIMEOUT,
  lastControllerSeenMs: null,
  lastScoreboardSeenMs: null,
  version: 1,
  ...overrides,
});

interface Case {
  name: string;
  court: CourtLiveState;
  clock: ClockState | null;
  linkedClock?: ClockState | null;
  nowMs?: number;
  expectLabel?: string;
  expectIdle?: string;
  expectText?: Array<string | RegExp>;
}

const cases: Case[] = [
  {
    name: 'Half 1',
    court: court(),
    clock: clock(),
    expectLabel: 'Half 1',
    expectText: ['Aces', 'Blockers', '7', '4', 'Court 1'],
  },
  {
    name: 'Half time',
    court: court(),
    clock: clock({ phase: 'HALF_TIME', phaseDurationMs: MIN }),
    expectLabel: 'Half time',
  },
  { name: 'Half 2', court: court(), clock: clock({ phase: 'HALF_2' }), expectLabel: 'Half 2' },
  {
    name: 'Paused',
    court: court(),
    clock: clock({ status: 'PAUSED', remainingAtPauseMs: 3 * MIN }),
    expectLabel: 'Paused',
  },
  {
    name: 'Time out',
    court: court({
      timeout: { active: true, startedAtMs: T0 + MIN, durationMs: MIN, calledBy: 'AWAY' },
    }),
    clock: clock(),
    expectLabel: 'Time out',
  },
  {
    name: 'Final',
    court: court({ current: fixture({ status: 'COMPLETED' }) }),
    clock: clock({ phase: 'BETWEEN_GAMES', phaseDurationMs: MIN }),
    expectText: ['Final', '7', '4'],
  },
  {
    name: 'Between games',
    court: court({ current: null, currentFixtureId: null }),
    clock: clock({ phase: 'BETWEEN_GAMES', phaseDurationMs: MIN, phaseStartedAtMs: T0 + 29 * MIN }),
    nowMs: T0 + 29 * MIN,
    expectLabel: 'Next game in',
    expectIdle: 'next-soon',
    expectText: ['Crushers', 'Diggers'],
  },
  {
    name: 'Waiting for Fours',
    court: court({ current: null, currentFixtureId: null }),
    clock: clock({
      phase: 'WAITING_FOR_LINKED',
      status: 'IDLE',
      phaseDurationMs: 0,
      linkedClockId: 'fours',
    }),
    linkedClock: clock({
      id: 'fours',
      label: 'Fours',
      formatId: 'fours',
      phase: 'HALF_2',
      phaseDurationMs: 20 * MIN,
    }),
    expectLabel: 'Waiting for Fours',
    expectIdle: 'next-soon',
  },
  {
    name: 'Pre-game inside the window',
    court: court({ current: fixture({ status: 'SCHEDULED', scheduledStartMs: T0 + 10 * MIN }) }),
    clock: clock({ phase: 'PRE_GAME', status: 'IDLE', phaseStartedAtMs: null }),
    nowMs: T0,
    expectIdle: 'next-soon',
    expectText: ['Aces', 'Blockers', /6:40pm/],
  },
  {
    name: 'Idle, next game later',
    court: court({
      current: null,
      currentFixtureId: null,
      next: fixture({
        status: 'SCHEDULED',
        homeName: 'Eagles',
        awayName: 'Falcons',
        scheduledStartMs: T0 + 120 * MIN,
      }),
    }),
    clock: null,
    nowMs: T0,
    expectIdle: 'next-later',
    expectText: ['Court 1', /Next: Eagles vs Falcons · 8:30pm/],
  },
  {
    name: 'No more games',
    court: court({ current: null, currentFixtureId: null, next: null, nextFixtureId: null }),
    clock: null,
    expectIdle: 'no-more-games',
    expectText: ['No more games tonight'],
  },
];

describe('ScoreboardView renders every state without interactive elements', () => {
  it.each(cases)('$name', (c) => {
    render(
      <ScoreboardView
        court={c.court}
        clock={c.clock}
        linkedClock={c.linkedClock ?? null}
        nowMs={c.nowMs ?? T0 + 90_000}
        windowMinutes={30}
        timezone="Australia/Sydney"
      />,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(document.querySelectorAll('input, select, textarea, a')).toHaveLength(0);
    if (c.expectLabel)
      expect(document.querySelector('[data-phase-label]')).toHaveTextContent(c.expectLabel);
    if (c.expectIdle)
      expect(document.querySelector('[data-idle]')?.getAttribute('data-idle')).toBe(c.expectIdle);
    for (const text of c.expectText ?? [])
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  });

  it('shows a fault banner without hiding the last good state', () => {
    render(
      <ScoreboardView
        court={court()}
        clock={clock()}
        linkedClock={null}
        nowMs={T0}
        windowMinutes={30}
        timezone="Australia/Sydney"
        fault="Could not join court"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not join court');
    expect(screen.getByText('Aces')).toBeInTheDocument();
  });

  it('hides the cursor for kiosks', () => {
    render(
      <ScoreboardView
        court={court()}
        clock={clock()}
        linkedClock={null}
        nowMs={T0}
        windowMinutes={30}
        timezone="Australia/Sydney"
      />,
    );
    expect(document.querySelector('[data-scoreboard]')).toHaveClass('kiosk');
  });
});
