import { nightName } from '@scoreboard/shared';
import { Badge, Table } from '../../../components/ui/index.js';
import type { DrawConflict, DrawPreviewSession } from '../../../lib/adminApi.js';

export function DrawSummary({
  sessions,
  warnings,
}: {
  sessions: DrawPreviewSession[];
  warnings: string[];
}) {
  return (
    <div data-draw-summary>
      {warnings.length > 0 && (
        <ul className="mb-3 space-y-1">
          {warnings.map((w, i) => (
            <li key={i}>
              <Badge tone="warning">{w}</Badge>
            </li>
          ))}
        </ul>
      )}
      <Table>
        <thead>
          <tr>
            <th>Week</th>
            <th>Date</th>
            <th>Night</th>
            <th>Slots</th>
            <th>Fixtures</th>
            <th>Byes</th>
            <th>Competitions</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={`${s.date}-${s.nightOfWeek}`}>
              <td>{s.weekNumber}</td>
              <td className="font-semibold text-team">{s.date}</td>
              <td>{nightName(s.nightOfWeek)}</td>
              <td>
                {s.slotCount} × {s.slotLengthMinutes} min from {s.firstSlotTime}
              </td>
              <td>{s.fixtures}</td>
              <td>{s.byes}</td>
              <td className="text-xs text-text-muted">{s.competitions.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

/** Structured conflict report (§8.2): the fixture that could not be placed and what to change. */
export function ConflictReport({
  conflicts,
  teamName,
  competitionName,
}: {
  conflicts: DrawConflict[];
  teamName: (id: string) => string;
  competitionName: (id: string) => string;
}) {
  return (
    <div
      className="rounded-xl border border-danger/60 bg-danger/10 p-4"
      role="alert"
      data-conflict-report
    >
      <h3 className="mb-2 font-semibold text-danger">The draw could not be completed</h3>
      <ul className="space-y-3 text-sm">
        {conflicts.map((c, i) => (
          <li key={i}>
            <p>
              <span className="font-semibold text-team">
                Week {c.weekNumber} · {nightName(c.nightOfWeek)} {c.date}
              </span>
              : {competitionName(c.fixture.competitionId)} — {teamName(c.fixture.homeTeamId)} v{' '}
              {c.fixture.awayTeamId ? teamName(c.fixture.awayTeamId) : 'BYE'}
            </p>
            <p className="text-text-muted">{c.reason}</p>
            <ul className="ml-4 list-disc text-text-muted">
              {c.suggestions.map((s, j) => (
                <li key={j}>{s}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
