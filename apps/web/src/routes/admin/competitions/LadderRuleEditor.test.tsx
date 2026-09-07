import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VENUE_POINTS_RULE, WINS_FOR_AGAINST_RULE, type LadderRule } from '@scoreboard/shared';
import { LadderRuleEditor } from './LadderRuleEditor.js';

describe('LadderRuleEditor', () => {
  it('detects the preset, switches presets and turns manual edits into Custom', () => {
    const onChange = vi.fn();
    const { rerender } = render(<LadderRuleEditor value={VENUE_POINTS_RULE} onChange={onChange} />);
    expect(screen.getByLabelText('Ladder rule preset')).toHaveValue('VENUE_POINTS');
    fireEvent.change(screen.getByLabelText('Ladder rule preset'), {
      target: { value: 'WINS_FOR_AGAINST' },
    });
    expect(onChange).toHaveBeenLastCalledWith(WINS_FOR_AGAINST_RULE);
    fireEvent.change(screen.getByLabelText('Win'), { target: { value: '5' } });
    const custom = onChange.mock.lastCall?.[0] as LadderRule;
    expect(custom.win).toBe(5);
    rerender(<LadderRuleEditor value={custom} onChange={onChange} />);
    expect(screen.getByLabelText('Ladder rule preset')).toHaveValue('CUSTOM');
  });

  it('toggles bonus points and reorders tiebreakers', () => {
    const onChange = vi.fn();
    render(<LadderRuleEditor value={WINS_FOR_AGAINST_RULE} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Award bonus points for score'));
    expect((onChange.mock.lastCall?.[0] as LadderRule).bonus).toEqual({
      perScorePoints: 10,
      points: 1,
      cap: null,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Move Percentage (for ÷ against) up' }));
    expect((onChange.mock.lastCall?.[0] as LadderRule).tiebreakers).toEqual([
      'PERCENTAGE',
      'LADDER_POINTS',
      'POINTS_DIFF',
      'NAME',
    ]);
    fireEvent.click(screen.getByRole('button', { name: '+ Head to head' }));
    expect((onChange.mock.lastCall?.[0] as LadderRule).tiebreakers).toContain('HEAD_TO_HEAD');
  });
});
