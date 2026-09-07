import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatSlotMinutes, nightName } from '@scoreboard/shared';
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
import { adminApi, type SessionListItem } from '../../lib/adminApi.js';
import { download } from '../../lib/api.js';
import { queryClient } from '../../lib/query.js';

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const STATUS_TONE = { PLANNED: 'muted', LIVE: 'success', COMPLETE: 'info' } as const;

/** `/admin/sessions`: nights by date, create by hand, export a season, open the grid editor. */
export function Sessions() {
  const { toast } = useToast();
  const [from, setFrom] = useState(addDays(isoToday(), -14));
  const [to, setTo] = useState(addDays(isoToday(), 60));
  const [seasonId, setSeasonId] = useState('');
  const sessions = useQuery({
    queryKey: ['sessions', 'list', from, to, seasonId],
    queryFn: () => adminApi.sessions.list({ from, to, seasonId: seasonId || undefined }),
  });
  const seasons = useQuery({ queryKey: ['seasons'], queryFn: adminApi.seasons.list });
  const formats = useQuery({ queryKey: ['formats'], queryFn: adminApi.formats.list });
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<SessionListItem | null>(null);
  const [draft, setDraft] = useState({
    date: isoToday(),
    firstSlotTime: '18:30',
    slotLengthMinutes: 42,
    slotCount: 3,
    linkShorterToLonger: true,
    seasonId: '',
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sessions'] });
  const create = useMutation({
    mutationFn: () =>
      adminApi.sessions.create({ ...draft, seasonId: draft.seasonId || null, published: false }),
    onSuccess: async () => {
      await refresh();
      toast('Session created', 'success');
      setCreating(false);
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.sessions.remove(id),
    onSuccess: async (res) => {
      if (!res.ok) toast('End the night before deleting the session', 'error');
      await refresh();
      setDeleting(null);
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const longest = (formats.data ?? []).reduce((m, f) => Math.max(m, formatSlotMinutes(f)), 0);

  return (
    <div>
      <PageHeader
        title="Sessions"
        subtitle="One session per night of play; open one to fill its slots × courts grid"
        actions={
          <>
            {seasonId && (
              <Button
                onClick={() =>
                  void download(`/api/export/seasons/${seasonId}.xlsx`, 'season.xlsx').catch(
                    (err) => toast(errorMessage(err), 'error'),
                  )
                }
              >
                Export season (.xlsx)
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => {
                setDraft((d) => ({ ...d, slotLengthMinutes: longest || d.slotLengthMinutes }));
                setCreating(true);
              }}
            >
              New session
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="From">
          <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Season">
          <Select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
            <option value="">All seasons</option>
            {(seasons.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {sessions.data?.length === 0 ? (
        <EmptyState>
          No sessions in this range. Create one by hand, import a spreadsheet, or generate a draw
          from the Seasons page.
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Night</th>
              <th>Starts</th>
              <th>Slots</th>
              <th>Fixtures</th>
              <th>Status</th>
              <th>Public</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(sessions.data ?? []).map((s) => (
              <tr key={s.id}>
                <td>
                  <Link
                    to={`/admin/sessions/${s.id}`}
                    className="font-semibold text-team underline-offset-2 hover:underline"
                  >
                    {s.date}
                  </Link>
                </td>
                <td>{nightName(s.nightOfWeek)}</td>
                <td>{s.firstSlotTime}</td>
                <td>
                  {s.slotCount} × {s.slotLengthMinutes} min
                  {s.linkShorterToLonger ? ' · linked' : ''}
                </td>
                <td>{s.fixtureCount}</td>
                <td>
                  <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
                </td>
                <td>
                  {s.published ? <Badge tone="success">published</Badge> : <Badge>draft</Badge>}
                </td>
                <td className="text-right">
                  <Link to={`/admin/sessions/${s.id}`}>
                    <Button size="sm">Open</Button>
                  </Link>{' '}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleting(s)}
                    disabled={s.status === 'LIVE'}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Dialog
        open={creating}
        title="New session"
        onClose={() => setCreating(false)}
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => create.mutate()} disabled={create.isPending}>
              Create
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date">
            <TextInput
              type="date"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            />
          </Field>
          <Field label="Season (optional)">
            <Select
              value={draft.seasonId}
              onChange={(e) => setDraft({ ...draft, seasonId: e.target.value })}
            >
              <option value="">— none (ad-hoc night) —</option>
              {(seasons.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="First slot starts">
            <TextInput
              type="time"
              value={draft.firstSlotTime}
              onChange={(e) => setDraft({ ...draft, firstSlotTime: e.target.value })}
            />
          </Field>
          <Field
            label="Slot length (minutes)"
            hint={longest ? `Longest format needs ${longest} min` : undefined}
          >
            <TextInput
              type="number"
              min={1}
              value={draft.slotLengthMinutes}
              onChange={(e) => setDraft({ ...draft, slotLengthMinutes: Number(e.target.value) })}
            />
          </Field>
          <Field label="Slots">
            <TextInput
              type="number"
              min={0}
              max={30}
              value={draft.slotCount}
              onChange={(e) => setDraft({ ...draft, slotCount: Number(e.target.value) })}
            />
          </Field>
          <div className="pt-6">
            <Checkbox
              label="Pairs wait for Fours (link clocks)"
              checked={draft.linkShorterToLonger}
              onChange={(e) => setDraft({ ...draft, linkShorterToLonger: e.target.checked })}
            />
          </div>
        </div>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete the session on ${deleting?.date ?? ''}?`}
        message={`${deleting?.fixtureCount ?? 0} fixture(s) will be deleted with it.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
