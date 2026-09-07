import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import {
  DEFAULT_FINALS_TEMPLATE,
  finalsTemplateSchema,
  nightName,
  type Season,
} from '@scoreboard/shared';
import { z } from 'zod';
import { useToast } from '../../components/Toaster.js';
import {
  Badge,
  Button,
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
import { adminApi, type SeasonWithCompetitions } from '../../lib/adminApi.js';
import { queryClient } from '../../lib/query.js';

const formSchema = z.object({
  name: z.string().trim().min(1).max(80),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  regularWeeks: z.number().int().positive().max(60),
  skippedDatesText: z.string(),
  finalsTemplateText: z.string().refine((t) => {
    try {
      return finalsTemplateSchema.safeParse(JSON.parse(t)).success;
    } catch {
      return false;
    }
  }, 'Not a valid finals template'),
  status: z.enum(['DRAFT', 'PUBLISHED', 'FINALS', 'COMPLETE']),
});
type FormValues = z.infer<typeof formSchema>;

const STATUS_TONE = {
  DRAFT: 'muted',
  PUBLISHED: 'success',
  FINALS: 'info',
  COMPLETE: 'warning',
} as const;

export function Seasons() {
  const seasons = useQuery({ queryKey: ['seasons'], queryFn: adminApi.seasons.list });
  const { toast } = useToast();
  const [editing, setEditing] = useState<SeasonWithCompetitions | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Season | null>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const open = (s: SeasonWithCompetitions | 'new') => {
    setEditing(s);
    form.reset(
      s === 'new'
        ? {
            name: '',
            startDate: new Date().toISOString().slice(0, 10),
            regularWeeks: 12,
            skippedDatesText: '',
            finalsTemplateText: JSON.stringify(DEFAULT_FINALS_TEMPLATE, null, 2),
            status: 'DRAFT',
          }
        : {
            name: s.name,
            startDate: s.startDate,
            regularWeeks: s.regularWeeks,
            skippedDatesText: s.skippedDates.join(', '),
            finalsTemplateText: JSON.stringify(s.finalsTemplate, null, 2),
            status: s.status,
          },
    );
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['seasons'] });
  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const body = {
        name: v.name,
        startDate: v.startDate,
        regularWeeks: v.regularWeeks,
        skippedDates: v.skippedDatesText
          .split(/[,\s]+/)
          .map((d) => d.trim())
          .filter(Boolean),
        finalsTemplate: finalsTemplateSchema.parse(JSON.parse(v.finalsTemplateText)),
      };
      return editing === 'new' || !editing
        ? adminApi.seasons.create(body)
        : adminApi.seasons.update(editing.id, { ...body, status: v.status });
    },
    onSuccess: async () => {
      await refresh();
      toast('Season saved', 'success');
      setEditing(null);
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.seasons.remove(id),
    onSuccess: async () => {
      await refresh();
      setDeleting(null);
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  return (
    <div>
      <PageHeader
        title="Seasons"
        subtitle="Start date, length, skipped dates and the finals template"
        actions={
          <Button variant="primary" onClick={() => open('new')}>
            Add season
          </Button>
        }
      />
      {seasons.data?.length === 0 ? (
        <EmptyState>No seasons yet.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Starts</th>
              <th>Weeks</th>
              <th>Competitions</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(seasons.data ?? []).map((s) => (
              <tr key={s.id}>
                <td className="font-semibold text-team">{s.name}</td>
                <td>{s.startDate}</td>
                <td>{s.regularWeeks}</td>
                <td>
                  {s.competitions.map((c) => (
                    <span key={c.id} className="mr-2 inline-block text-xs text-text-muted">
                      {c.name} ({nightName(c.nightOfWeek).slice(0, 3)})
                    </span>
                  ))}
                  <Link
                    to={`/admin/competitions?seasonId=${s.id}`}
                    className="text-xs text-court underline"
                  >
                    manage
                  </Link>{' '}
                  <Link to={`/admin/seasons/${s.id}/draw`} className="text-xs text-court underline">
                    draw &amp; finals
                  </Link>
                </td>
                <td>
                  <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
                </td>
                <td className="text-right">
                  <Button size="sm" onClick={() => open(s)}>
                    Edit
                  </Button>{' '}
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(s)}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Dialog
        open={editing !== null}
        title={editing === 'new' ? 'Add season' : 'Edit season'}
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
          <Field
            label="Start date (week 1 starts this week)"
            error={form.formState.errors.startDate?.message}
          >
            <TextInput type="date" {...form.register('startDate')} />
          </Field>
          <Field label="Regular-season weeks" error={form.formState.errors.regularWeeks?.message}>
            <TextInput
              type="number"
              min={1}
              max={60}
              {...form.register('regularWeeks', { valueAsNumber: true })}
            />
          </Field>
          {editing !== 'new' && (
            <Field label="Status">
              <Select {...form.register('status')}>
                {(['DRAFT', 'PUBLISHED', 'FINALS', 'COMPLETE'] as const).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field
            label="Skipped dates (YYYY-MM-DD, comma separated)"
            hint="Public holidays etc. The whole season shifts back a week for each."
            className="sm:col-span-2"
          >
            <TextInput
              {...form.register('skippedDatesText')}
              placeholder="2026-04-06, 2026-06-08"
            />
          </Field>
          <Field
            label="Finals template (JSON)"
            error={form.formState.errors.finalsTemplateText?.message}
            className="sm:col-span-2"
          >
            <textarea
              {...form.register('finalsTemplateText')}
              rows={12}
              className="w-full rounded border border-border bg-bg px-3 py-2 font-mono text-xs"
              spellCheck={false}
            />
          </Field>
        </form>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? ''}?`}
        message="All competitions, teams, sessions and fixtures in this season will be deleted."
        confirmLabel="Delete season"
        danger
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
