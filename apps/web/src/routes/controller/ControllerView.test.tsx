import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  INACTIVE_TIMEOUT,
  type ClockState,
  type CourtLiveState,
  type FixtureDisplay,
} from '@scoreboard/shared';
import { ControllerView, type ControllerViewProps } from './ControllerView.js';

const MIN = 60_000;
const T0 = Date.UTC(2026, 1, 2, 7, 30, 0); // 18:30 in Sydney (AEDT, UTC+11)

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
  homeScore: 3,
  awayScore: 5,
  timeout: INACTIVE_TIMEOUT,
  lastControllerSeenMs: null,
  lastScoreboardSeenMs: null,
  version: 1,
  ...overrides,
});

function renderView(overrides: Partial<ControllerViewProps> = {}) {
  const props: ControllerViewProps = {
    court: court(),
    clock: clock(),
    linkedClock: null,
    nowMs: T0 + 90_000,
    homeScore: 3,
    awayScore: 5,
    pendingCount: 0,
    windowMinutes: 30,
    timezone: 'Australia/Sydney',
    onTap: vi.fn(),
    onTimeout: vi.fn(),
    onEndTimeout: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides,
  };
  render(<ControllerView {...props} />);
  return props;
}

const label = () => document.querySelector('[data-phase-label]')?.textContent;
const clockState = () =>
  document.querySelector('[data-clock-state]')?.getAttribute('data-clock-state');

describe('ControllerView phases', () => {
  it('Half 1: exact layout, scoring and time out enabled, next game in footer', () => {
    const props = renderView();
    expect(screen.getByText('Court 1')).toBeInTheDocument();
    expect(document.querySelector('[data-team="home"]')).toHaveTextContent('Aces');
    expect(document.querySelector('[data-team="away"]')).toHaveTextContent('Blockers');
    expect(document.querySelector('[data-score="home"]')).toHaveTextContent('3');
    expect(document.querySelector('[data-score="away"]')).toHaveTextContent('5');
    expect(label()).toBe('Half 1');
    expect(clockState()).toBe('HALF_1');
    fireEvent.click(screen.getByRole('button', { name: 'Home plus one' }));
    fireEvent.click(screen.getByRole('button', { name: 'Away minus one' }));
    expect(props.onTap).toHaveBeenCalledWith('HOME', 1);
    expect(props.onTap).toHaveBeenCalledWith('AWAY', -1);
    const timeout = screen.getByRole('button', { name: 'Time out' });
    expect(timeout).toBeEnabled();
    fireEvent.click(timeout);
    expect(props.onTimeout).toHaveBeenCalled();
    expect(screen.getByText(/Next: Crushers vs Diggers 7:00pm/)).toBeInTheDocument();
    expect(screen.getByText('A Grade Pairs')).toBeInTheDocument();
  });

  it('Half time: time out disabled, scoring still allowed', () => {
    renderView({ clock: clock({ phase: 'HALF_TIME', phaseDurationMs: MIN }) });
    expect(label()).toBe('Half time');
    expect(screen.getByRole('button', { name: 'Time out' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Home plus one' })).toBeEnabled();
  });

  it('Half 2 shows the sky-blue label', () => {
    renderView({ clock: clock({ phase: 'HALF_2' }) });
    expect(label()).toBe('Half 2');
    expect(clockState()).toBe('HALF_2');
  });

  it('Paused pulses amber and keeps the remaining time static', () => {
    renderView({ clock: clock({ status: 'PAUSED', remainingAtPauseMs: 5 * MIN }) });
    expect(label()).toBe('Paused');
    expect(document.querySelector('[data-phase-label]')).toHaveClass('pulse-soft');
    expect(clockState()).toBe('paused');
    expect(screen.getByRole('button', { name: 'Time out' })).toBeDisabled();
  });

  it('Time out replaces the clock, turns the button into End time out', () => {
    const props = renderView({
      court: court({
        timeout: { active: true, startedAtMs: T0 + 60_000, durationMs: 60_000, calledBy: 'HOME' },
      }),
    });
    expect(label()).toBe('Time out');
    expect(clockState()).toBe('timeout');
    const end = screen.getByRole('button', { name: 'End time out' });
    fireEvent.click(end);
    expect(props.onEndTimeout).toHaveBeenCalled();
  });

  it('Final: FINAL panel, buttons disabled until the next fixture is assigned', () => {
    renderView({
      court: court({ current: fixture({ status: 'COMPLETED' }) }),
      clock: clock({ phase: 'BETWEEN_GAMES', phaseDurationMs: MIN }),
    });
    expect(screen.getByText('Final')).toBeInTheDocument();
    expect(clockState()).toBe('final');
    expect(screen.getByRole('button', { name: 'Home plus one' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Time out' })).toBeDisabled();
  });

  it('Between games (no current): next fixture large with the countdown', () => {
    renderView({
      court: court({ current: null, currentFixtureId: null }),
      clock: clock({
        phase: 'BETWEEN_GAMES',
        phaseDurationMs: MIN,
        phaseStartedAtMs: T0 + 29 * MIN,
      }),
      nowMs: T0 + 29 * MIN + 10_000,
    });
    expect(document.querySelector('[data-idle]')?.getAttribute('data-idle')).toBe('next-soon');
    expect(screen.getByText('Crushers')).toBeInTheDocument();
    expect(screen.getByText('Diggers')).toBeInTheDocument();
    expect(label()).toBe('Next game in');
    expect(screen.queryByRole('button', { name: 'Home plus one' })).not.toBeInTheDocument();
  });

  it('Waiting for the linked clock shows the linked label', () => {
    renderView({
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
    });
    expect(label()).toBe('Waiting for Fours');
  });

  it('Pre-game with the next fixture inside the window highlights the teams', () => {
    renderView({
      court: court({ current: fixture({ status: 'SCHEDULED', scheduledStartMs: T0 + 10 * MIN }) }),
      clock: clock({ phase: 'PRE_GAME', status: 'IDLE', phaseStartedAtMs: null }),
      nowMs: T0,
    });
    expect(document.querySelector('[data-idle]')?.getAttribute('data-idle')).toBe('next-soon');
    expect(screen.getByText('Aces')).toBeInTheDocument();
    expect(screen.getByText(/6:40pm/)).toBeInTheDocument();
  });

  it('Idle with the next game far away shows the court name large and the next game small', () => {
    renderView({
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
    });
    expect(document.querySelector('[data-idle]')?.getAttribute('data-idle')).toBe('next-later');
    expect(screen.getByText(/Next: Eagles vs Falcons · 8:30pm/)).toBeInTheDocument();
  });

  it('Idle with nothing left says no more games tonight', () => {
    renderView({
      court: court({ current: null, currentFixtureId: null, next: null, nextFixtureId: null }),
      clock: null,
    });
    expect(document.querySelector('[data-idle]')?.getAttribute('data-idle')).toBe('no-more-games');
    expect(screen.getAllByText('No more games tonight').length).toBeGreaterThan(0);
  });

  it('shows queued taps and the last error', () => {
    renderView({ pendingCount: 3, lastError: 'No live game on this court' });
    expect(screen.getByText('3 queued')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('No live game on this court');
  });

  it('opens the court switcher from the gear', () => {
    const props = renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Switch court' }));
    expect(props.onOpenSettings).toHaveBeenCalled();
  });
});
