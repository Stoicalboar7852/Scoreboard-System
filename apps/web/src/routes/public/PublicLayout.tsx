import { NavLink, Outlet } from 'react-router';
import { ConnectionBadge } from '../../components/ConnectionBadge.js';
import { usePublicSettings } from '../../lib/publicSettings.js';

/** Header + nav for the unauthenticated pages (§7.7). */
export function PublicLayout() {
  const settings = usePublicSettings();
  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 py-4 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xl font-bold text-court">{settings.data?.venueName ?? 'Scoreboard'}</p>
          <nav className="mt-1 flex gap-4 text-sm">
            <NavLink
              to="/ladders"
              end
              className={({ isActive }) =>
                isActive ? 'text-team underline' : 'text-text-muted hover:text-text'
              }
            >
              Ladders
            </NavLink>
            <NavLink
              to="/tonight"
              className={({ isActive }) =>
                isActive ? 'text-team underline' : 'text-text-muted hover:text-text'
              }
            >
              Tonight
            </NavLink>
          </nav>
        </div>
        <ConnectionBadge compact />
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="mt-8 text-center text-xs text-text-muted">
        Ladders update automatically as results are entered.
      </footer>
    </div>
  );
}
