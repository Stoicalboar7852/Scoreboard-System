import { describe, expect, it } from 'vitest';
import type { Court } from '@scoreboard/shared';
import type { CompetitionWithTeams, FixtureWithNames } from '../../../lib/adminApi.js';
import {
  addSlot,
  draftFromServer,
  issuesByFixture,
  removeFixture,
  removeLastSlot,
  toSaveInput,
  unscheduled,
  upsertFixture,
  validateDraft,
  type DraftFixture,
} from './gridModel.js';

const courts: Court[] = [
  {
    id: 'c1',
    name: 'Court 1',
    displayOrder: 1,
    active: true,
    supportedFormatIds: ['fours', 'pairs'],
  },
  { id: 'c2', name: 'Court 2', displayOrder: 2, active: true, supportedFormatIds: ['fours'] },
];
const comp: CompetitionWithTeams = {
  id: 'comp',
  seasonId: 's',
  name: 'A Grade',
  nightOfWeek: 1,
  formatId: 'pairs',
  ladderRule: {
    kind: 'RESULT_POINTS',
    win: 6,
    draw: 4,
    loss: 2,
    bye: 6,
    forfeitWin: 6,
    forfeitLoss: 0,
    bonus: null,
    tiebreakers: ['LADDER_POINTS', 'NAME'],
  },
  displayOrder: 0,
  published: true,
  ladderLockedAtMs: null,
  teams: [
    { id: 'a', competitionId: 'comp', name: 'Aces', shortName: 'Aces', colour: null },
    { id: 'b', competitionId: 'comp', name: 'Blockers', shortName: 'Blockers', colour: null },
    { id: 'c', competitionId: 'comp', name: 'Crushers', shortName: 'Crushers', colour: null },
    { id: 'd', competitionId: 'comp', name: 'Diggers', shortName: 'Diggers', colour: null },
  ],
};
const serverFixture = (
  id: string,
  home: string,
  away: string | null,
  slot: number | null,
  courtId: string | null,
): FixtureWithNames => ({
  id,
  seasonId: null,
  competitionId: 'comp',
  sessionId: 'sess',
  roundNumber: 1,
  slotIndex: slot,
  courtId,
  homeTeamId: home,
  awayTeamId: away,
  homeName: null,
  awayName: null,
  stage: 'REGULAR',
  finalsKey: null,
  homeRef: null,
  awayRef: null,
  status: away ? 'SCHEDULED' : 'BYE',
  homeScore: 0,
  awayScore: 0,
  forfeitBy: null,
  completedAtMs: null,
  resultNotes: null,
  competitionName: 'A Grade',
  formatId: 'pairs',
  formatName: 'Pairs',
  courtName: null,
  homeTeamName: null,
  awayTeamName: null,
});
const draftFixture = (overrides: Partial<DraftFixture>): DraftFixture => ({
  key: 'k',
  competitionId: 'comp',
  homeTeamId: 'a',
  awayTeamId: 'b',
  homeName: null,
  awayName: null,
  slotIndex: 0,
  courtId: 'c1',
  roundNumber: null,
  status: 'SCHEDULED',
  homeScore: 0,
  awayScore: 0,
  ...overrides,
});

describe('gridModel', () => {
  it('builds a draft, lists unscheduled fixtures and round-trips to the save input', () => {
    const draft = draftFromServer(2, [
      serverFixture('f1', 'a', 'b', 0, 'c1'),
      serverFixture('bye', 'c', null, null, null),
    ]);
    expect(draft.fixtures).toHaveLength(2);
    expect(unscheduled(draft).map((f) => f.key)).toEqual(['bye']);
    const save = toSaveInput(draft);
    expect(save.slotCount).toBe(2);
    expect(save.fixtures[0]).toMatchObject({
      id: 'f1',
      slotIndex: 0,
      courtId: 'c1',
      status: 'SCHEDULED',
    });
    expect(save.fixtures[1]).toMatchObject({ id: 'bye', status: 'BYE', slotIndex: null });
  });

  it('adds and removes slots, unscheduling fixtures in a removed slot', () => {
    let draft = draftFromServer(1, [serverFixture('f1', 'a', 'b', 0, 'c1')]);
    draft = addSlot(draft);
    expect(draft.slotCount).toBe(2);
    draft = removeLastSlot(removeLastSlot(draft));
    expect(draft.slotCount).toBe(0);
    expect(unscheduled(draft)).toHaveLength(1);
  });

  it('upserts and removes fixtures, remembering server ids to delete', () => {
    let draft = draftFromServer(1, [serverFixture('f1', 'a', 'b', 0, 'c1')]);
    draft = upsertFixture(
      draft,
      draftFixture({ key: 'new-1', homeTeamId: 'c', awayTeamId: 'd', courtId: 'c2' }),
    );
    expect(draft.fixtures).toHaveLength(2);
    draft = upsertFixture(
      draft,
      draftFixture({ key: 'f1', id: 'f1', slotIndex: 0, courtId: 'c2' }),
    );
    expect(draft.fixtures.find((f) => f.key === 'f1')?.courtId).toBe('c2');
    draft = removeFixture(draft, 'f1');
    draft = removeFixture(draft, 'new-1');
    expect(draft.fixtures).toHaveLength(0);
    expect(draft.deleteFixtureIds).toEqual(['f1']);
  });

  it('validates the draft with the shared rules and groups issues by fixture', () => {
    const draft = draftFromServer(1, []);
    const withIssues = upsertFixture(
      upsertFixture(draft, draftFixture({ key: 'x', courtId: 'c2' })),
      draftFixture({ key: 'y', homeTeamId: 'c', awayTeamId: 'd', courtId: 'c2' }),
    );
    const issues = validateDraft(withIssues, {
      courts,
      competitions: [comp],
      clashes: [{ teamAId: 'a', teamBId: 'c', source: 'LINK' }],
      linkShorterToLonger: true,
    });
    const codes = issues.map((i) => i.code).sort();
    expect(codes).toEqual([
      'CELL_DOUBLE_BOOKED',
      'CLASH_LINK',
      'COURT_FORMAT_UNSUPPORTED',
      'COURT_FORMAT_UNSUPPORTED',
    ]);
    const byFixture = issuesByFixture(issues);
    expect(byFixture.get('x')?.length).toBe(3);
    expect(byFixture.get('y')?.length).toBe(3);
  });
});
