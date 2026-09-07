import { describe, expect, it } from 'vitest';
import {
  clockReducer,
  createClockState,
  fastForward,
  phaseEndsAtMs,
  remainingMs,
  type ClockContext,
  type ClockDurations,
  type ClockEvent,
} from './reducer.js';
import { type ClockState } from '../domain/live.js';

const MIN = 60_000;
const D: ClockDurations = { halfMs: 20 * MIN, halfTimeMs: 1 * MIN, betweenGamesMs: 1 * MIN };
const T0 = 1_700_000_000_000;
const CLOCK_ID = '11111111-1111-4111-8111-111111111111';
const LINKED_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const FORMAT_ID = '44444444-4444-4444-8444-444444444444';

function ctx(overrides: Partial<ClockContext> = {}): ClockContext {
  return {
    durations: D,
    hasFixturesForSlot: (slot) => slot < 3,
    linked: null,
    ...overrides,
  };
}

function base(overrides: Partial<ClockState> = {}): ClockState {
  return {
    ...createClockState(
      { id: CLOCK_ID, sessionId: SESSION_ID, formatId: FORMAT_ID, label: 'Fours', mode: 'AUTO' },
      D,
    ),
    ...overrides,
  };
}

function apply(state: ClockState, event: ClockEvent, c: ClockContext = ctx()): ClockState {
  const result = clockReducer(state, event, c);
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result.state;
}

function effectsOf(state: ClockState, event: ClockEvent, c: ClockContext = ctx()) {
  const result = clockReducer(state, event, c);
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result.effects;
}

function expectError(state: ClockState, event: ClockEvent, code: string, c: ClockContext = ctx()) {
  const result = clockReducer(state, event, c);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.code).toBe(code);
}

describe('createClockState', () => {
  it('starts idle in PRE_GAME showing the half length', () => {
    const s = base();
    expect(s).toMatchObject({
      phase: 'PRE_GAME',
      status: 'IDLE',
      phaseDurationMs: D.halfMs,
      phaseStartedAtMs: null,
      remainingAtPauseMs: null,
      slotIndex: 0,
      version: 0,
      linkedClockId: null,
    });
    expect(remainingMs(s, T0)).toBe(D.halfMs);
    expect(phaseEndsAtMs(s)).toBeNull();
  });
});

