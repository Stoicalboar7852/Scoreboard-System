import { PROTOCOL_VERSION } from '@scoreboard/shared';

export function App() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold" style={{ color: 'var(--color-accent-court)' }}>
        Scoreboard System
      </h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        Scaffold ready. Protocol v{PROTOCOL_VERSION}, build {__APP_VERSION__}.
      </p>
    </main>
  );
}
