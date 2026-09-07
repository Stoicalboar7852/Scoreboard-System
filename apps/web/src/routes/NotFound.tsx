import { Link } from 'react-router';

export function NotFound() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold text-court">Page not found</h1>
      <Link to="/" className="text-team underline">
        Back to start
      </Link>
    </main>
  );
}
