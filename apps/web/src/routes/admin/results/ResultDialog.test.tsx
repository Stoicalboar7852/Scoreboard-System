import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FixtureWithNames } from '../../../lib/adminApi.js';
import { ResultDialog } from './ResultDialog.js';

const fixture: FixtureWithNames = {
  id: 'f1',
  seasonId: null,
  competitionId: 'c',
  sessionId: 's',
  roundNumber: 3,
  slotIndex: 0,
  courtId: 'k',
  homeTeamId: 'a',
  awayTeamId: 'b',
  homeName: null,
  awayName: null,
  stage: 'REGULAR',
  finalsKey: null,
  homeRef: null,
  awayRef: null,
  status: 'SCHEDULED',
  homeScore: 0,
  awayScore: 0,
  forfeitBy: null,
  completedAtMs: null,
  resultNotes: null,
  competitionName: 'A Grade',
  formatId: 'p',
  formatName: 'Pairs',
  courtName: 'Court 1',
  homeTeamName: 'Aces',
  awayTeamName: 'Blockers',
  sessionDate: '2026-02-02',
};

describe('ResultDialog', () => {
  it('saves a completed result', async () => {
    const onSave = vi.fn();
    render(<ResultDialog fixture={fixture} onSave={onSave} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Aces score'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Blockers score'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save result' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.lastCall?.[0]).toMatchObject({
      homeScore: 40,
      awayScore: 30,
      status: 'COMPLETED',
      forfeitBy: null,
    });
  });

  it('requires the forfeiting side for a forfeit', async () => {
    const onSave = vi.fn();
    render(<ResultDialog fixture={fixture} onSave={onSave} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'FORFEIT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save result' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/which team forfeited/i),
    );
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Forfeited by/), { target: { value: 'AWAY' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save result' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.lastCall?.[0]).toMatchObject({ status: 'FORFEIT', forfeitBy: 'AWAY' });
  });
});
