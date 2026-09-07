import { useMutation } from '@tanstack/react-query';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router';
import { ConnectionBadge } from '../../components/ConnectionBadge.js';
import { UpdatePrompt } from '../../components/UpdatePrompt.js';
import { adminApi } from '../../lib/adminApi.js';
import { queryClient } from '../../lib/query.js';
import { liveSocket } from '../../lib/socket.js';
import { useAuth } from './useAuth.js';

const NAV = [
  { to: '/admin/live', label: 'Live' },
  { to: '/admin/sessions', label: 'Sessions' },
  { to: '/admin/seasons', label: 'Seasons' },
  { to: '/admin/competitions', label: 'Competitions' },
  { to: '/admin/results', label: 'Results' },
  { to: '/admin/ladders', label: 'Ladders' },
  { to: '/admin/courts', label: 'Courts' },
  { to: '/admin/formats', label: 'Formats' },
  { to: '/admin/settings', label: 'Settings' },
];

/** Auth guard + navigation for every /admin page. */
export function AdminLayout() {
  const auth = useAuth();
  const location = useLocation();
  const logout = useMutation({
    mutationFn: adminApi.logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['auth'] });
      liveSocket().reconnect();
    },
  });

  if (auth.isPending) return <div className="p-8 text-text-muted">Checking sign-in…</div>;
  if (!auth.data || auth.data.kind !== 'admin')
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="flex shrink-0 flex-row items-center gap-1 overflow-x-auto border-b border-border bg-surface px-3 py-2 md:w-48 md:flex-col md:items-stretch md:border-b-0 md:border-r md:py-4">
        <div className="hidden px-2 pb-3 md:block">
          <p className="text-lg font-bold text-court">Scoreboard</p>
          <p className="truncate text-xs text-text-muted">{auth.data.user.email}</p>
        </div>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-surface-2 text-court' : 'text-text-muted hover:text-text'}`
            }
          >
            {item.label}
          </NavLink>
        ))}
        <div className="ml-auto flex items-center gap-2 md:ml-0 md:mt-auto md:flex-col md:items-stretch">
          <ConnectionBadge />
          <button
            type="button"
            onClick={() => logout.mutate()}
            className="rounded-md px-3 py-1.5 text-left text-sm text-text-muted hover:text-text"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-6">
        <UpdatePrompt />
        <Outlet />
      </main>
    </div>
  );
}