describe('start / expiry chain', () => {
  it('START moves PRE_GAME to a running HALF_1 and bumps the version', () => {
    const s = apply(base(), { type: 'START', nowMs: T0 });
    expect(s).toMatchObject({
      phase: 'HALF_1',
      status: 'RUNNING',
      phaseDurationMs: D.halfMs,
      phaseStartedAtMs: T0,
      remainingAtPauseMs: null,
      version: 1,
    });
    expect(effectsOf(base(), { type: 'START', nowMs: T0 })).toEqual([
      { type: 'PHASE_CHANGED', from: 'PRE_GAME', to: 'HALF_1' },
      { type: 'GAME_STARTED', slotIndex: 0 },
    ]);
  });

  it('START from FINISHED is rejected until the slot advances or the clock resets', () => {
    expectError(base({ phase: 'FINISHED' }), { type: 'START', nowMs: T0 }, 'NOT_STARTABLE');
    expectError(
      apply(base(), { type: 'START', nowMs: T0 }),
      { type: 'START', nowMs: T0 + 1 },
      'NOT_STARTABLE',
    );
  });

  it('computes remaining time and phase end while running', () => {
    const s = apply(base(), { type: 'START', nowMs: T0 });
    expect(remainingMs(s, T0 + 5 * MIN)).toBe(15 * MIN);
    expect(remainingMs(s, T0 + 25 * MIN)).toBe(0);
    expect(phaseEndsAtMs(s)).toBe(T0 + D.halfMs);
  });

  it('EXPIRE before the phase end is rejected as NOT_DUE', () => {
    const s = apply(base(), { type: 'START', nowMs: T0 });
    expectError(s, { type: 'EXPIRE', nowMs: T0 + D.halfMs - 1 }, 'NOT_DUE');
  });

  it('HALF_1 expiry enters HALF_TIME anchored to the true phase end, not the sweep time', () => {
    const s = apply(base(), { type: 'START', nowMs: T0 });
    const late = T0 + D.halfMs + 150;
    const ht = apply(s, { type: 'EXPIRE', nowMs: late });
    expect(ht).toMatchObject({
      phase: 'HALF_TIME',
      status: 'RUNNING',
      phaseDurationMs: D.halfTimeMs,
      phaseStartedAtMs: T0 + D.halfMs,
      version: 2,
    });
  });

  it('HALF_TIME expiry enters HALF_2', () => {
    let s = apply(base(), { type: 'START', nowMs: T0 });
    s = apply(s, { type: 'EXPIRE', nowMs: T0 + D.halfMs });
    s = apply(s, { type: 'EXPIRE', nowMs: T0 + D.halfMs + D.halfTimeMs });
    expect(s).toMatchObject({
      phase: 'HALF_2',
      status: 'RUNNING',
      phaseDurationMs: D.halfMs,
      phaseStartedAtMs: T0 + D.halfMs + D.halfTimeMs,
    });
  });

  it('skips a zero-length half time straight into HALF_2', () => {
    const d = { ...D, halfTimeMs: 0 };
    const c = ctx({ durations: d });
    const s = apply(base(), { type: 'START', nowMs: T0 }, c);
    const h2 = apply(s, { type: 'EXPIRE', nowMs: T0 + D.halfMs }, c);
    expect(h2.phase).toBe('HALF_2');
    expect(h2.phaseStartedAtMs).toBe(T0 + D.halfMs);
  });

  function toHalf2(c: ClockContext = ctx(), init: Partial<ClockState> = {}): ClockState {
    let s = apply(base(init), { type: 'START', nowMs: T0 }, c);
    s = apply(s, { type: 'EXPIRE', nowMs: T0 + D.halfMs }, c);
    s = apply(s, { type: 'EXPIRE', nowMs: T0 + D.halfMs + D.halfTimeMs }, c);
    return s;
  }
  const H2_END = T0 + 2 * D.halfMs + D.halfTimeMs;

  it('HALF_2 expiry in SINGLE mode finishes the clock and ends the game', () => {
    const s = toHalf2(ctx(), { mode: 'SINGLE' });
    const result = clockReducer(s, { type: 'EXPIRE', nowMs: H2_END }, ctx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state).toMatchObject({ phase: 'FINISHED', status: 'IDLE', slotIndex: 0 });
    expect(result.effects).toEqual([
      { type: 'PHASE_CHANGED', from: 'HALF_2', to: 'FINISHED' },
      { type: 'GAME_ENDED', slotIndex: 0 },
      { type: 'BECAME_UNAVAILABLE' },
    ]);
  });

  it('HALF_2 expiry in AUTO mode with more fixtures enters BETWEEN_GAMES', () => {
    const s = toHalf2();
    const result = clockReducer(s, { type: 'EXPIRE', nowMs: H2_END }, ctx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state).toMatchObject({
      phase: 'BETWEEN_GAMES',
      status: 'RUNNING',
      phaseDurationMs: D.betweenGamesMs,
      phaseStartedAtMs: H2_END,
      slotIndex: 0,
    });
    expect(result.effects).toEqual([
      { type: 'PHASE_CHANGED', from: 'HALF_2', to: 'BETWEEN_GAMES' },
      { type: 'GAME_ENDED', slotIndex: 0 },
      {
        type: 'ENTERED_BETWEEN_GAMES',
        phaseStartedAtMs: H2_END,
        phaseDurationMs: D.betweenGamesMs,
      },
    ]);
  });

  it('HALF_2 expiry in AUTO mode with no more fixtures finishes', () => {
    const c = ctx({ hasFixturesForSlot: (slot) => slot === 0 });
    const s = toHalf2(c);
    const done = apply(s, { type: 'EXPIRE', nowMs: H2_END }, c);
    expect(done).toMatchObject({ phase: 'FINISHED', status: 'IDLE' });
  });

  it('BETWEEN_GAMES expiry advances the slot and starts HALF_1 for it', () => {
    let s = toHalf2();
    s = apply(s, { type: 'EXPIRE', nowMs: H2_END });
    const result = clockReducer(s, { type: 'EXPIRE', nowMs: H2_END + D.betweenGamesMs }, ctx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state).toMatchObject({
      phase: 'HALF_1',
      status: 'RUNNING',
      slotIndex: 1,
      phaseStartedAtMs: H2_END + D.betweenGamesMs,
      phaseDurationMs: D.halfMs,
    });
    expect(result.effects).toEqual([
      { type: 'PHASE_CHANGED', from: 'BETWEEN_GAMES', to: 'HALF_1' },
      { type: 'SLOT_ADVANCED', slotIndex: 1 },
      { type: 'GAME_STARTED', slotIndex: 1 },
    ]);
  });

  it('a zero-length gap goes straight from HALF_2 to the next HALF_1', () => {
    const d = { ...D, betweenGamesMs: 0 };
    const c = ctx({ durations: d });
    const s = toHalf2(c);
    const next = apply(s, { type: 'EXPIRE', nowMs: H2_END }, c);
    expect(next).toMatchObject({ phase: 'HALF_1', slotIndex: 1, phaseStartedAtMs: H2_END });
  });

  it('BETWEEN_GAMES expiry finishes if the next slot has no fixtures after all', () => {
    let s = toHalf2();
    s = apply(s, { type: 'EXPIRE', nowMs: H2_END });
    const c = ctx({ hasFixturesForSlot: () => false });
    const done = apply(s, { type: 'EXPIRE', nowMs: H2_END + D.betweenGamesMs }, c);
    expect(done.phase).toBe('FINISHED');
  });

  describe('linked clocks (Pairs wait for Fours)', () => {
    const linkedRunning = (phase: ClockState['phase']) =>
      ctx({
        linked: { phase, status: 'RUNNING', phaseStartedAtMs: T0, phaseDurationMs: D.halfMs },
      });

    it.each(['HALF_1', 'HALF_TIME', 'HALF_2'] as const)(
      'waits when the linked clock is still in %s',
      (phase) => {
        const c = linkedRunning(phase);
        const s = toHalf2(c, { linkedClockId: LINKED_ID });
        const result = clockReducer(s, { type: 'EXPIRE', nowMs: H2_END }, c);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state).toMatchObject({
          phase: 'WAITING_FOR_LINKED',
          status: 'IDLE',
          phaseDurationMs: 0,
          phaseStartedAtMs: H2_END,
          slotIndex: 0,
        });
        expect(result.effects).toEqual([
          { type: 'PHASE_CHANGED', from: 'HALF_2', to: 'WAITING_FOR_LINKED' },
          { type: 'GAME_ENDED', slotIndex: 0 },
        ]);
      },
    );

    it('waits even when the linked clock is paused mid-half', () => {
      const c = ctx({
        linked: {
          phase: 'HALF_2',
          status: 'PAUSED',
          phaseStartedAtMs: T0,
          phaseDurationMs: D.halfMs,
        },
      });
      const s = toHalf2(c, { linkedClockId: LINKED_ID });
      expect(apply(s, { type: 'EXPIRE', nowMs: H2_END }, c).phase).toBe('WAITING_FOR_LINKED');
    });

    it('joins the linked BETWEEN_GAMES gap with the same start time', () => {
      const gapStart = H2_END - 20_000;
      const c = ctx({
        linked: {
          phase: 'BETWEEN_GAMES',
          status: 'RUNNING',
          phaseStartedAtMs: gapStart,
          phaseDurationMs: D.betweenGamesMs,
        },
      });
      const s = toHalf2(c, { linkedClockId: LINKED_ID });
      const joined = apply(s, { type: 'EXPIRE', nowMs: H2_END }, c);
      expect(joined).toMatchObject({
        phase: 'BETWEEN_GAMES',
        status: 'RUNNING',
        phaseStartedAtMs: gapStart,
        phaseDurationMs: D.betweenGamesMs,
      });
    });

    it.each(['PRE_GAME', 'FINISHED', 'WAITING_FOR_LINKED'] as const)(
      'runs on its own cadence when the linked clock is %s',
      (phase) => {
        const c = ctx({
          linked: { phase, status: 'IDLE', phaseStartedAtMs: null, phaseDurationMs: 0 },
        });
        const s = toHalf2(c, { linkedClockId: LINKED_ID });
        const next = apply(s, { type: 'EXPIRE', nowMs: H2_END }, c);
        expect(next).toMatchObject({ phase: 'BETWEEN_GAMES', phaseStartedAtMs: H2_END });
      },
    );

    it('does not wait when it has no more fixtures itself', () => {
      const c = ctx({
        ...linkedRunning('HALF_1'),
        hasFixturesForSlot: (slot) => slot === 0,
      });
      const s = toHalf2(c, { linkedClockId: LINKED_ID });
      expect(apply(s, { type: 'EXPIRE', nowMs: H2_END }, c).phase).toBe('FINISHED');
    });

    it('ignores the link in SINGLE mode', () => {
      const c = linkedRunning('HALF_1');
      const s = toHalf2(c, { linkedClockId: LINKED_ID, mode: 'SINGLE' });
      expect(apply(s, { type: 'EXPIRE', nowMs: H2_END }, c).phase).toBe('FINISHED');
    });

    it('leaves WAITING when the linked clock enters BETWEEN_GAMES, sharing its timestamps', () => {
      const c = linkedRunning('HALF_2');
      const s = toHalf2(c, { linkedClockId: LINKED_ID });
      const waiting = apply(s, { type: 'EXPIRE', nowMs: H2_END }, c);
      const gapStart = H2_END + 5 * MIN;
      const result = clockReducer(
        waiting,
        {
          type: 'LINKED_ENTERED_BETWEEN_GAMES',
          nowMs: gapStart + 10,
          phaseStartedAtMs: gapStart,
          phaseDurationMs: 90_000,
        },
        c,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state).toMatchObject({
        phase: 'BETWEEN_GAMES',
        status: 'RUNNING',
        phaseStartedAtMs: gapStart,
        phaseDurationMs: 90_000,
      });
      expect(result.effects).toEqual([
        { type: 'PHASE_CHANGED', from: 'WAITING_FOR_LINKED', to: 'BETWEEN_GAMES' },
      ]);
    });

    it('rejects LINKED_ENTERED_BETWEEN_GAMES when not waiting', () => {
      expectError(
        base(),
        {
          type: 'LINKED_ENTERED_BETWEEN_GAMES',
          nowMs: T0,
          phaseStartedAtMs: T0,
          phaseDurationMs: 1,
        },
        'NOT_WAITING',
      );
    });

    it('continues on its own cadence when the linked clock becomes unavailable', () => {
      const c = linkedRunning('HALF_2');
      const s = toHalf2(c, { linkedClockId: LINKED_ID });
      const waiting = apply(s, { type: 'EXPIRE', nowMs: H2_END }, c);
      const now = H2_END + 2 * MIN;
      const next = apply(waiting, { type: 'LINKED_UNAVAILABLE', nowMs: now }, c);
      expect(next).toMatchObject({
        phase: 'BETWEEN_GAMES',
        status: 'RUNNING',
        phaseStartedAtMs: now,
        phaseDurationMs: D.betweenGamesMs,
      });
      expectError(base(), { type: 'LINKED_UNAVAILABLE', nowMs: T0 }, 'NOT_WAITING');
    });

    it('finishes instead of continuing when unavailable and the remaining fixtures were removed', () => {
      let remaining = true;
      const c = ctx({
        ...linkedRunning('HALF_2'),
        hasFixturesForSlot: (slot) => slot === 0 || remaining,
      });
      let s = toHalf2(c, { linkedClockId: LINKED_ID });
      s = apply(s, { type: 'EXPIRE', nowMs: H2_END }, c);
      expect(s.phase).toBe('WAITING_FOR_LINKED');
      remaining = false;
      expect(apply(s, { type: 'LINKED_UNAVAILABLE', nowMs: H2_END + 1 }, c).phase).toBe('FINISHED');
    });

    it('removing the link while waiting releases the clock', () => {
      const c = linkedRunning('HALF_2');
      const s = toHalf2(c, { linkedClockId: LINKED_ID });
      const waiting = apply(s, { type: 'EXPIRE', nowMs: H2_END }, c);
      const released = apply(
        waiting,
        { type: 'SET_LINK', linkedClockId: null, nowMs: H2_END + 1 },
        c,
      );
      expect(released).toMatchObject({ phase: 'BETWEEN_GAMES', linkedClockId: null });
    });
  });
});

