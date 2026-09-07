import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, Outlet, RouterProvider, createBrowserRouter, useParams } from 'react-router';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { UpdatePrompt } from './components/UpdatePrompt.js';
import { Home } from './routes/Home.js';
import { NotAvailable } from './routes/NotAvailable.js';
import { NotFound } from './routes/NotFound.js';

const Login = lazy(() => import('./routes/admin/Login.js').then((m) => ({ default: m.Login })));
const CourtLivePage = lazy(() =>
  import('./routes/court/CourtLivePage.js').then((m) => ({ default: m.CourtLivePage })),
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

function ScoreboardRoute() {
  const { courtId } = useParams();
  return courtId ? <CourtLivePage /> : <NotAvailable title="Scoreboard court picker" />;
}

function ControllerRoute() {
  const { courtId } = useParams();
  return <NotAvailable title={courtId ? 'Controller' : 'Controller court picker'} />;
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
        <ControllerRoute />
      </Boundary>
    ),
  },
  {
    path: '/controller/:courtId',
    element: (
      <Boundary label="Controller">
        <ControllerRoute />
      </Boundary>
    ),
  },
  {
    path: '/scoreboard',
    element: (
      <Boundary label="Scoreboard">
        <ScoreboardRoute />
      </Boundary>
    ),
  },
  {
    path: '/scoreboard/:courtId',
    element: (
      <Boundary label="Scoreboard">
        <ScoreboardRoute />
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
