import { describe, expect, it } from 'vitest';
import { buildClashSet, clashPairKey, validateNight, type ValidationFixture } from './validate.js';

const courts = [
  { id: 'c1', supportedFormatIds: ['fours', 'pairs'] },
  { id: 'c2', supportedFormatIds: ['fours'] },
];

function fx(partial: Partial<ValidationFixture> & { id: string }): ValidationFixture {
  return {
    competitionId: 'comp',
    formatId: 'fours',
    slotIndex: 0,
    courtId: 'c1',
    homeTeamId: 'A',
    awayTeamId: 'B',
    status: 'SCHEDULED',
    ...partial,
  };
}

const ctx = { courts, clashes: [], linkShorterToLonger: true, slotCount: 3 };

describe('validateNight', () => {
  it('passes a clean night', () => {
    expect(
      validateNight(
        [fx({ id: 'f1' }), fx({ id: 'f2', courtId: 'c2', homeTeamId: 'C', awayTeamId: 'D' })],
        ctx,
      ),
    ).toEqual([]);
  });

  it('flags a double-booked cell', () => {
    const issues = validateNight(
      [fx({ id: 'f1' }), fx({ id: 'f2', homeTeamId: 'C', awayTeamId: 'D' })],
      ctx,
    );
    expect(issues.map((i) => i.code)).toEqual(['CELL_DOUBLE_BOOKED']);
    expect(issues[0]?.fixtureIds.sort()).toEqual(['f1', 'f2']);
  });

  it('flags a team booked twice in a slot and twice in a night', () => {
    const sameSlot = validateNight(
      [fx({ id: 'f1' }), fx({ id: 'f2', courtId: 'c2', homeTeamId: 'A', awayTeamId: 'D' })],
      ctx,
    );
    expect(sameSlot.map((i) => i.code).sort()).toEqual([
      'TEAM_TWICE_IN_NIGHT',
      'TEAM_TWICE_IN_SLOT',
    ]);
    const laterSlot = validateNight(
      [fx({ id: 'f1' }), fx({ id: 'f2', slotIndex: 1, homeTeamId: 'A', awayTeamId: 'D' })],
      ctx,
    );
    expect(laterSlot.map((i) => i.code)).toEqual(['TEAM_TWICE_IN_NIGHT']);
    expect(laterSlot[0]?.teamIds).toEqual(['A']);
  });

  it('flags clash-linked teams in the same slot only', () => {
    const clashes = [{ teamAId: 'A', teamBId: 'D' }];
    const same = validateNight(
      [fx({ id: 'f1' }), fx({ id: 'f2', courtId: 'c2', homeTeamId: 'C', awayTeamId: 'D' })],
      { ...ctx, clashes },
    );
    expect(same.map((i) => i.code)).toEqual(['CLASH_LINK']);
    const different = validateNight(
      [fx({ id: 'f1' }), fx({ id: 'f2', slotIndex: 1, homeTeamId: 'C', awayTeamId: 'D' })],
      { ...ctx, clashes },
    );
    expect(different).toEqual([]);
  });

  it('flags a court that does not support the format', () => {
    const issues = validateNight([fx({ id: 'f1', courtId: 'c2', formatId: 'pairs' })], ctx);
    expect(issues.map((i) => i.code)).toEqual(['COURT_FORMAT_UNSUPPORTED']);
  });

  it('flags a court hosting two formats on an unlinked night', () => {
    const fixtures = [
      fx({ id: 'f1', formatId: 'fours' }),
      fx({ id: 'f2', slotIndex: 1, formatId: 'pairs', homeTeamId: 'C', awayTeamId: 'D' }),
    ];
    expect(
      validateNight(fixtures, { ...ctx, linkShorterToLonger: false }).map((i) => i.code),
    ).toEqual(['COURT_MULTI_FORMAT']);
    expect(validateNight(fixtures, ctx)).toEqual([]);
  });

  it('flags unknown courts, out-of-range slots and a team playing itself', () => {
    const issues = validateNight(
      [
        fx({ id: 'f1', courtId: 'nope' }),
        fx({ id: 'f2', slotIndex: 7, courtId: 'c2', homeTeamId: 'C', awayTeamId: 'D' }),
        fx({ id: 'f3', slotIndex: 2, homeTeamId: 'E', awayTeamId: 'E' }),
      ],
      ctx,
    );
    expect(issues.map((i) => i.code).sort()).toEqual([
      'SAME_TEAM_BOTH_SIDES',
      'SLOT_OUT_OF_RANGE',
      'TEAM_TWICE_IN_SLOT',
      'UNKNOWN_COURT',
    ]);
  });

  it('ignores byes, cancelled and unscheduled fixtures for cell checks', () => {
    const issues = validateNight(
      [
        fx({ id: 'f1' }),
        fx({
          id: 'bye',
          status: 'BYE',
          slotIndex: null,
          courtId: null,
          homeTeamId: 'Z',
          awayTeamId: null,
        }),
        fx({ id: 'cancelled', status: 'CANCELLED', homeTeamId: 'A', awayTeamId: 'Q' }),
        fx({ id: 'unscheduled', slotIndex: null, courtId: null, homeTeamId: 'M', awayTeamId: 'N' }),
      ],
      ctx,
    );
    expect(issues).toEqual([]);
  });
});

describe('clash helpers', () => {
  it('builds symmetric pair keys', () => {
    expect(clashPairKey('b', 'a')).toBe(clashPairKey('a', 'b'));
    const set = buildClashSet([{ teamAId: 'x', teamBId: 'y' }]);
    expect(set.has(clashPairKey('y', 'x'))).toBe(true);
    expect(set.has(clashPairKey('x', 'z'))).toBe(false);
  });
});
