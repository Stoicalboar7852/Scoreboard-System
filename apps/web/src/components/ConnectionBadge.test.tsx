import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConnectionBadge } from './ConnectionBadge.js';
import { ErrorBoundary } from './ErrorBoundary.js';
import { useLiveStore } from '../store/liveStore.js';

describe('ConnectionBadge', () => {
  it('reflects the store status', () => {
    useLiveStore.setState({ status: 'offline', rttWarning: true });
    render(<ConnectionBadge />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByText('slow')).toBeInTheDocument();
    act(() => useLiveStore.setState({ status: 'connected', rttWarning: false }));
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.queryByText('slow')).not.toBeInTheDocument();
  });
});

function Boom(): never {
  throw new Error('kaboom');
}

describe('ErrorBoundary', () => {
  it('shows a fault banner with the fallback instead of a blank page', () => {
    const spy = console.error;
    console.error = () => undefined;
    render(
      <ErrorBoundary label="Scoreboard" fallback={<p>last good state</p>}>
        <Boom />
      </ErrorBoundary>,
    );
    console.error = spy;
    expect(screen.getByRole('alert')).toHaveTextContent('Scoreboard hit a problem. kaboom');
    expect(screen.getByText('last good state')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });
});
