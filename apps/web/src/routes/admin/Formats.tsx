import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { formatSlotMinutes, type GameFormat } from '@scoreboard/shared';
import { z } from 'zod';
import { useToast } from '../../components/Toaster.js';
import {
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  PageHeader,
  Table,
  TextInput,
  errorMessage,
} from '../../components/ui/index.js';
import { adminApi } from '../../lib/adminApi.js';
import { queryClient } from '../../lib/query.js';

/** Minutes in the form, seconds on the wire. */
const formSchema = z.object({
  name: z.string().trim().min(1).max(80),
  halfMinutes: z.number().positive().max(120),
  halfTimeMinutes: z.number().min(0).max(60),
  betweenGamesMinutes: z.number().min(0).max(60),
  timeoutSeconds: z.number().int().positive().max(600),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  displayOrder: z.number().int().min(0),
});
type FormValues = z.infer<typeof formSchema>;

const toForm = (f: GameFormat): FormValues => ({
  name: f.name,
  halfMinutes: f.halfSeconds / 60,
  halfTimeMinutes: f.halfTimeSeconds / 60,
  betweenGamesMinutes: f.betweenGamesSeconds / 60,
  timeoutSeconds: f.timeoutSeconds,
  colour: f.colour,
  displayOrder: f.displayOrder,
});
const toApi = (v: FormValues) => ({
  name: v.name,
  halfSeconds: Math.round(v.halfMinutes * 60),
  halfTimeSeconds: Math.round(v.halfTimeMinutes * 60),
  betweenGamesSeconds: Math.round(v.betweenGamesMinutes * 60),
  timeoutSeconds: v.timeoutSeconds,
  colour: v.colour,
  displayOrder: v.displayOrder,
});

export function Formats() {
  const formats = useQuery({ queryKey: ['formats'], queryFn: adminApi.formats.list });
  const { toast } = useToast();
  const [editing, setEditing] = useState<GameFormat | 'new' | null>(null);
  const [deleting, setDeleting] = useState<GameFormat | null>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema) });
  const open = (f: GameFormat | 'new') => {
    setEditing(f);
    form.reset(
      f === 'new'
        ? {
            name: '',
            halfMinutes: 20,
            halfTimeMinutes: 1,
            betweenGamesMinutes: 1,
            timeoutSeconds: 60,
            colour: '#38BDF8',
            displayOrder: formats.data?.length ?? 0,
          }
        : toForm(f),
    );
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['formats'] });
  const save = useMutation({
    mutationFn: (values: FormValues) =>
      editing === 'new' || !editing
        ? adminApi.formats.create(toApi(values))
        : adminApi.formats.update(editing.id, toApi(values)),
    onSuccess: async () => {
      await refresh();
      toast('Format saved', 'success');
      setEditing(null);
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.formats.remove(id),
    onSuccess: async () => {
      await refresh();
      setDeleting(null);
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const mins = (s: number) =>
    s % 60 === 0 ? `${s / 60} min` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div>
      <PageHeader
        title="Game formats"
        subtitle="Half length, half time, gap between games and time-out length"
        actions={
          <Button variant="primary" onClick={() => open('new')}>
            Add format
          </Button>
        }
      />
      {formats.data?.length === 0 ? (
        <EmptyState>No formats yet. Add Fours and Pairs to get started.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Half</th>
              <th>Half time</th>
              <th>Gap</th>
              <th>Time out</th>
              <th>Slot</th>
              <th>Colour</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(formats.data ?? []).map((f) => (
              <tr key={f.id}>
                <td className="font-semibold text-team">{f.name}</td>
                <td>{mins(f.halfSeconds)}</td>
                <td>{mins(f.halfTimeSeconds)}</td>
                <td>{mins(f.betweenGamesSeconds)}</td>
                <td>{f.timeoutSeconds} s</td>
                <td>{formatSlotMinutes(f)} min</td>
                <td>
                  <span
                    className="inline-block h-4 w-8 rounded"
                    style={{ background: f.colour }}
                    aria-label={f.colour}
                  />
                </td>
                <td className="text-right">
                  <Button size="sm" onClick={() => open(f)}>
                    Edit
                  </Button>{' '}
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(f)}>
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
        title={editing === 'new' ? 'Add format' : 'Edit format'}
        onClose={() => setEditing(null)}
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
          <Field label="Display order">
            <TextInput
              type="number"
              min={0}
              {...form.register('displayOrder', { valueAsNumber: true })}
            />
          </Field>
          <Field label="Half length (minutes)" error={form.formState.errors.halfMinutes?.message}>
            <TextInput
              type="number"
              step="0.5"
              min={0.5}
              {...form.register('halfMinutes', { valueAsNumber: true })}
            />
          </Field>
          <Field label="Half time (minutes)" error={form.formState.errors.halfTimeMinutes?.message}>
            <TextInput
              type="number"
              step="0.5"
              min={0}
              {...form.register('halfTimeMinutes', { valueAsNumber: true })}
            />
          </Field>
          <Field
            label="Gap between games (minutes)"
            error={form.formState.errors.betweenGamesMinutes?.message}
          >
            <TextInput
              type="number"
              step="0.5"
              min={0}
              {...form.register('betweenGamesMinutes', { valueAsNumber: true })}
            />
          </Field>
          <Field label="Time out (seconds)" error={form.formState.errors.timeoutSeconds?.message}>
            <TextInput
              type="number"
              min={1}
              {...form.register('timeoutSeconds', { valueAsNumber: true })}
            />
          </Field>
          <Field label="Colour accent" error={form.formState.errors.colour?.message}>
            <input
              type="color"
              {...form.register('colour')}
              className="h-10 w-16 cursor-pointer rounded border border-border bg-bg"
            />
          </Field>
        </form>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? ''}?`}
        message="Competitions using this format must be changed first."
        confirmLabel="Delete"
        danger
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
