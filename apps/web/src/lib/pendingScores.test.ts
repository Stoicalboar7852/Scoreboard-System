import { describe, expect, it } from 'vitest';
import { EMPTY_PENDING, optimisticScores, pendingReducer } from './pendingScores.js';

describe('pendingScores', () => {
  it('applies unacked taps optimistically and removes them on ack or rejection', () => {
    let state = pendingReducer(EMPTY_PENDING, {
      type: 'ADD',
      tap: { actionId: 'a', team: 'HOME', delta: 1 },
    });
    state = pendingReducer(state, { type: 'ADD', tap: { actionId: 'b', team: 'HOME', delta: 1 } });
    state = pendingReducer(state, { type: 'ADD', tap: { actionId: 'c', team: 'AWAY', delta: -1 } });
    expect(optimisticScores({ homeScore: 3, awayScore: 0 }, state)).toEqual({
      homeScore: 5,
      awayScore: 0,
    });
    state = pendingReducer(state, { type: 'ACKED', actionId: 'a' });
    expect(optimisticScores({ homeScore: 4, awayScore: 0 }, state)).toEqual({
      homeScore: 5,
      awayScore: 0,
    });
    state = pendingReducer(state, { type: 'REJECTED', actionId: 'b' });
    expect(optimisticScores({ homeScore: 4, awayScore: 0 }, state)).toEqual({
      homeScore: 4,
      awayScore: 0,
    });
    expect(pendingReducer(state, { type: 'CLEAR' })).toEqual(EMPTY_PENDING);
  });
});
