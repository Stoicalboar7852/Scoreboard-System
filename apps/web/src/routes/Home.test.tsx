import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { queryClient } from '../lib/query.js';
import { Home } from './Home.js';

describe('Home', () => {
  it('links to every surface', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Home />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    for (const name of ['Controller', 'Scoreboard', 'Admin', 'Ladders & draws']) {
      expect(screen.getByRole('heading', { name, level: 2 })).toBeInTheDocument();
    }
  });
});
