import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Rendered under the fault banner; typically the last good state. */
  fallback?: ReactNode;
  label?: string;
  onError?: (error: Error) => void;
}

interface State {
  error: Error | null;
}

/** Route-level boundary: never a blank page. Shows a fault banner plus the fallback. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('render error', error, info.componentStack);
    this.props.onError?.(error);
  }

  private reset = (): void => this.setState({ error: null });

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-full flex-col" role="alert">
        <div className="flex items-center justify-between gap-4 bg-danger/20 px-4 py-3 text-sm text-text">
          <span>
            <strong>{this.props.label ?? 'This screen'} hit a problem.</strong>{' '}
            {this.state.error.message}
          </span>
          <span className="flex gap-2">
            <button type="button" className="rounded bg-surface-2 px-3 py-1" onClick={this.reset}>
              Retry
            </button>
            <button
              type="button"
              className="rounded bg-surface-2 px-3 py-1"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </span>
        </div>
        <div className="flex-1">{this.props.fallback ?? null}</div>
      </div>
    );
  }
}
