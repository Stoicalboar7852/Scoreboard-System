import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, Outlet, RouterProvider, createBrowserRouter } from 'react-router';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { UpdatePrompt } from './components/UpdatePrompt.js';
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
        <UpdatePrompt />
        <Outlet />
      </Boundary>
    ),
    children: [
      { index: true, element: <Navigate to="/admin/live" replace /> },
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
