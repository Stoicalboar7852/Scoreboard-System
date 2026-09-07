import type { Court, ValidationIssue } from '@scoreboard/shared';
import { formatTimeOfDay, slotStartMinutes } from '@scoreboard/shared';
import { Badge, Button } from '../../../components/ui/index.js';
import type { CompetitionWithTeams } from '../../../lib/adminApi.js';
import {
  ISSUE_LABELS,
  PLAYED,
  cellFixture,
  type DraftFixture,
  type GridDraft,
} from './gridModel.js';

export interface SessionGridProps {
  draft: GridDraft;
  courts: Court[];
  competitions: CompetitionWithTeams[];
  issues: Map<string, ValidationIssue[]>;
  firstSlotTime: string;
  slotLengthMinutes: number;
  readOnly?: boolean;
  onEditCell: (slotIndex: number, courtId: string, fixture: DraftFixture | null) => void;
  onAddSlot: () => void;
  onRemoveSlot: () => void;
}

export function fixtureLabel(
  f: DraftFixture,
  competitions: CompetitionWithTeams[],
): { home: string; away: string; competition: string } {
  const comp = competitions.find((c) => c.id === f.competitionId);
  const team = (id: string | null, fallback: string | null) =>
    comp?.teams.find((t) => t.id === id)?.name ?? fallback ?? '?';
  return {
    home: team(f.homeTeamId, f.homeName),
    away: f.status === 'BYE' ? 'BYE' : team(f.awayTeamId, f.awayName),
    competition: comp?.name ?? (f.competitionId ? '…' : 'Quick game'),
  };
}

/** Slots × courts grid with validation badges on every cell (§7.5). */
export function SessionGrid({
  draft,
  courts,
  competitions,
  issues,
  firstSlotTime,
  slotLengthMinutes,
  readOnly = false,
  onEditCell,
  onAddSlot,
  onRemoveSlot,
}: SessionGridProps) {
  const slots = Array.from({ length: draft.slotCount }, (_, i) => i);
  return (
    <div className="overflow-x-auto rounded-lg border border-border" data-session-grid>
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 bg-surface-2 px-2 py-2 text-left text-text-muted">Slot</th>
            {courts.map((c) => (
              <th key={c.id} className="bg-surface-2 px-2 py-2 text-left text-text-muted">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <tr key={slot} className="border-t border-border align-top">
              <th className="sticky left-0 bg-surface px-2 py-2 text-left font-semibold text-team">
                {slot + 1}
                <span className="block text-xs font-normal text-text-muted">
                  {formatTimeOfDay(slotStartMinutes(firstSlotTime, slotLengthMinutes, slot))}
                </span>
              </th>
              {courts.map((court) => {
                const fixtures = cellFixture(draft, slot, court.id);
                return (
                  <td key={court.id} className="px-1 py-1" data-cell={`${slot}-${court.id}`}>
                    {fixtures.length === 0 ? (
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => onEditCell(slot, court.id, null)}
                        className="h-16 w-full rounded border border-dashed border-border text-xs text-text-muted hover:border-court hover:text-text disabled:cursor-default"
                        aria-label={`Add fixture slot ${slot + 1} ${court.name}`}
                      >
                        +
                      </button>
                    ) : (
                      fixtures.map((f) => {
                        const label = fixtureLabel(f, competitions);
                        const cellIssues = issues.get(f.key) ?? [];
                        return (
                          <button
                            key={f.key}
                            type="button"
                            disabled={readOnly}
                            onClick={() => onEditCell(slot, court.id, f)}
                            className={`mb-1 w-full rounded border px-2 py-1 text-left last:mb-0 ${cellIssues.length ? 'border-danger bg-danger/10' : 'border-border bg-surface'} hover:border-court`}
                            data-fixture-cell={f.key}
                          >
                            <span className="block truncate font-semibold text-team">
                              {label.home} <span className="font-normal text-text-muted">v</span>{' '}
                              {label.away}
                            </span>
                            <span className="block truncate text-xs text-text-muted">
                              {label.competition}
                              {PLAYED.has(f.status)
                                ? ` · ${f.status.toLowerCase()}${f.status !== 'LIVE' ? ` ${f.homeScore}–${f.awayScore}` : ''}`
                                : ''}
                            </span>
                            {cellIssues.length > 0 && (
                              <span className="mt-1 flex flex-wrap gap-1">
                                {cellIssues.map((i, idx) => (
                                  <Badge key={`${i.code}-${idx}`} tone="danger">
                                    {ISSUE_LABELS[i.code]}
                                  </Badge>
                                ))}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          {slots.length === 0 && (
            <tr>
              <td colSpan={courts.length + 1} className="px-3 py-6 text-center text-text-muted">
                No slots yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {!readOnly && (
        <div className="flex gap-2 border-t border-border bg-surface p-2">
          <Button size="sm" onClick={onAddSlot}>
            + Add slot
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemoveSlot} disabled={draft.slotCount === 0}>
            − Remove last slot
          </Button>
        </div>
      )}
    </div>
  );
}
