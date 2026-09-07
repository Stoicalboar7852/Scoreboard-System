import { Link } from 'react-router';
import { ConnectionBadge } from '../components/ConnectionBadge.js';
import { usePublicSettings } from '../lib/publicSettings.js';
import { APP_VERSION } from '../lib/version.js';

const SURFACES = [
  { to: '/controller', title: 'Controller', text: 'Referee scoring on a tablet or phone.' },
  { to: '/scoreboard', title: 'Scoreboard', text: 'Full-screen court display for a kiosk PC.' },
  { to: '/admin', title: 'Admin', text: 'Live clocks, fixtures, draws, results and ladders.' },
  { to: '/ladders', title: 'Ladders & draws', text: 'Public ladders, draws and tonight’s scores.' },
];

export function Home() {
  const settings = usePublicSettings();
  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col gap-8 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-court">
            {settings.data?.venueName ?? 'Scoreboard'}
          </h1>
          <p className="text-text-muted">Time-based volleyball scoreboard and competition system</p>
        </div>
        <ConnectionBadge />
      </header>
      <nav className="grid gap-4 sm:grid-cols-2">
        {SURFACES.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="rounded-xl border border-border bg-surface p-5 transition hover:border-court"
          >
            <h2 className="text-xl font-semibold text-team">{s.title}</h2>
            <p className="mt-1 text-sm text-text-muted">{s.text}</p>
          </Link>
        ))}
      </nav>
      <footer className="text-xs text-text-muted">Build {APP_VERSION}</footer>
    </main>
  );
}
