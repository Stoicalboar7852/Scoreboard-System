import { Link } from 'react-router';

/** Route reserved for a later build phase. */
export function NotAvailable({ title }: { title: string }) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-bold text-court">{title}</h1>
      <p className="text-text-muted">This screen is not available in this build yet.</p>
      <Link to="/" className="text-team underline">
        Back to start
      </Link>
    </main>
  );
}
