import type { Court } from '@scoreboard/shared';
import { ConnectionBadge } from '../../components/ConnectionBadge.js';

interface Props {
  courts: Court[];
  venueName?: string;
  currentCourtId?: string | null;
  onPick: (courtId: string) => void;
  title?: string;
}

/** Grid of court cards (§7.1). Any tablet can serve any court. */
export function CourtPicker({
  courts,
  venueName,
  currentCourtId,
  onPick,
  title = 'Choose this tablet’s court',
}: Props) {
  return (
    <main className="flex min-h-full flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-court">{title}</h1>
          {venueName && <p className="text-text-muted">{venueName}</p>}
        </div>
        <ConnectionBadge />
      </header>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {courts.map((court) => (
          <button
            key={court.id}
            type="button"
            onClick={() => onPick(court.id)}
            className={`min-h-[96px] rounded-xl border-2 bg-surface text-2xl font-bold text-team active:bg-surface-2 ${court.id === currentCourtId ? 'border-court' : 'border-border'}`}
            data-court-card
          >
            {court.name}
          </button>
        ))}
        {courts.length === 0 && (
          <p className="text-text-muted">No active courts. Add courts in the admin panel.</p>
        )}
      </div>
    </main>
  );
}
