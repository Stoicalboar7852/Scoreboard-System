import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../../lib/api.js';
import { setDeviceToken } from '../../lib/deviceAuth.js';
import { liveSocket } from '../../lib/socket.js';

interface Props {
  title?: string;
  onDone: () => void;
  onCancel?: () => void;
}

function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  const kind = /iPad/.test(ua)
    ? 'iPad'
    : /iPhone/.test(ua)
      ? 'iPhone'
      : /Android/.test(ua)
        ? 'Android'
        : 'Tablet';
  return `${kind} ${new Date().toLocaleDateString()}`;
}

/** Venue PIN → device token. Large keys for tablets. */
export function PinGate({ title = 'Enter the controller PIN', onDone, onCancel }: Props) {
  const [pin, setPin] = useState('');
  const [deviceName, setDeviceName] = useState(defaultDeviceName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (pin.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ token: string }>('/api/auth/controller', {
        method: 'POST',
        body: { pin, deviceName },
      });
      setDeviceToken(result.token);
      liveSocket().reconnect();
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not verify the PIN');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const press = (key: string) => {
    if (key === '⌫') setPin((p) => p.slice(0, -1));
    else if (pin.length < 12) setPin((p) => p + key);
  };

  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-xs space-y-4 text-center" noValidate>
        <h1 className="text-2xl font-bold text-court">{title}</h1>
        <div
          className="flex h-12 items-center justify-center gap-2 text-3xl tracking-[0.5em] text-score"
          aria-label="PIN"
          data-pin-display
        >
          {pin.replace(/./g, '•') || <span className="text-text-muted">····</span>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map((key) => (
            <button
              key={key}
              type={key === 'OK' ? 'submit' : 'button'}
              onClick={key === 'OK' ? undefined : () => press(key)}
              disabled={busy}
              className="min-h-[64px] rounded-lg bg-surface-2 text-2xl font-semibold text-text active:bg-border disabled:opacity-50"
              aria-label={key === '⌫' ? 'Delete' : key}
            >
              {key}
            </button>
          ))}
        </div>
        <label className="block text-left text-sm">
          <span className="text-text-muted">Device name</span>
          <input
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-text-muted underline">
            Cancel
          </button>
        )}
      </form>
    </main>
  );
}
