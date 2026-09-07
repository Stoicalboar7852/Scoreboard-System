import { type ClockMode, type ClockPhase, type ClockStatus } from '../domain/enums.js';
import { type ClockState } from '../domain/live.js';

/** Durations derived from the clock's game format. */
export interface ClockDurations {
  halfMs: number;
  halfTimeMs: number;
  betweenGamesMs: number;
}

/** The subset of a linked clock's state the reducer needs to decide whether to wait. */
export interface LinkedClockView {
  phase: ClockPhase;
  status: ClockStatus;
  phaseStartedAtMs: number | null;
  phaseDurationMs: number;
}

export interface ClockContext {
  durations: ClockDurations;
  /** True when at least one court has a fixture for this clock at the given slot. */
  hasFixturesForSlot: (slotIndex: number) => boolean;
  /** Current state of the clock this one waits for (null when unlinked or unknown). */
  linked: LinkedClockView | null;
}

export type ClockEvent =
  | { type: 'START'; nowMs: number }
  | { type: 'PAUSE'; nowMs: number }
  | { type: 'RESUME'; nowMs: number }
  | { type: 'ADJUST'; nowMs: number; deltaMs: number }
  | { type: 'SKIP_PHASE'; nowMs: number }
  | { type: 'EXPIRE'; nowMs: number }
  | { type: 'END_GAME'; nowMs: number }
  | { type: 'RESET'; nowMs: number }
  | { type: 'SET_MODE'; nowMs: number; mode: ClockMode }
  | { type: 'SET_LINK'; nowMs: number; linkedClockId: string | null }
  | { type: 'ADVANCE_SLOT'; nowMs: number }
  | {
      type: 'LINKED_ENTERED_BETWEEN_GAMES';
      nowMs: number;
      phaseStartedAtMs: number;
      phaseDurationMs: number;
    }
  | { type: 'LINKED_UNAVAILABLE'; nowMs: number };

export type ClockEventType = ClockEvent['type'];

/** Side effects the server must perform after a successful transition, in order. */
export type ClockEffect =
  | { type: 'PHASE_CHANGED'; from: ClockPhase; to: ClockPhase }
  | { type: 'GAME_STARTED'; slotIndex: number }
  | { type: 'GAME_ENDED'; slotIndex: number }
  | { type: 'SLOT_ADVANCED'; slotIndex: number }
  | { type: 'ENTERED_BETWEEN_GAMES'; phaseStartedAtMs: number; phaseDurationMs: number }
  | { type: 'BECAME_UNAVAILABLE' };

export type ClockRuleCode =
  | 'NOT_STARTABLE'
  | 'NOT_RUNNING'
  | 'NOT_PAUSED'
  | 'NOT_ADJUSTABLE'
  | 'NOT_ACTIVE'
  | 'NOT_IN_GAME'
  | 'NOT_DUE'
  | 'NOT_WAITING'
  | 'NOT_IDLE'
  | 'NO_FIXTURES'
  | 'SELF_LINK';

export type ClockResult =
  | { ok: true; state: ClockState; effects: ClockEffect[] }
  | { ok: false; code: ClockRuleCode; message: string };

const MIN_PHASE_MS = 1000;
const IN_GAME_PHASES: ReadonlySet<ClockPhase> = new Set(['HALF_1', 'HALF_TIME', 'HALF_2']);

export interface CreateClockInit {
  id: string;
  sessionId: string;
  formatId: string | null;
  label: string;
  mode: ClockMode;
  linkedClockId?: string | null;
  slotIndex?: number;
}

/** A fresh clock: idle before the first game, displaying the half length. */
export function createClockState(init: CreateClockInit, durations: ClockDurations): ClockState {
  return {
    id: init.id,
    sessionId: init.sessionId,
    formatId: init.formatId,
    label: init.label,
    mode: init.mode,
    status: 'IDLE',
    phase: 'PRE_GAME',
    phaseDurationMs: durations.halfMs,
    phaseStartedAtMs: null,
    remainingAtPauseMs: null,
    linkedClockId: init.linkedClockId ?? null,
    slotIndex: init.slotIndex ?? 0,
    version: 0,
  };
}

