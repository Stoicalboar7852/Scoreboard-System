import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConflictReport, DrawSummary } from './DrawSummary.js';

describe('DrawSummary and ConflictReport', () => {
  it('lists sessions and warnings', () => {
    render(
      <DrawSummary
        sessions={[
          {
            date: '2026-02-04',
            nightOfWeek: 3,
            weekNumber: 1,
            slotCount: 2,
            slotLengthMinutes: 42,
            firstSlotTime: '18:30',
            fixtures: 8,
            byes: 0,
            competitions: ['Mixed Fours', 'Mixed Pairs'],
          },
        ]}
        warnings={[
          'Mixed Fours: Season has 3 rounds but 8 teams need 7 for a full round robin: not every pair of teams will meet.',
        ]}
      />,
    );
    expect(screen.getByText('2026-02-04')).toBeInTheDocument();
    expect(screen.getByText('Wednesday')).toBeInTheDocument();
    expect(screen.getByText(/2 × 42 min from 18:30/)).toBeInTheDocument();
    expect(screen.getByText(/not every pair/)).toBeInTheDocument();
  });

  it('names the conflicting fixture and its suggestions', () => {
    render(
      <ConflictReport
        conflicts={[
          {
            date: '2026-02-02',
            nightOfWeek: 1,
            weekNumber: 1,
            fixture: { competitionId: 'c', homeTeamId: 'a', awayTeamId: 'b' },
            reason: 'No free cell satisfies the clash, court and format constraints',
            suggestions: [
              'Allow one more slot on this night (increase "extra slots")',
              'Add another court to this night',
            ],
          },
        ]}
        teamName={(id) => ({ a: 'Aces', b: 'Blockers' })[id] ?? id}
        competitionName={() => 'A Grade'}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Week 1 · Monday 2026-02-02: A Grade — Aces v Blockers',
    );
    expect(screen.getByText(/Allow one more slot/)).toBeInTheDocument();
  });
});
