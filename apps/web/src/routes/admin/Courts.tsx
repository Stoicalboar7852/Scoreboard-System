import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { courtInputSchema, type Court, type CourtInput } from '@scoreboard/shared';
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
  Table,
  TextInput,
  errorMessage,
} from '../../components/ui/index.js';
import { adminApi } from '../../lib/adminApi.js';
import { queryClient } from '../../lib/query.js';

export function Courts() {
  const courts = useQuery({ queryKey: ['courts'], queryFn: adminApi.courts.list });
  const formats = useQuery({ queryKey: ['formats'], queryFn: adminApi.formats.list });
  const { toast } = useToast();
  const [editing, setEditing] = useState<Court | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Court | null>(null);
  const form = useForm<z.input<typeof courtInputSchema>, unknown, CourtInput>({
    resolver: zodResolver(courtInputSchema),
  });

  const open = (court: Court | 'new') => {
    setEditing(court);
    form.reset(
      court === 'new'
        ? {
            name: '',
            displayOrder: (courts.data?.length ?? 0) + 1,
            active: true,
            supportedFormatIds: (formats.data ?? []).map((f) => f.id),
          }
        : {
            name: court.name,
            displayOrder: court.displayOrder,
            active: court.active,
            supportedFormatIds: court.supportedFormatIds,
          },
    );
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['courts'] });
  const save = useMutation({
    mutationFn: (values: CourtInput) =>
      editing === 'new' || !editing
        ? adminApi.courts.create(values)
        : adminApi.courts.update(editing.id, values),
    onSuccess: async () => {
      await refresh();
      toast('Court saved', 'success');
      setEditing(null);
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.courts.remove(id),
    onSuccess: async () => {
      await refresh();
      setDeleting(null);
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const formatName = (id: string) => formats.data?.find((f) => f.id === id)?.name ?? id;
  return (
    <div>
      <PageHeader
        title="Courts"
        subtitle="Display order, active flag and which formats each court can host"
        actions={
          <Button variant="primary" onClick={() => open('new')}>
            Add court
          </Button>
        }
      />
      {courts.data?.length === 0 ? (
        <EmptyState>No courts yet.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Formats</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(courts.data ?? []).map((c) => (
              <tr key={c.id}>
                <td>{c.displayOrder}</td>
                <td className="font-semibold text-team">{c.name}</td>
                <td>{c.supportedFormatIds.map(formatName).join(', ') || '—'}</td>
                <td>{c.active ? <Badge tone="success">active</Badge> : <Badge>inactive</Badge>}</td>
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
      <Dialog
        open={editing !== null}
        title={editing === 'new' ? 'Add court' : 'Edit court'}
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
          <Field label="Display order" error={form.formState.errors.displayOrder?.message}>
            <TextInput
              type="number"
              min={0}
              {...form.register('displayOrder', { valueAsNumber: true })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Checkbox
              label="Active (shown to controllers and scoreboards)"
              {...form.register('active')}
            />
          </div>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm text-text-muted">Supported formats</legend>
            <div className="flex flex-wrap gap-3">
              {(formats.data ?? []).map((f) => (
                <Checkbox
                  key={f.id}
                  label={f.name}
                  value={f.id}
                  {...form.register('supportedFormatIds')}
                />
              ))}
            </div>
          </fieldset>
        </form>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? ''}?`}
        message="Fixtures on this court keep their results but lose the court reference."
        confirmLabel="Delete"
        danger
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