/** Milliseconds left in the current phase at `nowMs` (server time). */
export function remainingMs(state: ClockState, nowMs: number): number {
  if (state.status === 'RUNNING' && state.phaseStartedAtMs !== null) {
    return Math.max(0, state.phaseDurationMs - (nowMs - state.phaseStartedAtMs));
  }
  return state.remainingAtPauseMs ?? state.phaseDurationMs;
}

/** Absolute server time when the running phase ends, or null when not running. */
export function phaseEndsAtMs(state: ClockState): number | null {
  if (state.status !== 'RUNNING' || state.phaseStartedAtMs === null) return null;
  return state.phaseStartedAtMs + state.phaseDurationMs;
}

export function isInGame(state: Pick<ClockState, 'phase'>): boolean {
  return IN_GAME_PHASES.has(state.phase);
}

function fail(code: ClockRuleCode, message: string): ClockResult {
  return { ok: false, code, message };
}

function ok(prev: ClockState, next: Partial<ClockState>, effects: ClockEffect[]): ClockResult {
  const state: ClockState = { ...prev, ...next, version: prev.version + 1 };
  const changed: ClockEffect[] =
    state.phase !== prev.phase
      ? [{ type: 'PHASE_CHANGED', from: prev.phase, to: state.phase }, ...effects]
      : effects;
  return { ok: true, state, effects: changed };
}

function runningPhase(
  phase: ClockPhase,
  durationMs: number,
  startedAtMs: number,
): Partial<ClockState> {
  return {
    phase,
    status: 'RUNNING',
    phaseDurationMs: durationMs,
    phaseStartedAtMs: startedAtMs,
    remainingAtPauseMs: null,
  };
}

function finishedState(): Partial<ClockState> {
  return {
    phase: 'FINISHED',
    status: 'IDLE',
    phaseDurationMs: 0,
    phaseStartedAtMs: null,
    remainingAtPauseMs: null,
  };
}

/** Starts HALF_1 for `slotIndex` at `atMs`, or finishes when that slot has no fixtures. */
function beginSlot(
  state: ClockState,
  ctx: ClockContext,
  slotIndex: number,
  atMs: number,
  extraEffects: ClockEffect[],
): ClockResult {
  if (!ctx.hasFixturesForSlot(slotIndex)) {
    return ok(state, finishedState(), [...extraEffects, { type: 'BECAME_UNAVAILABLE' }]);
  }
  const effects: ClockEffect[] = [...extraEffects];
  if (slotIndex !== state.slotIndex) effects.push({ type: 'SLOT_ADVANCED', slotIndex });
  effects.push({ type: 'GAME_STARTED', slotIndex });
  return ok(state, { ...runningPhase('HALF_1', ctx.durations.halfMs, atMs), slotIndex }, effects);
}

/** Enters the between-games gap starting at `startedAtMs`, skipping it when zero-length. */
function beginGap(
  state: ClockState,
  ctx: ClockContext,
  startedAtMs: number,
  durationMs: number,
  extraEffects: ClockEffect[],
): ClockResult {
  if (!ctx.hasFixturesForSlot(state.slotIndex + 1)) {
    return ok(state, finishedState(), [...extraEffects, { type: 'BECAME_UNAVAILABLE' }]);
  }
  if (durationMs <= 0) {
    return beginSlot(state, ctx, state.slotIndex + 1, startedAtMs, extraEffects);
  }
  return ok(state, runningPhase('BETWEEN_GAMES', durationMs, startedAtMs), [
    ...extraEffects,
    { type: 'ENTERED_BETWEEN_GAMES', phaseStartedAtMs: startedAtMs, phaseDurationMs: durationMs },
  ]);
}

