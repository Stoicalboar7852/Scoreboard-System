import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { GameFormat } from '@scoreboard/shared';
import { adminApi, type FixtureWithNames } from '../../../lib/adminApi.js';
import { Button, Dialog, Field, Select, TextInput } from '../../../components/ui/index.js';

export function AssignFixtureDialog({
  open,
  courtId,
  courtName,
  sessionId,
  onAssign,
  onClose,
}: {
  open: boolean;
  courtId: string | null;
  courtName: string;
  sessionId: string | null;
  onAssign: (fixtureId: string) => void;
  onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: ['sessions', sessionId],
    queryFn: () => adminApi.sessions.get(sessionId as string),
    enabled: open && sessionId !== null,
  });
  const [choice, setChoice] = useState('');
  const candidates = (detail.data?.fixtures ?? []).filter(
    (f) => f.status === 'SCHEDULED' || f.status === 'LIVE',
  );
  const label = (f: FixtureWithNames) =>
    `Slot ${(f.slotIndex ?? 0) + 1} · ${f.courtName ?? 'no court'} · ${f.homeTeamName ?? f.homeName} vs ${f.awayTeamName ?? f.awayName} (${f.competitionName ?? f.formatName ?? 'quick'})`;
  const sorted = candidates
    .slice()
    .sort(
      (a, b) =>
        Number(b.courtId === courtId) - Number(a.courtId === courtId) ||
        (a.slotIndex ?? 0) - (b.slotIndex ?? 0),
    );
  return (
    <Dialog
      open={open}
      title={`Assign a fixture to ${courtName}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!choice} onClick={() => choice && onAssign(choice)}>
            Assign
          </Button>
        </>
      }
    >
      {!sessionId && <p className="text-sm text-text-muted">Go live with a session first.</p>}
      {detail.isPending && sessionId && (
        <p className="text-sm text-text-muted">Loading fixtures…</p>
      )}
      {sorted.length > 0 && (
        <Field label="Fixture (this court's fixtures are listed first)">
          <Select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            size={Math.min(10, sorted.length + 1)}
          >
            <option value="">— choose —</option>
            {sorted.map((f) => (
              <option key={f.id} value={f.id}>
                {label(f)}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {detail.data && sorted.length === 0 && (
        <p className="text-sm text-text-muted">No scheduled fixtures left in this session.</p>
      )}
    </Dialog>
  );
}

export function QuickGameDialog({
  open,
  courtName,
  formats,
  onStart,
  onClose,
}: {
  open: boolean;
  courtName: string;
  formats: GameFormat[];
  onStart: (homeName: string, awayName: string, formatId: string) => void;
  onClose: () => void;
}) {
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [formatId, setFormatId] = useState(formats[0]?.id ?? '');
  const valid = home.trim().length > 0 && away.trim().length > 0 && formatId !== '';
  return (
    <Dialog
      open={open}
      title={`Quick game on ${courtName}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => onStart(home.trim(), away.trim(), formatId)}
          >
            Assign game
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-text-muted">
        An unscheduled game with typed names. It is not counted on any ladder.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Home team">
          <TextInput value={home} onChange={(e) => setHome(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Away team">
          <TextInput value={away} onChange={(e) => setAway(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Format">
          <Select value={formatId} onChange={(e) => setFormatId(e.target.value)}>
            {formats.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

export function CreateSessionDialog({
  open,
  date,
  formats,
  onCreate,
  onClose,
}: {
  open: boolean;
  date: string;
  formats: GameFormat[];
  onCreate: (input: {
    date: string;
    firstSlotTime: string;
    slotLengthMinutes: number;
    slotCount: number;
    linkShorterToLonger: boolean;
  }) => void;
  onClose: () => void;
}) {
  const longest = formats.reduce(
    (max, f) =>
      Math.max(
        max,
        Math.ceil((f.halfSeconds * 2 + f.halfTimeSeconds + f.betweenGamesSeconds) / 60),
      ),
    0,
  );
  const [firstSlotTime, setFirstSlotTime] = useState('18:30');
  const [slotLength, setSlotLength] = useState(String(longest || 42));
  const [slotCount, setSlotCount] = useState('3');
  const [linked, setLinked] = useState(true);
  return (
    <Dialog
      open={open}
      title={`Create a session for ${date}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() =>
              onCreate({
                date,
                firstSlotTime,
                slotLengthMinutes: Number(slotLength),
                slotCount: Number(slotCount),
                linkShorterToLonger: linked,
              })
            }
          >
            Create
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First slot starts">
          <TextInput
            type="time"
            value={firstSlotTime}
            onChange={(e) => setFirstSlotTime(e.target.value)}
          />
        </Field>
        <Field
          label="Slot length (minutes)"
          hint={longest ? `Longest format needs ${longest} min` : undefined}
        >
          <TextInput
            type="number"
            min={1}
            value={slotLength}
            onChange={(e) => setSlotLength(e.target.value)}
          />
        </Field>
        <Field label="Slots">
          <TextInput
            type="number"
            min={0}
            max={30}
            value={slotCount}
            onChange={(e) => setSlotCount(e.target.value)}
          />
        </Field>
        <label className="mt-6 inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={linked}
            onChange={(e) => setLinked(e.target.checked)}
            className="h-4 w-4"
          />
          Shorter games wait for the longest (Pairs wait for Fours)
        </label>
      </div>
      <p className="mt-3 text-xs text-text-muted">
        Fixtures can be added from the Sessions page grid, by Excel import, or on the fly with Quick
        game.
      </p>
    </Dialog>
  );
}
