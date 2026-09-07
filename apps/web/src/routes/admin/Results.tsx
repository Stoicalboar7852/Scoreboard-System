import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { ResultInput } from '@scoreboard/shared';
import { useToast } from '../../components/Toaster.js';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  PageHeader,
  Select,
  Table,
  errorMessage,
} from '../../components/ui/index.js';
import { adminApi, type FixtureWithNames } from '../../lib/adminApi.js';
import { queryClient } from '../../lib/query.js';
import { ResultDialog } from './results/ResultDialog.js';

const STATUS_TONE = {
  SCHEDULED: 'muted',
  LIVE: 'success',
  COMPLETED: 'info',
  FORFEIT: 'warning',
  BYE: 'muted',
  CANCELLED: 'danger',
} as const;

/** Results table filterable by competition/round; every edit is audited server-side. */
export function Results() {
  const [params, setParams] = useSearchParams();
  const competitionId = params.get('competitionId') ?? '';
  const round = params.get('round') ?? '';
  const status = params.get('status') ?? '';
  const { toast } = useToast();
  const competitions = useQuery({
    queryKey: ['competitions', 'all'],
    queryFn: () => adminApi.competitions.list(),
  });
  const fixtures = useQuery({
    queryKey: ['fixtures', competitionId, round, status],
    queryFn: () =>
      adminApi.fixtures.list({
        competitionId: competitionId || undefined,
        round: round ? Number(round) : undefined,
        status: status || undefined,
      }),
    enabled: competitionId !== '',
  });
  const [editing, setEditing] = useState<FixtureWithNames | null>(null);
  const save = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ResultInput }) =>
      adminApi.fixtures.result(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['fixtures'] });
      await queryClient.invalidateQueries({ queryKey: ['ladders'] });
      await queryClient.invalidateQueries({ queryKey: ['finals'] });
      toast('Result saved', 'success');
      setEditing(null);
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const rounds = [
    ...new Set(
      (fixtures.data ?? []).map((f) => f.roundNumber).filter((r): r is number => r !== null),
    ),
  ].sort((a, b) => a - b);

  return (
    <div>
      <PageHeader
        title="Results"
        subtitle="Edit scores, mark forfeits and add notes; every change is audited"
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Competition">
          <Select
            value={competitionId}
            onChange={(e) => set('competitionId', e.target.value)}
            aria-label="Competition"
          >
            <option value="">— choose —</option>
            {(competitions.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Round">
          <Select value={round} onChange={(e) => set('round', e.target.value)} aria-label="Round">
            <option value="">All rounds</option>
            {rounds.map((r) => (
              <option key={r} value={r}>
                Round {r}
              </option>
            ))}
            <option value="0">Finals / unnumbered</option>
          </Select>
        </Field>
        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => set('status', e.target.value)}
            aria-label="Status"
          >
            <option value="">All</option>
            {['SCHEDULED', 'LIVE', 'COMPLETED', 'FORFEIT', 'BYE', 'CANCELLED'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {competitionId === '' ? (
        <EmptyState>Choose a competition to see its fixtures and results.</EmptyState>
      ) : fixtures.data?.length === 0 ? (
        <EmptyState>No fixtures match.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Round</th>
              <th>Date</th>
              <th>Court</th>
              <th>Home</th>
              <th>Away</th>
              <th>Score</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(fixtures.data ?? []).map((f) => (
              <tr key={f.id} data-result-row={f.id}>
                <td>{f.stage !== 'REGULAR' ? (f.finalsKey ?? f.stage) : (f.roundNumber ?? '—')}</td>
                <td>{f.sessionDate ?? '—'}</td>
                <td>{f.courtName ?? '—'}</td>
                <td className="font-semibold text-team">{f.homeTeamName ?? f.homeName}</td>
                <td className="font-semibold text-team">{f.awayTeamName ?? f.awayName}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {f.status === 'COMPLETED' || f.status === 'FORFEIT'
                    ? `${f.homeScore}–${f.awayScore}`
                    : '—'}
                </td>
                <td>
                  <Badge tone={STATUS_TONE[f.status]}>{f.status.toLowerCase()}</Badge>
                  {f.forfeitBy && (
                    <span className="ml-1 text-xs text-text-muted">
                      by {f.forfeitBy.toLowerCase()}
                    </span>
                  )}
                  {f.resultNotes && (
                    <span className="ml-1 text-xs text-text-muted" title={f.resultNotes}>
                      📝
                    </span>
                  )}
                </td>
                <td className="text-right">
                  {f.status !== 'BYE' && (
                    <Button size="sm" onClick={() => setEditing(f)} disabled={f.status === 'LIVE'}>
                      {f.status === 'SCHEDULED' ? 'Enter result' : 'Edit'}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <ResultDialog
        fixture={editing}
        saving={save.isPending}
        onSave={(input) => editing && save.mutate({ id: editing.id, input })}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