/** What happens when HALF_2 ends (by expiry, skip or admin end-game) at `atMs`. */
function afterHalf2(state: ClockState, ctx: ClockContext, atMs: number): ClockResult {
  const ended: ClockEffect[] = [{ type: 'GAME_ENDED', slotIndex: state.slotIndex }];
  const hasMore = ctx.hasFixturesForSlot(state.slotIndex + 1);
  if (state.mode === 'SINGLE' || !hasMore) {
    return ok(state, finishedState(), [...ended, { type: 'BECAME_UNAVAILABLE' }]);
  }
  const linked = state.linkedClockId ? ctx.linked : null;
  if (linked) {
    if (IN_GAME_PHASES.has(linked.phase)) {
      return ok(
        state,
        {
          phase: 'WAITING_FOR_LINKED',
          status: 'IDLE',
          phaseDurationMs: 0,
          phaseStartedAtMs: atMs,
          remainingAtPauseMs: null,
        },
        ended,
      );
    }
    if (
      linked.phase === 'BETWEEN_GAMES' &&
      linked.status === 'RUNNING' &&
      linked.phaseStartedAtMs !== null
    ) {
      return ok(
        state,
        runningPhase('BETWEEN_GAMES', linked.phaseDurationMs, linked.phaseStartedAtMs),
        ended,
      );
    }
  }
  return beginGap(state, ctx, atMs, ctx.durations.betweenGamesMs, ended);
}

/** Advances past the current phase as if it ended at `atMs`. */
function advancePhase(state: ClockState, ctx: ClockContext, atMs: number): ClockResult {
  const { halfMs, halfTimeMs } = ctx.durations;
  switch (state.phase) {
    case 'HALF_1':
      if (halfTimeMs <= 0) return ok(state, runningPhase('HALF_2', halfMs, atMs), []);
      return ok(state, runningPhase('HALF_TIME', halfTimeMs, atMs), []);
    case 'HALF_TIME':
      return ok(state, runningPhase('HALF_2', halfMs, atMs), []);
    case 'HALF_2':
      return afterHalf2(state, ctx, atMs);
    case 'BETWEEN_GAMES':
      return beginSlot(state, ctx, state.slotIndex + 1, atMs, []);
    case 'WAITING_FOR_LINKED':
      return beginGap(state, ctx, atMs, ctx.durations.betweenGamesMs, []);
    case 'PRE_GAME':
    case 'FINISHED':
      return fail('NOT_ACTIVE', `Clock is ${state.phase}; nothing to skip`);
  }
}

/**
 * Pure transition function. Never throws for rule violations; returns `{ ok: false }`
 * so the server can map it to a RuleViolationError and the client can show it.
 */