describe('pause / resume / adjust', () => {
  const running = () => apply(base(), { type: 'START', nowMs: T0 });

  it('PAUSE stores the remaining time and RESUME restores it without a jump', () => {
    const paused = apply(running(), { type: 'PAUSE', nowMs: T0 + 5 * MIN });
    expect(paused).toMatchObject({
      status: 'PAUSED',
      remainingAtPauseMs: 15 * MIN,
      phase: 'HALF_1',
    });
    expect(remainingMs(paused, T0 + 9 * MIN)).toBe(15 * MIN);
    expect(phaseEndsAtMs(paused)).toBeNull();

    const resumed = apply(paused, { type: 'RESUME', nowMs: T0 + 9 * MIN });
    expect(resumed).toMatchObject({ status: 'RUNNING', remainingAtPauseMs: null });
    expect(remainingMs(resumed, T0 + 9 * MIN)).toBe(15 * MIN);
    expect(resumed.phaseStartedAtMs).toBe(T0 + 9 * MIN - 5 * MIN);
  });

  it('rejects PAUSE when not running and RESUME when not paused', () => {
    expectError(base(), { type: 'PAUSE', nowMs: T0 }, 'NOT_RUNNING');
    expectError(running(), { type: 'RESUME', nowMs: T0 }, 'NOT_PAUSED');
    const paused = apply(running(), { type: 'PAUSE', nowMs: T0 + 1 });
    expectError(paused, { type: 'PAUSE', nowMs: T0 + 2 }, 'NOT_RUNNING');
  });

  it('ADJUST while running changes the remaining time and clamps at zero', () => {
    const plus = apply(running(), { type: 'ADJUST', deltaMs: 30_000, nowMs: T0 + MIN });
    expect(remainingMs(plus, T0 + MIN)).toBe(19 * MIN + 30_000);
    expect(plus.phaseStartedAtMs).toBe(T0);
    const minus = apply(plus, { type: 'ADJUST', deltaMs: -60_000, nowMs: T0 + MIN });
    expect(remainingMs(minus, T0 + MIN)).toBe(18 * MIN + 30_000);
    const clamped = apply(minus, { type: 'ADJUST', deltaMs: -60 * MIN, nowMs: T0 + MIN });
    expect(remainingMs(clamped, T0 + MIN)).toBe(0);
    expect(phaseEndsAtMs(clamped)).toBe(T0 + MIN);
  });

  it('ADJUST while paused changes the stored remaining time', () => {
    const paused = apply(running(), { type: 'PAUSE', nowMs: T0 + 5 * MIN });
    const adjusted = apply(paused, { type: 'ADJUST', deltaMs: -30_000, nowMs: T0 + 6 * MIN });
    expect(adjusted.remainingAtPauseMs).toBe(15 * MIN - 30_000);
    const floor = apply(adjusted, { type: 'ADJUST', deltaMs: -60 * MIN, nowMs: T0 + 6 * MIN });
    expect(floor.remainingAtPauseMs).toBe(0);
  });

  it('ADJUST before the game shortens or lengthens the upcoming half', () => {
    const shorter = apply(base(), { type: 'ADJUST', deltaMs: -5 * MIN, nowMs: T0 });
    expect(shorter.phaseDurationMs).toBe(15 * MIN);
    const floor = apply(shorter, { type: 'ADJUST', deltaMs: -60 * MIN, nowMs: T0 });
    expect(floor.phaseDurationMs).toBe(1000);
    expectError(
      base({ phase: 'FINISHED' }),
      { type: 'ADJUST', deltaMs: 1000, nowMs: T0 },
      'NOT_ADJUSTABLE',
    );
  });
});

