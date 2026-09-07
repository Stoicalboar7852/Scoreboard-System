import { useLiveStore } from '../store/liveStore.js';

const LABELS = {
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  offline: 'Offline',
} as const;

/** Small connection indicator shown on every surface (§4.4). */
export function ConnectionBadge({ compact = false }: { compact?: boolean }) {
  const status = useLiveStore((s) => s.status);
  const rttWarning = useLiveStore((s) => s.rttWarning);
  const synced = useLiveStore((s) => s.synced);
  const colour =
    status === 'connected'
      ? 'var(--color-success)'
      : status === 'reconnecting'
        ? 'var(--color-warning)'
        : 'var(--color-danger)';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-surface/80 px-2 py-0.5 text-xs text-text-muted"
      data-status={status}
      aria-live="polite"
      title={
        rttWarning
          ? 'Slow network: time sync may be inaccurate'
          : synced
            ? 'Time synced with server'
            : 'Waiting for time sync'
      }
    >
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{
          background: colour,
          boxShadow: status === 'connected' ? `0 0 6px ${colour}` : undefined,
        }}
        aria-hidden
      />
      {!compact && <span>{LABELS[status]}</span>}
      {rttWarning && (
        <span className="text-warning" title="Round trip over 2 s">
          slow
        </span>
      )}
    </span>
  );
}
