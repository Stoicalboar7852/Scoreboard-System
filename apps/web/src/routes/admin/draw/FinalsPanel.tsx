import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { FinalsTemplate } from '@scoreboard/shared';
import { useToast } from '../../../components/Toaster.js';
import {
  Badge,
  Button,
  ConfirmDialog,
  Field,
  Select,
  TextInput,
  errorMessage,
} from '../../../components/ui/index.js';
import { adminApi, type CompetitionWithTeams } from '../../../lib/adminApi.js';
import { queryClient } from '../../../lib/query.js';

interface Props {
  competition: CompetitionWithTeams;
  template: FinalsTemplate;
  courts: Array<{ id: string; name: string }>;
  /** Suggested first finals date: the week after the last regular session on this night. */
  suggestedDates: string[];
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "Lock ladder and generate finals" (§7.6/§8.4) plus the live finals bracket with resolved placeholders. */
export function FinalsPanel({ competition, template, courts, suggestedDates }: Props) {
  const { toast } = useToast();
  const status = useQuery({
    queryKey: ['finals', competition.id],
    queryFn: () => adminApi.finals.status(competition.id),
  });
  const ladder = useQuery({
    queryKey: ['ladders', competition.id],
    queryFn: () => adminApi.ladders.get(competition.id),
  });
  const [nights, setNights] = useState(() =>
    template.weeks.map((w, i) => ({
      weekIndex: i,
      date:
        suggestedDates[i] ??
        addDays(suggestedDates[0] ?? new Date().toISOString().slice(0, 10), 7 * i),
      courtIds: courts.slice(0, 2).map((c) => c.id),
      firstSlotTime: '18:30',
      startSlotIndex: 0,
    })),
  );
  const [confirm, setConfirm] = useState(false);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['finals', competition.id] });
    await queryClient.invalidateQueries({ queryKey: ['sessions'] });
    await queryClient.invalidateQueries({ queryKey: ['seasons'] });
  };
  const generate = useMutation({
    mutationFn: () => adminApi.finals.generate({ competitionId: competition.id, nights }),
    onSuccess: async (r) => {
      await refresh();
      toast(`Finals generated: ${r.fixturesCreated} fixture(s)`, 'success');
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const unlock = useMutation({
    mutationFn: () => adminApi.finals.unlock(competition.id),
    onSuccess: async () => {
      await refresh();
      toast('Finals removed; ladder unlocked', 'success');
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const locked = status.data?.lockedAtMs !== null && status.data?.lockedAtMs !== undefined;

  return (
    <section
      className="rounded-xl border border-border bg-surface p-4"
      data-finals-panel={competition.id}
    >
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-team">
          {competition.name}{' '}
          {locked ? <Badge tone="info">finals generated</Badge> : <Badge>regular season</Badge>}
        </h3>
        {locked ? (
          <Button size="sm" variant="ghost" onClick={() => unlock.mutate()}>
            Unlock and remove finals
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            onClick={() => setConfirm(true)}
            disabled={(ladder.data?.rows.length ?? 0) < 4}
          >
            Lock ladder and generate finals
          </Button>
        )}
      </header>
      {!locked && (
        <div className="grid gap-3 sm:grid-cols-2">
          {nights.map((n, i) => (
            <div key={i} className="rounded border border-border p-3">
              <p className="mb-2 text-sm font-semibold">
                {template.weeks[i]?.name ?? `Week ${i + 1}`}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Date">
                  <TextInput
                    type="date"
                    value={n.date}
                    onChange={(e) =>
                      setNights(
                        nights.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)),
                      )
                    }
                  />
                </Field>
                <Field label="First slot">
                  <TextInput
                    type="time"
                    value={n.firstSlotTime}
                    onChange={(e) =>
                      setNights(
                        nights.map((x, j) =>
                          j === i ? { ...x, firstSlotTime: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Start at slot">
                  <TextInput
                    type="number"
                    min={1}
                    value={n.startSlotIndex + 1}
                    onChange={(e) =>
                      setNights(
                        nights.map((x, j) =>
                          j === i
                            ? { ...x, startSlotIndex: Math.max(0, Number(e.target.value) - 1) }
                            : x,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Courts">
                  <Select
                    multiple
                    size={3}
                    value={n.courtIds}
                    onChange={(e) =>
                      setNights(
                        nights.map((x, j) =>
                          j === i
                            ? { ...x, courtIds: [...e.target.selectedOptions].map((o) => o.value) }
                            : x,
                        ),
                      )
                    }
                    aria-label={`Courts for ${template.weeks[i]?.name ?? `week ${i + 1}`}`}
                  >
                    {courts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
          ))}
        </div>
      )}
      {status.data && status.data.matches.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted">
              <th className="py-1">Match</th>
              <th className="py-1">Date</th>
              <th className="py-1">Home</th>
              <th className="py-1">Away</th>
              <th className="py-1">Result</th>
            </tr>
          </thead>
          <tbody>
            {status.data.matches.map((m) => (
              <tr key={m.key} className="border-t border-border" data-finals-match={m.key}>
                <td className="py-1 font-semibold">
                  {m.key}{' '}
                  <span className="text-xs font-normal text-text-muted">({m.weekName})</span>
                </td>
                <td className="py-1">{m.date ?? '—'}</td>
                <td className={`py-1 ${m.home.teamId ? 'text-team' : 'text-text-muted italic'}`}>
                  {m.home.label}
                </td>
                <td className={`py-1 ${m.away.teamId ? 'text-team' : 'text-text-muted italic'}`}>
                  {m.away.label}
                </td>
                <td className="py-1">
                  {m.status === 'COMPLETED' || m.status === 'FORFEIT' ? (
                    `${m.homeScore}–${m.awayScore}`
                  ) : m.fixtureId ? (
                    <Link to="/admin/results" className="text-xs text-court underline">
                      enter result
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {status.data && status.data.seeds.length > 0 && (
        <p className="mt-2 text-xs text-text-muted">
          Seeds: {status.data.seeds.map((s) => `${s.seed}. ${s.teamName}`).join(' · ')}
        </p>
      )}
      <ConfirmDialog
        open={confirm}
        title={`Lock the ${competition.name} ladder?`}
        message="The current ladder positions become the finals seeds and the finals fixtures are created. Regular-season results entered afterwards will not change the seeds."
        confirmLabel="Lock and generate"
        onConfirm={() => {
          setConfirm(false);
          generate.mutate();
        }}
        onClose={() => setConfirm(false)}
      />
    </section>
  );
}
