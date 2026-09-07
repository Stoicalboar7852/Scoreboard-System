import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { INACTIVE_TIMEOUT, type CourtLiveState } from '@scoreboard/shared';
import { CourtGrid, seenLabel } from './CourtGrid.js';

const T0 = 1_700_000_000_000;
const court = (overrides: Partial<CourtLiveState> = {}): CourtLiveState => ({
  courtId: 'k1',
  courtName: 'Court 1',
  sessionId: 's1',
  clockId: 'c1',
  currentFixtureId: 'f1',
  nextFixtureId: null,
  current: {
    fixtureId: 'f1',
    competitionId: 'comp',
    competitionName: 'A Grade',
    formatId: 'f',
    formatName: 'Fours',
    stage: 'REGULAR',
    status: 'LIVE',
    homeName: 'Aces',
    awayName: 'Blockers',
    homeShortName: null,
    awayShortName: null,
    slotIndex: 0,
    scheduledStartMs: null,
    adHoc: false,
  },
  next: null,
  homeScore: 3,
  awayScore: 1,
  timeout: INACTIVE_TIMEOUT,
  lastControllerSeenMs: T0 - 10_000,
  lastScoreboardSeenMs: null,
  version: 1,
  ...overrides,
});

describe('seenLabel', () => {
  it('classifies last-seen ages', () => {
    expect(seenLabel(null, T0)).toEqual({ text: 'never', tone: 'danger' });
    expect(seenLabel(T0 - 5000, T0)).toEqual({ text: '5s ago', tone: 'success' });
    expect(seenLabel(T0 - 90_000, T0)).toEqual({ text: '2 min ago', tone: 'warning' });
    expect(seenLabel(T0 - 600_000, T0)).toEqual({ text: 'offline', tone: 'danger' });
  });
});

describe('CourtGrid', () => {
  it('shows the fixture, seen badges, saves edited scores and ends the game', () => {
    const handlers = {
      onSetScore: vi.fn(),
      onEndGame: vi.fn(),
      onReopen: vi.fn(),
      onAssign: vi.fn(),
      onQuickGame: vi.fn(),
      onClear: vi.fn(),
      onEndTimeout: vi.fn(),
    };
    render(<CourtGrid courts={[court()]} clocks={{}} nowMs={T0} {...handlers} />);
    expect(screen.getByText('Aces')).toBeInTheDocument();
    expect(screen.getByText('ctrl 10s ago')).toBeInTheDocument();
    expect(screen.getByText('board never')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Home score'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(handlers.onSetScore).toHaveBeenCalledWith('k1', 5, 1);
    fireEvent.click(screen.getByRole('button', { name: 'End game' }));
    expect(handlers.onEndGame).toHaveBeenCalledWith('k1');
    fireEvent.click(screen.getByRole('button', { name: 'Quick game' }));
    expect(handlers.onQuickGame).toHaveBeenCalledWith('k1');
  });

  it('shows Reopen for a completed game, the time-out badge, and the next game when idle', () => {
    const handlers = {
      onSetScore: vi.fn(),
      onEndGame: vi.fn(),
      onReopen: vi.fn(),
      onAssign: vi.fn(),
      onQuickGame: vi.fn(),
      onClear: vi.fn(),
      onEndTimeout: vi.fn(),
    };
    render(
      <CourtGrid
        courts={[
          court({
            courtId: 'k1',
            current: { ...court().current!, status: 'COMPLETED' },
            timeout: { active: true, startedAtMs: T0, durationMs: 60_000, calledBy: 'HOME' },
          }),
          court({
            courtId: 'k2',
            courtName: 'Court 2',
            current: null,
            next: {
              ...court().current!,
              homeName: 'Crushers',
              awayName: 'Diggers',
              status: 'SCHEDULED',
            },
          }),
        ]}
        clocks={{}}
        nowMs={T0}
        {...handlers}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(handlers.onReopen).toHaveBeenCalledWith('k1');
    expect(screen.getByText('time out')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'End time out' }));
    expect(handlers.onEndTimeout).toHaveBeenCalledWith('k1');
    expect(screen.getByText('Next: Crushers vs Diggers')).toBeInTheDocument();
  });
});
