import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClockState } from '@scoreboard/shared';
import { ClockCard } from './ClockCard.js';

const T0 = 1_700_000_000_000;
const clock = (overrides: Partial<ClockState> = {}): ClockState => ({
  id: 'c1',
  sessionId: 's1',
  formatId: 'f1',
  label: 'Fours',
  mode: 'AUTO',
  status: 'IDLE',
  phase: 'PRE_GAME',
  phaseDurationMs: 1_200_000,
  phaseStartedAtMs: null,
  remainingAtPauseMs: null,
  linkedClockId: null,
  slotIndex: 2,
  version: 1,
  ...overrides,
});

function setup(overrides: Partial<ClockState> = {}, linked: ClockState | null = null) {
  const onAction = vi.fn();
  const onAdjust = vi.fn();
  const onSetMode = vi.fn();
  render(
    <ClockCard
      clock={clock(overrides)}
      linkedClock={linked}
      slotCount={6}
      nowMs={T0}
      onAction={onAction}
      onAdjust={onAdjust}
      onSetMode={onSetMode}
    />,
  );
  return { onAction, onAdjust, onSetMode };
}

describe('ClockCard', () => {
  it('offers Start before the game and shows the slot cursor', () => {
    const { onAction, onSetMode } = setup();
    expect(screen.getByText('Slot 3 of 6')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(onAction).toHaveBeenCalledWith('start');
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Single game' }));
    expect(onSetMode).toHaveBeenCalledWith('SINGLE');
    expect(screen.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers Pause, ±30 s, Skip and End game while running', () => {
    const { onAction, onAdjust } = setup({
      status: 'RUNNING',
      phase: 'HALF_1',
      phaseStartedAtMs: T0 - 60_000,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: '+30 s' }));
    fireEvent.click(screen.getByRole('button', { name: '−30 s' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip phase' }));
    fireEvent.click(screen.getByRole('button', { name: 'End game' }));
    expect(onAction).toHaveBeenCalledWith('pause');
    expect(onAdjust).toHaveBeenCalledWith(30);
    expect(onAdjust).toHaveBeenCalledWith(-30);
    expect(onAction).toHaveBeenCalledWith('skipPhase');
    expect(onAction).toHaveBeenCalledWith('endGame');
    expect(document.querySelector('[data-phase-label]')).toHaveTextContent('Half 1');
  });

  it('offers Resume while paused and Next slot when finished', () => {
    const { onAction } = setup({ status: 'PAUSED', phase: 'HALF_2', remainingAtPauseMs: 5000 });
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(onAction).toHaveBeenCalledWith('resume');
    expect(document.querySelector('[data-phase-label]')).toHaveTextContent('Paused');
  });

  it('shows Next slot after a single game finishes and the linked badge when waiting', () => {
    const { onAction } = setup({ phase: 'FINISHED', mode: 'SINGLE' });
    fireEvent.click(screen.getByRole('button', { name: 'Next slot' }));
    expect(onAction).toHaveBeenCalledWith('advanceSlot');
    setup(
      { phase: 'WAITING_FOR_LINKED', linkedClockId: 'fours' },
      clock({
        id: 'fours',
        label: 'Fours',
        status: 'RUNNING',
        phase: 'HALF_2',
        phaseStartedAtMs: T0,
      }),
    );
    expect(screen.getByText('waits for Fours')).toBeInTheDocument();
  });
});
