import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ParsedFixtureRow } from '@scoreboard/shared';
import { ImportPreviewTable, type ImportPreview } from './ImportPreviewTable.js';

const row = (
  rowNumber: number,
  ok: boolean,
  errors: ParsedFixtureRow['errors'] = [],
  warnings: ParsedFixtureRow['warnings'] = [],
): ParsedFixtureRow => ({
  rowNumber,
  ok,
  errors,
  warnings,
  value: {
    date: '2026-02-02',
    slotIndex: 0,
    startTime: '18:30',
    courtId: 'c1',
    courtName: 'Court 1',
    competitionId: 'comp',
    competitionName: 'A Grade',
    homeTeamId: 'a',
    homeTeamName: 'Aces',
    awayTeamId: null,
    awayTeamName: 'Newbies',
    roundNumber: 1,
    isBye: false,
    createTeams: [],
  },
});

describe('ImportPreviewTable', () => {
  it('shows each row with its errors and blocks the commit', () => {
    const preview: ImportPreview = {
      previewId: 'p',
      sessionId: 's',
      autoCreateTeams: false,
      rows: [
        row(2, true),
        row(3, false, [
          { code: 'UNKNOWN_COURT', field: 'court', message: 'Unknown court "Court 9"' },
        ]),
        row(
          4,
          true,
          [],
          [
            {
              code: 'TEAM_WILL_BE_CREATED',
              field: 'awayTeam',
              message: 'Team "Newbies" will be created in A Grade',
            },
          ],
        ),
      ],
      issues: [
        {
          code: 'CELL_DOUBLE_BOOKED',
          severity: 'ERROR',
          message: '2 fixtures booked on the same court in slot 1',
          fixtureIds: ['row:2', 'row:4'],
        },
      ],
      summary: { total: 3, valid: 2, invalid: 1, teamsToCreate: 1, byes: 0 },
    };
    render(<ImportPreviewTable preview={preview} />);
    expect(screen.getByText('1 with errors')).toBeInTheDocument();
    expect(screen.getByText('Unknown court "Court 9"')).toBeInTheDocument();
    expect(screen.getByText('Team "Newbies" will be created in A Grade')).toBeInTheDocument();
    expect(screen.getByText('rows 2, 4')).toBeInTheDocument();
    expect(
      document.querySelector('[data-import-verdict]')?.getAttribute('data-import-verdict'),
    ).toBe('blocked');
    expect(document.querySelector('[data-import-row="3"]')?.getAttribute('data-ok')).toBe('false');
  });

  it('is ready when every row is valid and there are no conflicts', () => {
    const preview: ImportPreview = {
      previewId: 'p',
      sessionId: 's',
      autoCreateTeams: true,
      rows: [row(2, true)],
      issues: [],
      summary: { total: 1, valid: 1, invalid: 0, teamsToCreate: 0, byes: 0 },
    };
    render(<ImportPreviewTable preview={preview} />);
    expect(
      document.querySelector('[data-import-verdict]')?.getAttribute('data-import-verdict'),
    ).toBe('ready');
    expect(screen.getByText('ok')).toBeInTheDocument();
  });
});
