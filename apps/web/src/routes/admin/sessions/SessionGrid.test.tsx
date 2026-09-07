import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Court, ValidationIssue } from '@scoreboard/shared';
import type { CompetitionWithTeams } from '../../../lib/adminApi.js';
import { SessionGrid } from './SessionGrid.js';
import type { GridDraft } from './gridModel.js';

const courts: Court[] = [
  { id: 'c1', name: 'Court 1', displayOrder: 1, active: true, supportedFormatIds: ['pairs'] },
  { id: 'c2', name: 'Court 2', displayOrder: 2, active: true, supportedFormatIds: ['pairs'] },
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
  ],
};
const draft: GridDraft = {
  slotCount: 2,
  deleteFixtureIds: [],
  fixtures: [
    {
      key: 'f1',
      id: 'f1',
      competitionId: 'comp',
      homeTeamId: 'a',
      awayTeamId: 'b',
      homeName: null,
      awayName: null,
      slotIndex: 0,
      courtId: 'c1',
      roundNumber: 1,
      status: 'SCHEDULED',
      homeScore: 0,
      awayScore: 0,
    },
    {
      key: 'f2',
      id: 'f2',
      competitionId: null,
      homeTeamId: null,
      awayTeamId: null,
      homeName: 'Walk-ins',
      awayName: 'Staff',
      slotIndex: 1,
      courtId: 'c2',
      roundNumber: null,
      status: 'COMPLETED',
      homeScore: 21,
      awayScore: 15,
    },
  ],
};
const issues = new Map<string, ValidationIssue[]>([
  [
    'f1',
    [
      {
        code: 'CLASH_LINK',
        severity: 'ERROR',
        message: 'Clash-linked teams are both in slot 1',
        fixtureIds: ['f1'],
      },
    ],
  ],
]);

describe('SessionGrid', () => {
  it('renders slots × courts with times, fixtures, badges and empty cells', () => {
    const onEditCell = vi.fn();
    const onAddSlot = vi.fn();
    render(
      <SessionGrid
        draft={draft}
        courts={courts}
        competitions={[comp]}
        issues={issues}
        firstSlotTime="18:30"
        slotLengthMinutes={30}
        onEditCell={onEditCell}
        onAddSlot={onAddSlot}
        onRemoveSlot={vi.fn()}
      />,
    );
    expect(screen.getByText('18:30')).toBeInTheDocument();
    expect(screen.getByText('19:00')).toBeInTheDocument();
    expect(screen.getByText(/Aces\s+Blockers/)).toBeInTheDocument();
    expect(screen.getByText('Clash link')).toBeInTheDocument();
    expect(screen.getByText(/Quick game · completed 21–15/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add fixture slot 1 Court 2' }));
    expect(onEditCell).toHaveBeenCalledWith(0, 'c2', null);
    fireEvent.click(screen.getByText(/Aces\s+Blockers/));
    expect(onEditCell).toHaveBeenCalledWith(0, 'c1', expect.objectContaining({ key: 'f1' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Add slot' }));
    expect(onAddSlot).toHaveBeenCalled();
  });

  it('is read-only during a live night', () => {
    render(
      <SessionGrid
        draft={draft}
        courts={courts}
        competitions={[comp]}
        issues={new Map()}
        firstSlotTime="18:30"
        slotLengthMinutes={30}
        readOnly
        onEditCell={vi.fn()}
        onAddSlot={vi.fn()}
        onRemoveSlot={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: '+ Add slot' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add fixture slot 1 Court 2' })).toBeDisabled();
  });
});
