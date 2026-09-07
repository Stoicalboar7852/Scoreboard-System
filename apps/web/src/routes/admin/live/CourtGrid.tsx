import { useState } from 'react';
import type { ClockState, CourtLiveState } from '@scoreboard/shared';
import { Badge, Button, TextInput } from '../../../components/ui/index.js';

export interface CourtGridProps {
  courts: CourtLiveState[];
  clocks: Record<string, ClockState>;
  nowMs: number;
  onSetScore: (courtId: string, homeScore: number, awayScore: number) => void;
  onEndGame: (courtId: string) => void;
  onReopen: (courtId: string) => void;
  onAssign: (courtId: string) => void;
  onQuickGame: (courtId: string) => void;
  onClear: (courtId: string) => void;
  onEndTimeout: (courtId: string) => void;
}

export function seenLabel(
  seenMs: number | null,
  nowMs: number,
): { text: string; tone: 'success' | 'warning' | 'danger' } {
  if (seenMs === null) return { text: 'never', tone: 'danger' };
  const ago = Math.max(0, Math.round((nowMs - seenMs) / 1000));
  if (ago < 45) return { text: `${ago}s ago`, tone: 'success' };
  if (ago < 180) return { text: `${Math.round(ago / 60)} min ago`, tone: 'warning' };
  return { text: 'offline', tone: 'danger' };
}

function ScoreEditor({
  court,
  onSave,
}: {
  court: CourtLiveState;
  onSave: (home: number, away: number) => void;
}) {
  const [home, setHome] = useState(String(court.homeScore));
  const [away, setAway] = useState(String(court.awayScore));
  const dirty = Number(home) !== court.homeScore || Number(away) !== court.awayScore;
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(Math.max(0, Number(home) || 0), Math.max(0, Number(away) || 0));
      }}
    >
      <TextInput
        type="number"
        min={0}
        value={dirty ? home : String(court.homeScore)}
        onChange={(e) => setHome(e.target.value)}
        className="w-16 text-center"
        aria-label="Home score"
      />
      <span className="text-text-muted">–</span>
      <TextInput
        type="number"
        min={0}
        value={dirty ? away : String(court.awayScore)}
        onChange={(e) => setAway(e.target.value)}
        className="w-16 text-center"
        aria-label="Away score"
      />
      <Button size="sm" type="submit" disabled={!dirty}>
        Save
      </Button>
    </form>
  );
}

/** Court grid (§7.3) with scores, time-out indicator, last-seen badges and overrides. */
export function CourtGrid(props: CourtGridProps) {
  const { courts, clocks, nowMs } = props;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-court-grid>
      {courts.map((court) => {
        const clock = court.clockId ? clocks[court.clockId] : undefined;
        const controller = seenLabel(court.lastControllerSeenMs, nowMs);
        const board = seenLabel(court.lastScoreboardSeenMs, nowMs);
        const current = court.current;
        return (
          <section
            key={court.courtId}
            className="rounded-xl border border-border bg-surface p-3"
            data-court-row={court.courtId}
          >
            <header className="mb-2 flex items-center justify-between">
              <h3 className="font-bold text-court">{court.courtName}</h3>
              <span className="flex gap-1 text-xs">
                <Badge tone={controller.tone}>ctrl {controller.text}</Badge>
                <Badge tone={board.tone}>board {board.text}</Badge>
              </span>
            </header>
            {current ? (
              <>
                <p className="text-sm">
                  <span className="text-team">{current.homeName}</span>{' '}
                  <span className="text-text-muted">vs</span>{' '}
                  <span className="text-team">{current.awayName}</span>
                </p>
                <p className="mb-2 text-xs text-text-muted">
                  {current.competitionName ?? 'Quick game'} ·{' '}
                  {clock?.label ?? current.formatName ?? ''} ·{' '}
                  <Badge
                    tone={
                      current.status === 'LIVE'
                        ? 'success'
                        : current.status === 'COMPLETED'
                          ? 'info'
                          : 'muted'
                    }
                  >
                    {current.status.toLowerCase()}
                  </Badge>
                  {court.timeout.active && (
                    <>
                      {' '}
                      <Badge tone="danger">time out</Badge>
                    </>
                  )}
                </p>
                <ScoreEditor
                  key={`${court.courtId}-${court.version}`}
                  court={court}
                  onSave={(h, a) => props.onSetScore(court.courtId, h, a)}
                />
              </>
            ) : (
              <p className="mb-2 text-sm text-text-muted">
                {court.next
                  ? `Next: ${court.next.homeName} vs ${court.next.awayName}`
                  : 'No game assigned'}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1">
              <Button size="sm" onClick={() => props.onAssign(court.courtId)}>
                Assign
              </Button>
              <Button size="sm" onClick={() => props.onQuickGame(court.courtId)}>
                Quick game
              </Button>
              {current?.status === 'LIVE' && (
                <Button size="sm" variant="danger" onClick={() => props.onEndGame(court.courtId)}>
                  End game
                </Button>
              )}
              {current?.status === 'COMPLETED' && (
                <Button size="sm" onClick={() => props.onReopen(court.courtId)}>
                  Reopen
                </Button>
              )}
              {court.timeout.active && (
                <Button size="sm" onClick={() => props.onEndTimeout(court.courtId)}>
                  End time out
                </Button>
              )}
              {current && (
                <Button size="sm" variant="ghost" onClick={() => props.onClear(court.courtId)}>
                  Clear
                </Button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
