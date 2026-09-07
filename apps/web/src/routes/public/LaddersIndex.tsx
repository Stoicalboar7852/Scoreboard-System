import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { LadderTable } from '../../components/LadderTable.js';
import { publicApi } from '../../lib/publicApi.js';

/** `/ladders`: every published competition, grouped by night, refreshing every 60 s. */
export function LaddersIndex() {
  const ladders = useQuery({
    queryKey: ['public', 'ladders'],
    queryFn: publicApi.ladders,
    refetchInterval: 60_000,
  });
  if (ladders.isPending) return <p className="text-text-muted">Loading ladders…</p>;
  if (ladders.error) return <p className="text-danger">Could not load ladders.</p>;
  const nights = new Map<string, typeof ladders.data>();
  for (const l of ladders.data) nights.set(l.nightName, [...(nights.get(l.nightName) ?? []), l]);
  if (ladders.data.length === 0)
    return <p className="text-text-muted">No published ladders yet.</p>;
  return (
    <div className="space-y-8" data-public-ladders>
      {[...nights.entries()].map(([night, list]) => (
        <section key={night}>
          <h2 className="mb-3 text-2xl font-bold text-team">{night}</h2>
          <div className="space-y-5">
            {(list ?? []).map((l) => (
              <div key={l.competitionId}>
                <div className="mb-1 flex items-baseline justify-between">
                  <h3 className="text-lg font-semibold text-court">
                    <Link to={`/ladders/${l.competitionId}`} className="hover:underline">
                      {l.competitionName}
                    </Link>
                  </h3>
                  <Link
                    to={`/draw/${l.competitionId}`}
                    className="text-xs text-text-muted underline"
                  >
                    draw
                  </Link>
                </div>
                <LadderTable rows={l.ladder.rows} compact />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