describe('skip / end game / reset / mode / link / advance', () => {
  const running = () => apply(base(), { type: 'START', nowMs: T0 });

  it('SKIP_PHASE moves to the next phase from now', () => {
    const skipped = apply(running(), { type: 'SKIP_PHASE', nowMs: T0 + 3 * MIN });
    expect(skipped).toMatchObject({
      phase: 'HALF_TIME',
      status: 'RUNNING',
      phaseStartedAtMs: T0 + 3 * MIN,
    });
  });

  it('SKIP_PHASE from PAUSED resumes into the next phase', () => {
    const paused = apply(running(), { type: 'PAUSE', nowMs: T0 + MIN });
    const skipped = apply(paused, { type: 'SKIP_PHASE', nowMs: T0 + 2 * MIN });
    expect(skipped).toMatchObject({
      phase: 'HALF_TIME',
      status: 'RUNNING',
      remainingAtPauseMs: null,
    });
  });

  it('SKIP_PHASE from BETWEEN_GAMES starts the next slot immediately', () => {
    let s = running();
    s = apply(s, { type: 'SKIP_PHASE', nowMs: T0 + 1 });
    s = apply(s, { type: 'SKIP_PHASE', nowMs: T0 + 2 });
    s = apply(s, { type: 'SKIP_PHASE', nowMs: T0 + 3 });
    expect(s.phase).toBe('BETWEEN_GAMES');
    const next = apply(s, { type: 'SKIP_PHASE', nowMs: T0 + 4 });
    expect(next).toMatchObject({ phase: 'HALF_1', slotIndex: 1, phaseStartedAtMs: T0 + 4 });
  });

  it('SKIP_PHASE while waiting stops waiting and runs its own gap', () => {
    const c = ctx({
      linked: {
        phase: 'HALF_2',
        status: 'RUNNING',
        phaseStartedAtMs: T0,
        phaseDurationMs: D.halfMs,
      },
    });
    let s = apply(base({ linkedClockId: LINKED_ID }), { type: 'START', nowMs: T0 }, c);
    s = apply(s, { type: 'SKIP_PHASE', nowMs: T0 + 1 }, c);
    s = apply(s, { type: 'SKIP_PHASE', nowMs: T0 + 2 }, c);
    s = apply(s, { type: 'SKIP_PHASE', nowMs: T0 + 3 }, c);
    expect(s.phase).toBe('WAITING_FOR_LINKED');
    expect(apply(s, { type: 'SKIP_PHASE', nowMs: T0 + 4 }, c)).toMatchObject({
      phase: 'BETWEEN_GAMES',
      phaseStartedAtMs: T0 + 4,
    });
  });

  it('SKIP_PHASE is rejected when nothing is in progress', () => {
    expectError(base(), { type: 'SKIP_PHASE', nowMs: T0 }, 'NOT_ACTIVE');
    expectError(base({ phase: 'FINISHED' }), { type: 'SKIP_PHASE', nowMs: T0 }, 'NOT_ACTIVE');
  });

  it('END_GAME ends the current game from any half and finalises it', () => {
    const result = clockReducer(running(), { type: 'END_GAME', nowMs: T0 + 2 * MIN }, ctx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state).toMatchObject({ phase: 'BETWEEN_GAMES', phaseStartedAtMs: T0 + 2 * MIN });
    expect(result.effects).toContainEqual({ type: 'GAME_ENDED', slotIndex: 0 });
    expectError(base(), { type: 'END_GAME', nowMs: T0 }, 'NOT_IN_GAME');
    const gap = apply(running(), { type: 'END_GAME', nowMs: T0 + 2 * MIN });
    expectError(gap, { type: 'END_GAME', nowMs: T0 + 3 * MIN }, 'NOT_IN_GAME');
  });

  it('RESET returns to PRE_GAME for the same slot and tells dependants', () => {
    const paused = apply(running(), { type: 'PAUSE', nowMs: T0 + MIN });
    const result = clockReducer(paused, { type: 'RESET', nowMs: T0 + 2 * MIN }, ctx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state).toMatchObject({
      phase: 'PRE_GAME',
      status: 'IDLE',
      phaseDurationMs: D.halfMs,
      phaseStartedAtMs: null,
      remainingAtPauseMs: null,
      slotIndex: 0,
      mode: 'AUTO',
    });
    expect(result.effects).toEqual([
      { type: 'PHASE_CHANGED', from: 'HALF_1', to: 'PRE_GAME' },
      { type: 'BECAME_UNAVAILABLE' },
    ]);
  });

  it('SET_MODE and SET_LINK update fields and bump the version', () => {
    const single = apply(base(), { type: 'SET_MODE', mode: 'SINGLE', nowMs: T0 });
    expect(single).toMatchObject({ mode: 'SINGLE', version: 1 });
    const linked = apply(single, { type: 'SET_LINK', linkedClockId: LINKED_ID, nowMs: T0 });
    expect(linked).toMatchObject({ linkedClockId: LINKED_ID, version: 2 });
    expectError(base(), { type: 'SET_LINK', linkedClockId: CLOCK_ID, nowMs: T0 }, 'SELF_LINK');
  });

  it('ADVANCE_SLOT moves an idle clock to the next slot and assigns fixtures', () => {
    const finished = base({ phase: 'FINISHED', slotIndex: 0 });
    const result = clockReducer(finished, { type: 'ADVANCE_SLOT', nowMs: T0 }, ctx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state).toMatchObject({
      phase: 'PRE_GAME',
      status: 'IDLE',
      slotIndex: 1,
      phaseDurationMs: D.halfMs,
    });
    expect(result.effects).toEqual([
      { type: 'PHASE_CHANGED', from: 'FINISHED', to: 'PRE_GAME' },
      { type: 'SLOT_ADVANCED', slotIndex: 1 },
    ]);
    expectError(running(), { type: 'ADVANCE_SLOT', nowMs: T0 }, 'NOT_IDLE');
    expectError(
      base({ phase: 'FINISHED', slotIndex: 2 }),
      { type: 'ADVANCE_SLOT', nowMs: T0 },
      'NO_FIXTURES',
    );
  });
});

