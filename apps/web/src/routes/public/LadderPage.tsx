import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { LadderTable, ladderRuleSummary } from '../../components/LadderTable.js';
import { publicApi, type PublicFixture } from '../../lib/publicApi.js';

function FixtureList({ fixtures, showScores }: { fixtures: PublicFixture[]; showScores: boolean }) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border text-sm">
      {fixtures.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <span>
            <span className="font-semibold text-team">{f.homeTeamName ?? f.homeName}</span>{' '}
            <span className="text-text-muted">v</span>{' '}
            <span className="font-semibold text-team">
              {f.status === 'BYE' ? 'BYE' : (f.awayTeamName ?? f.awayName)}
            </span>
          </span>
          <span className="text-text-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {showScores && (f.status === 'COMPLETED' || f.status === 'FORFEIT') ? (
              <span className="font-bold text-score">
                {f.homeScore}–{f.awayScore}
                {f.status === 'FORFEIT' ? ' (forfeit)' : ''}
              </span>
            ) : (
              [f.sessionDate, f.startTime, f.courtName].filter(Boolean).join(' · ')
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** `/ladders/:competitionId`: full ladder, last round's results and next round's fixtures. */
export function LadderPage() {
  const { competitionId = '' } = useParams();
  const page = useQuery({
    queryKey: ['public', 'ladder', competitionId],
    queryFn: () => publicApi.ladder(competitionId),
    refetchInterval: 60_000,
    enabled: competitionId !== '',
  });
  if (page.isPending) return <p className="text-text-muted">Loading…</p>;
  if (page.error) return <p className="text-danger">This ladder is not available.</p>;
  const { competition, ladder, lastRound, nextRound } = page.data;
  return (
    <div className="space-y-6" data-public-ladder={competitionId}>
      <div>
        <p className="text-sm text-text-muted">
          <Link to="/ladders" className="underline">
            All ladders
          </Link>{' '}
          · {competition.seasonName} · {competition.nightName} · {competition.formatName}
        </p>
        <h1 className="text-3xl font-bold text-court">{competition.name}</h1>
        <p className="text-xs text-text-muted">{ladderRuleSummary(competition.ladderRule)}</p>
      </div>
      <LadderTable rows={ladder.rows} rule={competition.ladderRule} highlight={4} />
      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-2 font-semibold text-team">
            {lastRound ? `Round ${lastRound.round} results` : 'No results yet'}
          </h2>
          {lastRound && <FixtureList fixtures={lastRound.fixtures} showScores />}
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-team">
            {nextRound ? `Round ${nextRound.round} fixtures` : 'No upcoming fixtures'}
          </h2>
          {nextRound && <FixtureList fixtures={nextRound.fixtures} showScores={false} />}
          <Link
            to={`/draw/${competitionId}`}
            className="mt-2 inline-block text-xs text-text-muted underline"
          >
            Full season draw
          </Link>
        </section>
      </div>
    </div>
  );
}
