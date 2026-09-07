import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useToast } from '../../../components/Toaster.js';
import { Button, Checkbox, Dialog, errorMessage } from '../../../components/ui/index.js';
import { api, download } from '../../../lib/api.js';
import { ImportPreviewTable, type ImportPreview } from './ImportPreviewTable.js';

interface Props {
  open: boolean;
  /** Import into this session; null imports by the Date column into matching/new sessions. */
  sessionId: string | null;
  onClose: () => void;
  onImported: () => void;
}

/** Template download → upload (.xlsx/.csv) → row-by-row preview → transactional commit. */
export function ImportDialog({ open, sessionId, onClose, onImported }: Props) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [autoCreate, setAutoCreate] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a file first');
      const form = new FormData();
      form.append('file', file, file.name);
      if (sessionId) form.append('sessionId', sessionId);
      form.append('autoCreateTeams', autoCreate ? 'true' : 'false');
      return api<ImportPreview>('/api/import/preview', { method: 'POST', form });
    },
    onSuccess: (p) => setPreview(p),
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const commit = useMutation({
    mutationFn: () =>
      api<{ fixturesCreated: number; teamsCreated: number; sessionsCreated: number }>(
        '/api/import/commit',
        {
          method: 'POST',
          body: { previewId: preview?.previewId, sessionId, autoCreateTeams: autoCreate },
        },
      ),
    onSuccess: (r) => {
      toast(
        `Imported ${r.fixturesCreated} fixture(s)${r.teamsCreated ? `, created ${r.teamsCreated} team(s)` : ''}${r.sessionsCreated ? `, ${r.sessionsCreated} new session(s)` : ''}`,
        'success',
      );
      setPreview(null);
      setFile(null);
      onImported();
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const blocked =
    !preview || preview.summary.invalid > 0 || preview.issues.some((i) => i.severity === 'ERROR');

  return (
    <Dialog
      open={open}
      title="Import fixtures from a spreadsheet"
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            variant="primary"
            disabled={blocked || commit.isPending}
            onClick={() => commit.mutate()}
          >
            {commit.isPending ? 'Committing…' : 'Commit import'}
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <Button
          size="sm"
          onClick={() =>
            void download('/api/import/template', 'fixtures-template.xlsx').catch((err) =>
              toast(errorMessage(err), 'error'),
            )
          }
        >
          Download template
        </Button>
        <span className="text-text-muted">
          Columns: Date, Start Time or Slot, Court, Competition, Home Team, Away Team, Round
        </span>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".xlsx,.csv"
          aria-label="Spreadsheet file"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
          }}
          className="text-sm"
        />
        <Checkbox
          label="Create missing teams"
          checked={autoCreate}
          onChange={(e) => setAutoCreate(e.target.checked)}
        />
        <Button
          variant="primary"
          size="sm"
          disabled={!file || upload.isPending}
          onClick={() => upload.mutate()}
        >
          {upload.isPending ? 'Checking…' : 'Preview'}
        </Button>
      </div>
      {preview && <ImportPreviewTable preview={preview} />}
    </Dialog>
  );
}
