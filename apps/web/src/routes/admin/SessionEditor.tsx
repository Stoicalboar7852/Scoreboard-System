import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { nightName } from '@scoreboard/shared';
import { useToast } from '../../components/Toaster.js';
import {
  Badge,
  Button,
  ConfirmDialog,
  PageHeader,
  errorMessage,
} from '../../components/ui/index.js';
import { adminApi } from '../../lib/adminApi.js';
import { download } from '../../lib/api.js';
import { queryClient } from '../../lib/query.js';
import { CellEditorDialog } from './sessions/CellEditorDialog.js';
import { ImportDialog } from './sessions/ImportDialog.js';
import { SessionGrid, fixtureLabel } from './sessions/SessionGrid.js';
import {
  addSlot,
  draftFromServer,
  issuesByFixture,
  removeFixture,
  removeLastSlot,
  toSaveInput,
  unscheduled,
  upsertFixture,
  validateDraft,
  type DraftFixture,
  type GridDraft,
} from './sessions/gridModel.js';

/** `/admin/sessions/:id` — the slots × courts editor with manual entry, import and publish. */
export function SessionEditor() {
  const { id = '' } = useParams();
  const { toast } = useToast();
  const detail = useQuery({
    queryKey: ['sessions', id],
    queryFn: () => adminApi.sessions.get(id),
    enabled: id !== '',
  });
  const courts = useQuery({ queryKey: ['courts'], queryFn: adminApi.courts.list });
  const competitions = useQuery({
    queryKey: ['competitions', 'all'],
    queryFn: () => adminApi.competitions.list(),
  });
  const clashes = useQuery({
    queryKey: ['clash-links', 'effective'],
    queryFn: adminApi.clashLinks.effective,
  });
  const [draft, setDraft] = useState<GridDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<{
    slotIndex: number | null;
    courtId: string | null;
    fixture: DraftFixture | null;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (detail.data && !dirty)
      setDraft(draftFromServer(detail.data.session.slotCount, detail.data.fixtures));
  }, [detail.data, dirty]);

  const session = detail.data?.session;
  const activeCourts = useMemo(() => (courts.data ?? []).filter((c) => c.active), [courts.data]);
  const issues = useMemo(() => {
    if (!draft || !session || !competitions.data || !clashes.data) return [];
    return validateDraft(draft, {
      courts: activeCourts,
      competitions: competitions.data,
      clashes: clashes.data,
      linkShorterToLonger: session.linkShorterToLonger,
    });
  }, [draft, session, activeCourts, competitions.data, clashes.data]);
  const issueMap = useMemo(() => issuesByFixture(issues), [issues]);

  const update = (next: GridDraft) => {
    setDraft(next);
    setDirty(true);
  };
  const save = useMutation({
    mutationFn: () => adminApi.sessions.saveGrid(id, toSaveInput(draft as GridDraft)),
    onSuccess: async (result) => {
      setDirty(false);
      queryClient.setQueryData(['sessions', id], result);
      await queryClient.invalidateQueries({ queryKey: ['sessions', 'list'] });
      toast(
        result.issues.length ? `Saved with ${result.issues.length} warning(s)` : 'Saved',
        result.issues.length ? 'info' : 'success',
      );
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const publish = useMutation({
    mutationFn: (published: boolean) => adminApi.sessions.publish(id, published),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast('Updated', 'success');
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  if (detail.isPending || !draft || !session)
    return <p className="text-text-muted">Loading session…</p>;
  if (detail.error) return <p className="text-danger">{errorMessage(detail.error)}</p>;
  const readOnly = session.status === 'LIVE';
  const spare = unscheduled(draft);

  return (
    <div>
      <PageHeader
        title={`${nightName(session.nightOfWeek)} ${session.date}`}
        subtitle={`${session.firstSlotTime} start · ${session.slotLengthMinutes} min slots${session.linkShorterToLonger ? ' · shorter clocks wait for the longest' : ''}`}
        actions={
          <>
            <Link to="/admin/sessions" className="self-center text-sm text-text-muted underline">
              All sessions
            </Link>
            <Badge
              tone={
                session.status === 'LIVE'
                  ? 'success'
                  : session.status === 'COMPLETE'
                    ? 'info'
                    : 'muted'
              }
            >
              {session.status}
            </Badge>
            <Button onClick={() => setImporting(true)} disabled={readOnly}>
              Import spreadsheet
            </Button>
            <Button
              onClick={() =>
                void download(
                  `/api/export/sessions/${id}.xlsx`,
                  `fixtures-${session.date}.xlsx`,
                ).catch((err) => toast(errorMessage(err), 'error'))
              }
            >
              Export .xlsx
            </Button>
            <Link to={`/admin/sessions/${id}/print`} target="_blank">
              <Button>Print</Button>
            </Link>
            <Button
              variant={session.published ? 'secondary' : 'primary'}
              onClick={() => publish.mutate(!session.published)}
            >
              {session.published ? 'Unpublish' : 'Publish'}
            </Button>
            <Button
              variant="primary"
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending || readOnly}
            >
              {save.isPending ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
            </Button>
          </>
        }
      />
      {readOnly && (
        <p className="mb-3 rounded bg-warning/20 px-3 py-2 text-sm">
          This session is live. Change games from the Live page; the grid is read-only until the
          night ends.
        </p>
      )}
      {issues.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2" aria-label="Validation issues">
          {issues.map((i, idx) => (
            <li key={`${i.code}-${idx}`}>
              <Badge tone="danger">{i.message}</Badge>
            </li>
          ))}
        </ul>
      )}
      <SessionGrid
        draft={draft}
        courts={activeCourts}
        competitions={competitions.data ?? []}
        issues={issueMap}
        firstSlotTime={session.firstSlotTime}
        slotLengthMinutes={session.slotLengthMinutes}
        readOnly={readOnly}
        onEditCell={(slotIndex, courtId, fixture) => setEditing({ slotIndex, courtId, fixture })}
        onAddSlot={() => update(addSlot(draft))}
        onRemoveSlot={() => update(removeLastSlot(draft))}
      />
      <section className="mt-4">
        <h2 className="mb-2 text-sm font-semibold text-team">
          Byes and unscheduled fixtures ({spare.length})
        </h2>
        {spare.length === 0 ? (
          <p className="text-xs text-text-muted">
            None. Use "+" in a cell to add a fixture, or add one here as a bye.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {spare.map((f) => {
              const label = fixtureLabel(f, competitions.data ?? []);
              return (
                <li key={f.key}>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => setEditing({ slotIndex: null, courtId: null, fixture: f })}
                    className="rounded border border-border bg-surface px-2 py-1 text-left text-xs hover:border-court"
                  >
                    <span className="font-semibold text-team">
                      {label.home} v {label.away}
                    </span>{' '}
                    <span className="text-text-muted">· {label.competition}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!readOnly && (
          <Button
            size="sm"
            className="mt-2"
            onClick={() => setEditing({ slotIndex: null, courtId: null, fixture: null })}
          >
            + Add bye / unscheduled fixture
          </Button>
        )}
      </section>

      <CellEditorDialog
        open={editing !== null}
        slotIndex={editing?.slotIndex ?? null}
        courtId={editing?.courtId ?? null}
        fixture={editing?.fixture ?? null}
        courts={activeCourts}
        competitions={competitions.data ?? []}
        slotCount={draft.slotCount}
        onSave={(f) => {
          update(upsertFixture(draft, f));
          setEditing(null);
        }}
        onRemove={(key) => {
          update(removeFixture(draft, key));
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />
      <ImportDialog
        open={importing}
        sessionId={id}
        onClose={() => setImporting(false)}
        onImported={async () => {
          setImporting(false);
          await queryClient.invalidateQueries({ queryKey: ['competitions'] });
          if (dirty) setConfirmDiscard(true);
          else await queryClient.invalidateQueries({ queryKey: ['sessions', id] });
        }}
      />
      <ConfirmDialog
        open={confirmDiscard}
        title="Reload the grid?"
        message="The import was committed. Your unsaved grid changes will be replaced by the imported fixtures."
        confirmLabel="Reload"
        onConfirm={async () => {
          setConfirmDiscard(false);
          setDirty(false);
          await queryClient.invalidateQueries({ queryKey: ['sessions', id] });
        }}
        onClose={() => setConfirmDiscard(false)}
      />
    </div>
  );
}
