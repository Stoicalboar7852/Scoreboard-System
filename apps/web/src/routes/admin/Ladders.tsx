import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toPng } from 'html-to-image';
import { useToast } from '../../components/Toaster.js';
import { LadderTable, ladderRuleSummary } from '../../components/LadderTable.js';
import {
  Button,
  EmptyState,
  Field,
  PageHeader,
  Select,
  Table,
  TextInput,
  errorMessage,
} from '../../components/ui/index.js';
import { adminApi } from '../../lib/adminApi.js';
import { download } from '../../lib/api.js';
import { queryClient } from '../../lib/query.js';

/** Ladder per competition with adjustments, CSV, PNG snapshot and the public link (§7.6). */
export function Ladders() {
  const [params, setParams] = useSearchParams();
  const competitions = useQuery({
    queryKey: ['competitions', 'all'],
    queryFn: () => adminApi.competitions.list(),
  });
  const competitionId = params.get('competitionId') ?? competitions.data?.[0]?.id ?? '';
  const competition = competitions.data?.find((c) => c.id === competitionId) ?? null;
  const ladder = useQuery({
    queryKey: ['ladders', competitionId],
    queryFn: () => adminApi.ladders.get(competitionId),
    enabled: competitionId !== '',
    refetchInterval: 30_000,
  });
  const adjustments = useQuery({
    queryKey: ['adjustments', competitionId],
    queryFn: () => adminApi.adjustments.list(competitionId),
    enabled: competitionId !== '',
  });
  const integrations = useQuery({
    queryKey: ['integrations'],
    queryFn: () => adminApi.integrations.get(),
    staleTime: 5 * 60_000,
  });
  const { toast } = useToast();
  const snapshotRef = useRef<HTMLDivElement>(null);
  const [teamId, setTeamId] = useState('');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['ladders', competitionId] });
    await queryClient.invalidateQueries({ queryKey: ['adjustments', competitionId] });
  };
  const add = useMutation({
    mutationFn: () =>
      adminApi.adjustments.create({
        competitionId,
        teamId,
        pointsDelta: Number(delta),
        reason: reason.trim(),
      }),
    onSuccess: async () => {
      await refresh();
      setDelta('');
      setReason('');
      toast('Adjustment added', 'success');
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.adjustments.remove(id),
    onSuccess: refresh,
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const publicUrl = `${window.location.origin}/ladders/${competitionId}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast('Public link copied', 'success');
    } catch {
      toast(publicUrl, 'info');
    }
  };
  const renderSnapshot = async (): Promise<string | null> => {
    const node = snapshotRef.current;
    if (!node) return null;
    return toPng(node, { backgroundColor: '#0B0F14', pixelRatio: 2 });
  };
  const snapshot = async () => {
    try {
      const dataUrl = await renderSnapshot();
      if (!dataUrl) return;
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `ladder-${(competition?.name ?? 'competition').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
      link.click();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  // Feature-flagged (§7.7): the server uploads the same PNG to the Facebook Page; the token never
  // reaches the browser and the button only exists when the server reports the feature enabled.
  const postToFacebook = useMutation({
    mutationFn: async () => {
      const imageDataUrl = await renderSnapshot();
      if (!imageDataUrl) throw new Error('Nothing to post yet');
      return adminApi.ladders.postToFacebook(competitionId, { imageDataUrl });
    },
    onSuccess: (result) => toast(`Posted to Facebook: ${result.url}`, 'success'),
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  return (
    <div>
      <PageHeader
        title="Ladders"
        subtitle="Computed from completed results; adjustments are audited"
        actions={
          <>
            <Select
              value={competitionId}
              onChange={(e) => setParams({ competitionId: e.target.value })}
              aria-label="Competition"
              className="w-auto"
            >
              {(competitions.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Button
              onClick={() =>
                void download(`/api/export/ladders/${competitionId}.csv`, 'ladder.csv').catch(
                  (err) => toast(errorMessage(err), 'error'),
                )
              }
              disabled={!competitionId}
            >
              CSV
            </Button>
            <Button onClick={() => void snapshot()} disabled={!competitionId}>
              PNG snapshot
            </Button>
            <Button
              onClick={() => void copyLink()}
              disabled={!competitionId || !competition?.published}
            >
              Copy public link
            </Button>
            {integrations.data?.facebook.enabled && (
              <Button
                onClick={() => {
                  if (window.confirm('Post the current ladder snapshot to the Facebook Page?'))
                    postToFacebook.mutate();
                }}
                disabled={!competitionId || postToFacebook.isPending}
              >
                {postToFacebook.isPending ? 'Posting…' : 'Post to Facebook'}
              </Button>
            )}
            {competition && (
              <Link to={`/admin/seasons/${competition.seasonId}/draw`}>
                <Button variant="primary">Lock ladder &amp; finals</Button>
              </Link>
            )}
          </>
        }
      />
      {!competition ? (
        <EmptyState>No competitions yet.</EmptyState>
      ) : (
        <>
          {!competition.published && (
            <p className="mb-3 rounded bg-warning/20 px-3 py-2 text-sm">
              This competition is not published; the public ladder page is hidden until it is.
            </p>
          )}
          <div ref={snapshotRef} className="rounded-xl bg-bg p-4">
            <h2 className="mb-1 text-xl font-bold text-court">{competition.name}</h2>
            <p className="mb-3 text-xs text-text-muted">
              {ladderRuleSummary(competition.ladderRule)}
              {ladder.data && ` · updated ${new Date(ladder.data.computedAtMs).toLocaleString()}`}
            </p>
            <LadderTable
              rows={ladder.data?.rows ?? []}
              rule={competition.ladderRule}
              highlight={4}
            />
          </div>
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface p-4">
              <h3 className="mb-2 font-semibold text-team">Add an adjustment</h3>
              <form
                className="grid gap-2 sm:grid-cols-[1fr_6rem]"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (teamId && delta && reason.trim()) add.mutate();
                }}
              >
                <Field label="Team">
                  <Select
                    value={teamId}
                    onChange={(e) => setTeamId(e.target.value)}
                    aria-label="Team"
                  >
                    <option value="">—</option>
                    {competition.teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="± points">
                  <TextInput
                    type="number"
                    value={delta}
                    onChange={(e) => setDelta(e.target.value)}
                    aria-label="Points delta"
                  />
                </Field>
                <Field label="Reason (required)" className="sm:col-span-2">
                  <TextInput
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={200}
                    aria-label="Reason"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={
                      !teamId || !delta || Number(delta) === 0 || !reason.trim() || add.isPending
                    }
                  >
                    Apply
                  </Button>
                </div>
              </form>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <h3 className="mb-2 font-semibold text-team">Adjustments</h3>
              {adjustments.data?.length === 0 ? (
                <p className="text-sm text-text-muted">None.</p>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>Points</th>
                      <th>Reason</th>
                      <th>By</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(adjustments.data ?? []).map((a) => (
                      <tr key={a.id}>
                        <td className="text-team">{a.teamName}</td>
                        <td className={a.pointsDelta < 0 ? 'text-danger' : 'text-success'}>
                          {a.pointsDelta > 0 ? `+${a.pointsDelta}` : a.pointsDelta}
                        </td>
                        <td>{a.reason}</td>
                        <td className="text-xs text-text-muted">
                          {a.createdBy} · {new Date(a.createdAtMs).toLocaleDateString()}
                        </td>
                        <td className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => remove.mutate(a.id)}>
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
