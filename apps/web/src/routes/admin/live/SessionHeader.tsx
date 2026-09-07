import type { Session, SessionLiveState } from '@scoreboard/shared';
import { nightName } from '@scoreboard/shared';
import { Badge, Button, Checkbox } from '../../../components/ui/index.js';

interface Props {
  date: string;
  live: SessionLiveState | null;
  planned: Session[];
  onGoLive: (sessionId: string) => void;
  onEnd: () => void;
  onToggleLink: (sessionId: string, value: boolean) => void;
  onCreate: () => void;
}

/** Tonight's session header (§7.3): status, go live / end night, Pairs-wait-for-Fours checkbox. */
export function SessionHeader({
  date,
  live,
  planned,
  onGoLive,
  onEnd,
  onToggleLink,
  onCreate,
}: Props) {
  const liveRow = live?.status === 'LIVE' ? live : null;
  const candidates = planned.filter((s) => s.status === 'PLANNED');
  const linkedFlag = liveRow
    ? liveRow.linkShorterToLonger
    : (candidates[0]?.linkShorterToLonger ?? false);
  const linkTarget = liveRow?.sessionId ?? candidates[0]?.id ?? null;
  return (
    <section className="mb-4 rounded-xl border border-border bg-surface p-4" data-session-header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-team">
            {nightName(new Date(`${date}T00:00:00`).getDay())} {date}
          </h2>
          <p className="text-sm text-text-muted">
            {liveRow ? (
              <>
                <Badge tone="success">LIVE</Badge> {liveRow.clockIds.length} clock
                {liveRow.clockIds.length === 1 ? '' : 's'} · {liveRow.slotCount} slots
              </>
            ) : candidates.length > 0 ? (
              <>
                <Badge>PLANNED</Badge> {candidates.length} session
                {candidates.length === 1 ? '' : 's'} ready
              </>
            ) : (
              'No session tonight'
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Checkbox
            label="Pairs wait for Fours (shorter clock waits for the longest)"
            checked={linkedFlag}
            disabled={!linkTarget}
            onChange={(e) => linkTarget && onToggleLink(linkTarget, e.target.checked)}
          />
          {liveRow ? (
            <Button variant="danger" onClick={onEnd}>
              End night
            </Button>
          ) : candidates.length > 0 ? (
            candidates.map((s) => (
              <Button key={s.id} variant="primary" onClick={() => onGoLive(s.id)}>
                Go live{candidates.length > 1 ? ` (${s.firstSlotTime})` : ''}
              </Button>
            ))
          ) : (
            <Button variant="primary" onClick={onCreate}>
              Create tonight's session
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