describe('fastForward (restart recovery)', () => {
  it('replays every missed expiry using real timestamps', () => {
    const s = apply(base(), { type: 'START', nowMs: T0 });
    const now = T0 + 2 * D.halfMs + D.halfTimeMs + D.betweenGamesMs + 5 * MIN;
    const { state, effects } = fastForward(s, ctx(), now);
    expect(state).toMatchObject({ phase: 'HALF_1', slotIndex: 1, status: 'RUNNING' });
    expect(state.phaseStartedAtMs).toBe(T0 + 2 * D.halfMs + D.halfTimeMs + D.betweenGamesMs);
    expect(remainingMs(state, now)).toBe(D.halfMs - 5 * MIN);
    expect(effects.map((e) => e.type)).toEqual([
      'PHASE_CHANGED',
      'PHASE_CHANGED',
      'PHASE_CHANGED',
      'GAME_ENDED',
      'ENTERED_BETWEEN_GAMES',
      'PHASE_CHANGED',
      'SLOT_ADVANCED',
      'GAME_STARTED',
    ]);
  });

  it('does nothing for idle, paused or not-yet-due clocks', () => {
    expect(fastForward(base(), ctx(), T0 + 999 * MIN).effects).toEqual([]);
    const paused = apply(apply(base(), { type: 'START', nowMs: T0 }), {
      type: 'PAUSE',
      nowMs: T0 + 1,
    });
    expect(fastForward(paused, ctx(), T0 + 999 * MIN).state).toEqual(paused);
    const running = apply(base(), { type: 'START', nowMs: T0 });
    expect(fastForward(running, ctx(), T0 + 1).state).toEqual(running);
  });

  it('stops at WAITING_FOR_LINKED because the linked clock decides what happens next', () => {
    const c = ctx({
      linked: {
        phase: 'HALF_1',
        status: 'RUNNING',
        phaseStartedAtMs: T0,
        phaseDurationMs: D.halfMs,
      },
    });
    const s = apply(base({ linkedClockId: LINKED_ID }), { type: 'START', nowMs: T0 }, c);
    const { state } = fastForward(s, c, T0 + 10 * D.halfMs);
    expect(state.phase).toBe('WAITING_FOR_LINKED');
  });

  it('runs a whole session to FINISHED and never loops forever', () => {
    const s = apply(base(), { type: 'START', nowMs: T0 });
    const { state } = fastForward(s, ctx(), T0 + 1000 * D.halfMs);
    expect(state).toMatchObject({ phase: 'FINISHED', slotIndex: 2 });
  });
});
