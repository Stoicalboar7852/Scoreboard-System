import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { nightName } from '@scoreboard/shared';
import { api } from '../../../lib/api.js';

interface PrintData {
  session: { date: string; nightOfWeek: number; firstSlotTime: string; slotLengthMinutes: number };
  rows: Array<{
    date: string;
    time: string;
    slot: number | string;
    court: string;
    competition: string;
    home: string;
    away: string;
    round: number | string;
    status: string;
    score: string;
  }>;
}

/** Printable fixture list for a session (opens in a new tab; use the browser's print). */
export function PrintView() {
  const { id = '' } = useParams();
  const data = useQuery({
    queryKey: ['sessions', id, 'print'],
    queryFn: () => api<PrintData>(`/api/export/sessions/${id}/print`),
    enabled: id !== '',
  });
  if (data.isPending) return <p className="p-6">Loading…</p>;
  if (data.error || !data.data) return <p className="p-6">Could not load the session.</p>;
  const { session, rows } = data.data;
  return (
    <main
      className="mx-auto max-w-4xl bg-white p-6 text-black print:p-0"
      style={{ colorScheme: 'light' }}
    >
      <style>{`@media print { .no-print { display: none } body { background: white } }`}</style>
      <div className="no-print mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded bg-black px-3 py-1 text-white"
        >
          Print
        </button>
      </div>
      <h1 className="text-2xl font-bold">
        Fixtures — {nightName(session.nightOfWeek)} {session.date}
      </h1>
      <p className="mb-4 text-sm">
        First slot {session.firstSlotTime} · {session.slotLengthMinutes} min slots
      </p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-1 pr-2">Time</th>
            <th className="py-1 pr-2">Slot</th>
            <th className="py-1 pr-2">Court</th>
            <th className="py-1 pr-2">Competition</th>
            <th className="py-1 pr-2">Home</th>
            <th className="py-1 pr-2">Away</th>
            <th className="py-1 pr-2">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-300">
              <td className="py-1 pr-2">{r.time}</td>
              <td className="py-1 pr-2">{r.slot}</td>
              <td className="py-1 pr-2">{r.court}</td>
              <td className="py-1 pr-2">{r.competition}</td>
              <td className="py-1 pr-2">{r.home}</td>
              <td className="py-1 pr-2">{r.away}</td>
              <td className="py-1 pr-2">{r.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
