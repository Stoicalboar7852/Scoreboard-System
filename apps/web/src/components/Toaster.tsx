import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type ToastKind = 'info' | 'success' | 'error';
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  toast: (message: string, kind?: ToastKind, action?: Toast['action']) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message: string, kind: ToastKind = 'info', action?: Toast['action']) => {
      const id = ++seq;
      setToasts((t) => [...t.slice(-4), { id, kind, message, action }]);
      if (!action) setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4000);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex max-w-lg items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm text-text shadow-lg"
            style={{
              borderColor:
                t.kind === 'error'
                  ? 'var(--color-danger)'
                  : t.kind === 'success'
                    ? 'var(--color-success)'
                    : undefined,
            }}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="rounded bg-court px-2 py-1 font-semibold text-bg"
                onClick={t.action.onClick}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              className="text-text-muted"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
