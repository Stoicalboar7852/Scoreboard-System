import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { Home } from './routes/Home.js';
import { NotAvailable } from './routes/NotAvailable.js';
import { NotFound } from './routes/NotFound.js';

const Login = lazy(() => import('./routes/admin/Login.js').then((m) => ({ default: m.Login })));

const ScoreboardIndex = lazy(() =>
  import('./routes/scoreboard/ScoreboardIndex.js').then((m) => ({ default: m.ScoreboardIndex })),
);
const ScoreboardCourt = lazy(() =>
  import('./routes/scoreboard/ScoreboardCourt.js').then((m) => ({ default: m.ScoreboardCourt })),
);
const AdminLayout = lazy(() =>
  import('./routes/admin/AdminLayout.js').then((m) => ({ default: m.AdminLayout })),
);
const Live = lazy(() => import('./routes/admin/Live.js').then((m) => ({ default: m.Live })));
const Settings = lazy(() =>
  import('./routes/admin/Settings.js').then((m) => ({ default: m.Settings })),
);
const Courts = lazy(() => import('./routes/admin/Courts.js').then((m) => ({ default: m.Courts })));
const Formats = lazy(() =>
  import('./routes/admin/Formats.js').then((m) => ({ default: m.Formats })),
);
const Seasons = lazy(() =>
  import('./routes/admin/Seasons.js').then((m) => ({ default: m.Seasons })),
);
const Competitions = lazy(() =>
  import('./routes/admin/Competitions.js').then((m) => ({ default: m.Competitions })),
);
const ControllerIndex = lazy(() =>
  import('./routes/controller/ControllerIndex.js').then((m) => ({ default: m.ControllerIndex })),
);
const ControllerCourt = lazy(() =>
  import('./routes/controller/ControllerCourt.js').then((m) => ({ default: m.ControllerCourt })),
);

function Loading() {
  return <div className="p-8 text-text-muted">Loading…</div>;
}

function Boundary({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ErrorBoundary label={label}>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <Boundary label="Home">
        <Home />
      </Boundary>
    ),
  },
  {
    path: '/login',
    element: (
      <Boundary label="Login">
        <Login />
      </Boundary>
    ),
  },
  {
    path: '/controller',
    element: (
      <Boundary label="Controller">
        <ControllerIndex />
      </Boundary>
    ),
  },
  {
    path: '/controller/:courtId',
    element: (
      <Boundary label="Controller">
        <ControllerCourt />
      </Boundary>
    ),
  },
  {
    path: '/scoreboard',
    element: (
      <Boundary label="Scoreboard">
        <ScoreboardIndex />
      </Boundary>
    ),
  },
  {
    path: '/scoreboard/:courtId',
    element: (
      <Boundary label="Scoreboard">
        <ScoreboardCourt />
      </Boundary>
    ),
  },
  {
    path: '/admin',
    element: (
      <Boundary label="Admin">
        <AdminLayout />
      </Boundary>
    ),
    children: [
      { index: true, element: <Navigate to="/admin/live" replace /> },
      {
        path: 'live',
        element: (
          <Boundary label="Live control">
            <Live />
          </Boundary>
        ),
      },
      {
        path: 'settings',
        element: (
          <Boundary label="Settings">
            <Settings />
          </Boundary>
        ),
      },
      {
        path: 'courts',
        element: (
          <Boundary label="Courts">
            <Courts />
          </Boundary>
        ),
      },
      {
        path: 'formats',
        element: (
          <Boundary label="Formats">
            <Formats />
          </Boundary>
        ),
      },
      {
        path: 'seasons',
        element: (
          <Boundary label="Seasons">
            <Seasons />
          </Boundary>
        ),
      },
      {
        path: 'competitions',
        element: (
          <Boundary label="Competitions">
            <Competitions />
          </Boundary>
        ),
      },
      { path: '*', element: <NotAvailable title="Admin" /> },
    ],
  },
  {
    path: '/ladders',
    element: (
      <Boundary label="Ladders">
        <NotAvailable title="Ladders" />
      </Boundary>
    ),
  },
  {
    path: '/ladders/:competitionId',
    element: (
      <Boundary label="Ladder">
        <NotAvailable title="Ladder" />
      </Boundary>
    ),
  },
  {
    path: '/draw/:competitionId',
    element: (
      <Boundary label="Draw">
        <NotAvailable title="Draw" />
      </Boundary>
    ),
  },
  {
    path: '/tonight',
    element: (
      <Boundary label="Tonight">
        <NotAvailable title="Tonight" />
      </Boundary>
    ),
  },
  { path: '*', element: <NotFound /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
