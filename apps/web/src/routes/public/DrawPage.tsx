import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { publicApi } from '../../lib/publicApi.js';

/** `/draw/:competitionId`: the whole season round by round. */
export function DrawPage() {
  const { competitionId = '' } = useParams();
  const draw = useQuery({
    queryKey: ['public', 'draw', competitionId],
    queryFn: () => publicApi.draw(competitionId),
    refetchInterval: 5 * 60_000,
    enabled: competitionId !== '',
  });
  if (draw.isPending) return <p className="text-text-muted">Loading…</p>;
  if (draw.error) return <p className="text-danger">This draw is not available.</p>;
  const { competition, rounds } = draw.data;
  return (
    <div data-public-draw={competitionId}>
      <p className="text-sm text-text-muted">
        <Link to={`/ladders/${competitionId}`} className="underline">
          Ladder
        </Link>{' '}
        · {competition.seasonName} · {competition.nightName}
      </p>
      <h1 className="mb-4 text-3xl font-bold text-court">{competition.name} draw</h1>
      {rounds.length === 0 && (
        <p className="text-text-muted">The draw has not been published yet.</p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {rounds.map((r) => (
          <section key={r.round} className="rounded-lg border border-border bg-surface p-3">
            <h2 className="mb-2 font-semibold text-team">
              Round {r.round}{' '}
              <span className="text-xs font-normal text-text-muted">{r.date ?? ''}</span>
            </h2>
            <ul className="space-y-1 text-sm">
              {r.fixtures.map((f) => (
                <li key={f.id} className="flex justify-between gap-2">
                  <span>
                    {f.homeTeamName ?? f.homeName} <span className="text-text-muted">v</span>{' '}
                    {f.status === 'BYE' ? 'BYE' : (f.awayTeamName ?? f.awayName)}
                  </span>
                  <span className="text-xs text-text-muted">
                    {f.status === 'COMPLETED' || f.status === 'FORFEIT' ? (
                      <span className="font-semibold text-score">
                        {f.homeScore}–{f.awayScore}
                      </span>
                    ) : (
                      [f.startTime, f.courtName].filter(Boolean).join(' · ')
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
