import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VENUE_POINTS_RULE, computeLadder } from '@scoreboard/shared';
import { LadderTable, ladderRuleSummary } from './LadderTable.js';

describe('LadderTable', () => {
  it('shows the brief example: a win scoring 40 points earns 6 + 4 = 10 ladder points', () => {
    const rows = computeLadder({
      teams: [
        { id: 'a', name: 'Aces' },
        { id: 'b', name: 'Blockers' },
      ],
      fixtures: [
        {
          id: 'f',
          homeTeamId: 'a',
          awayTeamId: 'b',
          homeScore: 40,
          awayScore: 30,
          status: 'COMPLETED',
          stage: 'REGULAR',
          forfeitBy: null,
        },
      ],
      rule: VENUE_POINTS_RULE,
      adjustments: [],
    });
    render(<LadderTable rows={rows} rule={VENUE_POINTS_RULE} />);
    const aces = document.querySelector('[data-ladder-row="a"]');
    expect(aces).toHaveTextContent('Aces');
    expect(aces?.querySelector('[data-ladder-points]')).toHaveTextContent('10');
    expect(screen.getByText('Bonus')).toBeInTheDocument();
    expect(aces).toHaveTextContent('4'); // bonus column
    expect(ladderRuleSummary(VENUE_POINTS_RULE)).toBe(
      'Win 6 · Draw 4 · Loss 2 · Bye 6 · +1 bonus per 10 points scored',
    );
  });

  it('hides the bonus column for wins/for-against rules and shows adjustments when present', () => {
    const rows = computeLadder({
      teams: [{ id: 'a', name: 'Aces' }],
      fixtures: [],
      rule: { ...VENUE_POINTS_RULE, bonus: null },
      adjustments: [{ teamId: 'a', pointsDelta: -2 }],
    });
    render(<LadderTable rows={rows} rule={{ ...VENUE_POINTS_RULE, bonus: null }} />);
    expect(screen.queryByText('Bonus')).not.toBeInTheDocument();
    expect(screen.getByText('Adj')).toBeInTheDocument();
    expect(screen.getAllByText('-2').length).toBeGreaterThanOrEqual(1);
  });
});
