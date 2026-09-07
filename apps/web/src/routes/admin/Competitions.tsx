import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router';
import {
  NIGHT_NAMES,
  VENUE_POINTS_RULE,
  competitionInputSchema,
  detectLadderPreset,
  nightName,
  type CompetitionInput,
} from '@scoreboard/shared';
import type { z } from 'zod';
import { useToast } from '../../components/Toaster.js';
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  PageHeader,
  Select,
  Table,
  TextInput,
  errorMessage,
} from '../../components/ui/index.js';
import { adminApi, type CompetitionWithTeams } from '../../lib/adminApi.js';
import { queryClient } from '../../lib/query.js';
import { LadderRuleEditor } from './competitions/LadderRuleEditor.js';
import { ClashLinksPanel, PlayersPanel, TeamsPanel } from './competitions/panels.js';

export function Competitions() {
  const [params, setParams] = useSearchParams();
  const seasons = useQuery({ queryKey: ['seasons'], queryFn: adminApi.seasons.list });
  const formats = useQuery({ queryKey: ['formats'], queryFn: adminApi.formats.list });
  const seasonId = params.get('seasonId') ?? seasons.data?.[0]?.id ?? '';
  const competitions = useQuery({
    queryKey: ['competitions', seasonId],
    queryFn: () => adminApi.competitions.list(seasonId),
    enabled: seasonId !== '',
  });
  const allCompetitions = useQuery({
    queryKey: ['competitions', 'all'],
    queryFn: () => adminApi.competitions.list(),
  });
  const { toast } = useToast();
  const [editing, setEditing] = useState<CompetitionWithTeams | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CompetitionWithTeams | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const form = useForm<z.input<typeof competitionInputSchema>, unknown, CompetitionInput>({
    resolver: zodResolver(competitionInputSchema),
  });

  useEffect(() => {
    if (!params.get('seasonId') && seasons.data?.[0])
      setParams({ seasonId: seasons.data[0].id }, { replace: true });
  }, [params, seasons.data, setParams]);

  const open = (c: CompetitionWithTeams | 'new') => {
    setEditing(c);
    form.reset(
      c === 'new'
        ? {
            seasonId,
            name: '',
            nightOfWeek: 1,
            formatId: formats.data?.[0]?.id ?? '',
            ladderRule: structuredClone(VENUE_POINTS_RULE),
            displayOrder: competitions.data?.length ?? 0,
            published: false,
          }
        : {
            seasonId: c.seasonId,
            name: c.name,
            nightOfWeek: c.nightOfWeek,
            formatId: c.formatId,
            ladderRule: c.ladderRule,
            displayOrder: c.displayOrder,
            published: c.published,
          },
    );
  };
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['competitions'] });
    await queryClient.invalidateQueries({ queryKey: ['seasons'] });
  };
  const save = useMutation({
    mutationFn: (v: CompetitionInput) =>
      editing === 'new' || !editing
        ? adminApi.competitions.create(v)
        : adminApi.competitions.update(editing.id, v),
    onSuccess: async () => {
      await refresh();
      toast('Competition saved', 'success');
      setEditing(null);
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.competitions.remove(id),
    onSuccess: async () => {
      await refresh();
      setDeleting(null);
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const formatName = (id: string) => formats.data?.find((f) => f.id === id)?.name ?? '—';
  const selectedComp = competitions.data?.find((c) => c.id === selected) ?? null;

  return (
    <div>
      <PageHeader
        title="Competitions"
        subtitle="Grades per season: night, format, ladder rule, teams, players and clash links"
        actions={
          <>
            <Select
              value={seasonId}
              onChange={(e) => setParams({ seasonId: e.target.value })}
              aria-label="Season"
              className="w-auto"
            >
              {(seasons.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Button variant="primary" onClick={() => open('new')} disabled={!seasonId}>
              Add competition
            </Button>
          </>
        }
      />
      {seasons.data?.length === 0 && <EmptyState>Create a season first.</EmptyState>}
      {competitions.data && competitions.data.length === 0 && (
        <EmptyState>No competitions in this season yet.</EmptyState>
      )}
      {competitions.data && competitions.data.length > 0 && (
        <Table className="mb-6">
          <thead>
            <tr>
              <th>Name</th>
              <th>Night</th>
              <th>Format</th>
              <th>Teams</th>
              <th>Ladder rule</th>
              <th>Published</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {competitions.data.map((c) => (
              <tr key={c.id} className={selected === c.id ? 'bg-surface-2/50' : ''}>
                <td>
                  <button
                    type="button"
                    className="font-semibold text-team underline-offset-2 hover:underline"
                    onClick={() => setSelected(selected === c.id ? null : c.id)}
                  >
                    {c.name}
                  </button>
                </td>
                <td>{nightName(c.nightOfWeek)}</td>
                <td>{formatName(c.formatId)}</td>
                <td>{c.teams.length}</td>
                <td className="text-xs text-text-muted">
                  {detectLadderPreset(c.ladderRule) === 'CUSTOM'
                    ? 'Custom'
                    : detectLadderPreset(c.ladderRule) === 'VENUE_POINTS'
                      ? 'Venue points'
                      : 'Wins / for-against'}
                </td>
                <td>
                  {c.published ? <Badge tone="success">public</Badge> : <Badge>hidden</Badge>}
                </td>
                <td className="text-right">
                  <Button size="sm" onClick={() => open(c)}>
                    Edit
                  </Button>{' '}
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(c)}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {selectedComp && (
        <div className="mb-6">
          <TeamsPanel competition={selectedComp} />
        </div>
      )}
      {allCompetitions.data && allCompetitions.data.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-2">
          <PlayersPanel competitions={allCompetitions.data} />
          <ClashLinksPanel competitions={allCompetitions.data} />
        </div>
      )}

      <Dialog
        open={editing !== null}
        title={editing === 'new' ? 'Add competition' : 'Edit competition'}
        onClose={() => setEditing(null)}
        wide
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={form.handleSubmit((v) => save.mutate(v))}
              disabled={save.isPending}
            >
              Save
            </Button>
          </>
        }
      >
        <form
          className="grid gap-3 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit((v) => save.mutate(v))}
        >
          <Field label="Name" error={form.formState.errors.name?.message}>
            <TextInput {...form.register('name')} autoFocus />
          </Field>
          <Field label="Night of week" error={form.formState.errors.nightOfWeek?.message}>
            <Select {...form.register('nightOfWeek', { valueAsNumber: true })}>
              {Object.entries(NIGHT_NAMES).map(([n, label]) => (
                <option key={n} value={n}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Game format" error={form.formState.errors.formatId?.message}>
            <Select {...form.register('formatId')}>
              {(formats.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Display order">
            <TextInput
              type="number"
              min={0}
              {...form.register('displayOrder', { valueAsNumber: true })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Checkbox
              label="Published (ladder and draw visible on the public pages)"
              {...form.register('published')}
            />
          </div>
          <div className="sm:col-span-2">
            <h3 className="mb-2 text-sm font-semibold text-team">Ladder rule</h3>
            <Controller
              control={form.control}
              name="ladderRule"
              render={({ field }) => (
                <LadderRuleEditor
                  value={field.value ?? VENUE_POINTS_RULE}
                  onChange={field.onChange}
                />
              )}
            />
          </div>
        </form>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? ''}?`}
        message="Its teams, fixtures and results will be deleted."
        confirmLabel="Delete"
        danger
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