export function clockReducer(state: ClockState, event: ClockEvent, ctx: ClockContext): ClockResult {
  switch (event.type) {
    case 'START': {
      if (state.status !== 'IDLE' || state.phase !== 'PRE_GAME') {
        return fail('NOT_STARTABLE', 'Clock can only start from the pre-game state');
      }
      return ok(state, runningPhase('HALF_1', state.phaseDurationMs, event.nowMs), [
        { type: 'GAME_STARTED', slotIndex: state.slotIndex },
      ]);
    }
    case 'PAUSE': {
      if (state.status !== 'RUNNING') return fail('NOT_RUNNING', 'Clock is not running');
      return ok(
        state,
        { status: 'PAUSED', remainingAtPauseMs: remainingMs(state, event.nowMs) },
        [],
      );
    }
    case 'RESUME': {
      if (state.status !== 'PAUSED') return fail('NOT_PAUSED', 'Clock is not paused');
      const remaining = state.remainingAtPauseMs ?? state.phaseDurationMs;
      return ok(
        state,
        {
          status: 'RUNNING',
          phaseStartedAtMs: event.nowMs - (state.phaseDurationMs - remaining),
          remainingAtPauseMs: null,
        },
        [],
      );
    }
    case 'ADJUST': {
      if (state.status === 'RUNNING' && state.phaseStartedAtMs !== null) {
        const elapsed = event.nowMs - state.phaseStartedAtMs;
        const duration = Math.max(elapsed, state.phaseDurationMs + event.deltaMs);
        return ok(state, { phaseDurationMs: Math.max(0, Math.round(duration)) }, []);
      }
      if (state.status === 'PAUSED') {
        const remaining = (state.remainingAtPauseMs ?? state.phaseDurationMs) + event.deltaMs;
        return ok(state, { remainingAtPauseMs: Math.max(0, Math.round(remaining)) }, []);
      }
      if (state.phase === 'PRE_GAME') {
        const duration = Math.max(MIN_PHASE_MS, state.phaseDurationMs + event.deltaMs);
        return ok(state, { phaseDurationMs: Math.round(duration) }, []);
      }
      return fail('NOT_ADJUSTABLE', 'Nothing to adjust in this state');
    }
    case 'SKIP_PHASE':
      return advancePhase(state, ctx, event.nowMs);
    case 'EXPIRE': {
      const endsAt = phaseEndsAtMs(state);
      if (endsAt === null || event.nowMs < endsAt) {
        return fail('NOT_DUE', 'Phase has not ended yet');
      }
      return advancePhase(state, ctx, endsAt);
    }
    case 'END_GAME': {
      if (!IN_GAME_PHASES.has(state.phase)) return fail('NOT_IN_GAME', 'No game in progress');
      return afterHalf2(state, ctx, event.nowMs);
    }
    case 'RESET':
      return ok(
        state,
        {
          phase: 'PRE_GAME',
          status: 'IDLE',
          phaseDurationMs: ctx.durations.halfMs,
          phaseStartedAtMs: null,
          remainingAtPauseMs: null,
        },
        [{ type: 'BECAME_UNAVAILABLE' }],
      );
    case 'SET_MODE':
      return ok(state, { mode: event.mode }, []);
    case 'SET_LINK': {
      if (event.linkedClockId === state.id)
        return fail('SELF_LINK', 'A clock cannot wait for itself');
      if (event.linkedClockId === null && state.phase === 'WAITING_FOR_LINKED') {
        const released = beginGap(
          { ...state, linkedClockId: null },
          ctx,
          event.nowMs,
          ctx.durations.betweenGamesMs,
          [],
        );
        return released;
      }
      return ok(state, { linkedClockId: event.linkedClockId }, []);
    }
    case 'ADVANCE_SLOT': {
      if (state.status !== 'IDLE' || (state.phase !== 'PRE_GAME' && state.phase !== 'FINISHED')) {
        return fail('NOT_IDLE', 'Finish or reset the current game before advancing the slot');
      }
      const next = state.slotIndex + 1;
      if (!ctx.hasFixturesForSlot(next))
        return fail('NO_FIXTURES', `No fixtures for slot ${next + 1}`);
      return ok(
        state,
        {
          phase: 'PRE_GAME',
          status: 'IDLE',
          slotIndex: next,
          phaseDurationMs: ctx.durations.halfMs,
          phaseStartedAtMs: null,
          remainingAtPauseMs: null,
        },
        [{ type: 'SLOT_ADVANCED', slotIndex: next }],
      );
    }
    case 'LINKED_ENTERED_BETWEEN_GAMES': {
      if (state.phase !== 'WAITING_FOR_LINKED') return fail('NOT_WAITING', 'Clock is not waiting');
      return ok(
        state,
        runningPhase('BETWEEN_GAMES', event.phaseDurationMs, event.phaseStartedAtMs),
        [],
      );
    }
    case 'LINKED_UNAVAILABLE': {
      if (state.phase !== 'WAITING_FOR_LINKED') return fail('NOT_WAITING', 'Clock is not waiting');
      return beginGap(state, ctx, event.nowMs, ctx.durations.betweenGamesMs, []);
    }
  }
}

const MAX_FAST_FORWARD_STEPS = 10_000;

/**
 * Replays every expiry that should have happened up to `nowMs`, using the real phase
 * end timestamps, so a clock that ran while the server was down lands in the right
 * phase with the right start time. Stops at WAITING_FOR_LINKED because the linked
 * clock's own fast-forward decides what happens next.
 */
export function fastForward(
  state: ClockState,
  ctx: ClockContext,
  nowMs: number,
): { state: ClockState; effects: ClockEffect[] } {
  let current = state;
  const effects: ClockEffect[] = [];
  for (let i = 0; i < MAX_FAST_FORWARD_STEPS; i++) {
    const endsAt = phaseEndsAtMs(current);
    if (endsAt === null || endsAt > nowMs) break;
    const result = clockReducer(current, { type: 'EXPIRE', nowMs }, ctx);
    if (!result.ok) break;
    current = result.state;
    effects.push(...result.effects);
  }
  return { state: current, effects };
}
