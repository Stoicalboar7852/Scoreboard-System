import type { ParsedFixtureRow, ValidationIssue } from '@scoreboard/shared';
import { Badge } from '../../../components/ui/index.js';

export interface ImportPreview {
  previewId: string;
  sessionId: string | null;
  autoCreateTeams: boolean;
  rows: ParsedFixtureRow[];
  issues: ValidationIssue[];
  summary: { total: number; valid: number; invalid: number; teamsToCreate: number; byes: number };
}

/** Row-by-row preview: every row shows its errors and warnings; session issues are listed below. */
export function ImportPreviewTable({ preview }: { preview: ImportPreview }) {
  const blocking =
    preview.summary.invalid > 0 || preview.issues.some((i) => i.severity === 'ERROR');
  return (
    <div data-import-preview>
      <p className="mb-2 flex flex-wrap gap-2 text-sm">
        <Badge tone="muted">{preview.summary.total} rows</Badge>
        <Badge tone="success">{preview.summary.valid} valid</Badge>
        {preview.summary.invalid > 0 && (
          <Badge tone="danger">{preview.summary.invalid} with errors</Badge>
        )}
        {preview.summary.teamsToCreate > 0 && (
          <Badge tone="warning">{preview.summary.teamsToCreate} team(s) will be created</Badge>
        )}
        {preview.summary.byes > 0 && <Badge tone="info">{preview.summary.byes} bye(s)</Badge>}
      </p>
      <div className="max-h-80 overflow-auto rounded border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface-2 text-text-muted">
            <tr>
              <th className="px-2 py-1 text-left">Row</th>
              <th className="px-2 py-1 text-left">Date</th>
              <th className="px-2 py-1 text-left">Slot</th>
              <th className="px-2 py-1 text-left">Court</th>
              <th className="px-2 py-1 text-left">Competition</th>
              <th className="px-2 py-1 text-left">Home</th>
              <th className="px-2 py-1 text-left">Away</th>
              <th className="px-2 py-1 text-left">Result</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((r) => (
              <tr
                key={r.rowNumber}
                className={`border-t border-border ${r.ok ? '' : 'bg-danger/10'}`}
                data-import-row={r.rowNumber}
                data-ok={r.ok}
              >
                <td className="px-2 py-1">{r.rowNumber}</td>
                <td className="px-2 py-1">{r.value.date ?? '—'}</td>
                <td className="px-2 py-1">
                  {r.value.isBye
                    ? 'bye'
                    : r.value.slotIndex === null
                      ? (r.value.startTime ?? '—')
                      : r.value.slotIndex + 1}
                </td>
                <td className="px-2 py-1">{r.value.courtName || '—'}</td>
                <td className="px-2 py-1">{r.value.competitionName || '—'}</td>
                <td className="px-2 py-1">{r.value.homeTeamName || '—'}</td>
                <td className="px-2 py-1">{r.value.awayTeamName || '—'}</td>
                <td className="px-2 py-1">
                  {r.ok && r.warnings.length === 0 && <Badge tone="success">ok</Badge>}
                  {r.errors.map((e, i) => (
                    <Badge key={`e${i}`} tone="danger">
                      {e.message}
                    </Badge>
                  ))}
                  {r.warnings.map((w, i) => (
                    <Badge key={`w${i}`} tone="warning">
                      {w.message}
                    </Badge>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview.issues.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs" aria-label="Scheduling conflicts">
          {preview.issues.map((i, idx) => (
            <li key={idx}>
              <Badge tone={i.severity === 'ERROR' ? 'danger' : 'warning'}>{i.message}</Badge>{' '}
              <span className="text-text-muted">
                rows{' '}
                {i.fixtureIds
                  .filter((f) => f.startsWith('row:'))
                  .map((f) => f.slice(4))
                  .join(', ') || '(existing fixtures)'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p
        className="mt-2 text-xs text-text-muted"
        data-import-verdict={blocking ? 'blocked' : 'ready'}
      >
        {blocking
          ? 'Fix the rows marked in red and upload again. Nothing has been written.'
          : 'Everything checks out. Commit writes all rows in one transaction.'}
      </p>
    </div>
  );
}
