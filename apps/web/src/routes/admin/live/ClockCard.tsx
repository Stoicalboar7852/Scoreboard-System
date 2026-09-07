import { describeClock, phaseEndsAtMs, type ClockState } from '@scoreboard/shared';
import { Countdown } from '../../../components/Countdown.js';
import { PhaseLabel } from '../../../components/live/PhaseLabel.js';
import { Badge, Button } from '../../../components/ui/index.js';

export interface ClockCardProps {
  clock: ClockState;
  linkedClock: ClockState | null;
  slotCount: number;
  nowMs: number;
  onAction: (
    action: 'start' | 'pause' | 'resume' | 'skipPhase' | 'reset' | 'endGame' | 'advanceSlot',
  ) => void;
  onAdjust: (deltaSeconds: number) => void;
  onSetMode: (mode: 'SINGLE' | 'AUTO') => void;
}

/** One card per clock (§7.3): mode toggle, phase, big clock, slot cursor and transport buttons. */
export function ClockCard({
  clock,
  linkedClock,
  slotCount,
  nowMs,
  onAction,
  onAdjust,
  onSetMode,
}: ClockCardProps) {
  const display = describeClock(
    clock,
    linkedClock,
    { active: false, startedAtMs: null, durationMs: 0, calledBy: null },
    nowMs,
  );
  const endsAt =
    clock.status === 'RUNNING'
      ? phaseEndsAtMs(clock)
      : display.fromLinked && linkedClock
        ? phaseEndsAtMs(linkedClock)
        : null;
  const inGame =
    clock.phase === 'HALF_1' || clock.phase === 'HALF_TIME' || clock.phase === 'HALF_2';
  const canStart = clock.status === 'IDLE' && clock.phase === 'PRE_GAME';
  const canAdvance =
    clock.status === 'IDLE' && (clock.phase === 'PRE_GAME' || clock.phase === 'FINISHED');
  const active =
    clock.status !== 'IDLE' ||
    clock.phase === 'BETWEEN_GAMES' ||
    clock.phase === 'WAITING_FOR_LINKED';

  return (
    <section className="rounded-xl border border-border bg-surface p-4" data-clock-card={clock.id}>
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-team">{clock.label}</h3>
        <div className="flex items-center gap-2">
          {clock.linkedClockId && (
            <Badge tone="info">waits for {linkedClock?.label ?? 'linked clock'}</Badge>
          )}
          <div
            className="inline-flex overflow-hidden rounded-md border border-border text-xs"
            role="group"
            aria-label="Clock mode"
          >
            {(['SINGLE', 'AUTO'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onSetMode(mode)}
                className={`px-2 py-1 ${clock.mode === mode ? 'bg-court text-bg' : 'bg-surface-2 text-text-muted'}`}
                aria-pressed={clock.mode === mode}
              >
                {mode === 'SINGLE' ? 'Single game' : 'Auto'}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className="flex items-center justify-between gap-4">
        <div>
          <PhaseLabel
            label={display.label || 'Ready'}
            token={display.token}
            paused={display.paused}
            className="text-sm"
          />
          <p className="text-xs text-text-muted">
            Slot {clock.slotIndex + 1} of {Math.max(slotCount, clock.slotIndex + 1)}
          </p>
        </div>
        <Countdown
          endsAtMs={endsAt}
          staticMs={display.remainingMs}
          className="text-5xl font-bold text-score"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {canStart && (
          <Button variant="primary" onClick={() => onAction('start')}>
            Start
          </Button>
        )}
        {clock.status === 'RUNNING' && <Button onClick={() => onAction('pause')}>Pause</Button>}
        {clock.status === 'PAUSED' && (
          <Button variant="primary" onClick={() => onAction('resume')}>
            Resume
          </Button>
        )}
        <Button onClick={() => onAdjust(30)} disabled={clock.phase === 'FINISHED'}>
          +30 s
        </Button>
        <Button onClick={() => onAdjust(-30)} disabled={clock.phase === 'FINISHED'}>
          −30 s
        </Button>
        <Button onClick={() => onAction('skipPhase')} disabled={!active}>
          Skip phase
        </Button>
        {inGame && (
          <Button onClick={() => onAction('endGame')} variant="danger">
            End game
          </Button>
        )}
        {canAdvance && clock.phase === 'FINISHED' && (
          <Button onClick={() => onAction('advanceSlot')}>Next slot</Button>
        )}
        <Button variant="ghost" onClick={() => onAction('reset')}>
          Reset
        </Button>
      </div>
    </section>
  );
}
