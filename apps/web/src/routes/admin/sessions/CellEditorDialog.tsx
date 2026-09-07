import { useEffect, useState } from 'react';
import type { Court } from '@scoreboard/shared';
import { Button, Dialog, Field, Select, TextInput } from '../../../components/ui/index.js';
import type { CompetitionWithTeams } from '../../../lib/adminApi.js';
import { PLAYED, newKey, type DraftFixture } from './gridModel.js';

interface Props {
  open: boolean;
  slotIndex: number | null;
  courtId: string | null;
  fixture: DraftFixture | null;
  courts: Court[];
  competitions: CompetitionWithTeams[];
  slotCount: number;
  onSave: (fixture: DraftFixture) => void;
  onRemove: (key: string) => void;
  onClose: () => void;
}

/** Manual entry for one cell: competition → home → away, or ad-hoc names; move via slot/court. */
export function CellEditorDialog({
  open,
  slotIndex,
  courtId,
  fixture,
  courts,
  competitions,
  slotCount,
  onSave,
  onRemove,
  onClose,
}: Props) {
  const [competitionId, setCompetitionId] = useState<string>('');
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [homeName, setHomeName] = useState('');
  const [awayName, setAwayName] = useState('');
  const [slot, setSlot] = useState(0);
  const [court, setCourt] = useState('');
  const [round, setRound] = useState('');
  const [bye, setBye] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCompetitionId(fixture?.competitionId ?? competitions[0]?.id ?? '');
    setHomeTeamId(fixture?.homeTeamId ?? '');
    setAwayTeamId(fixture?.awayTeamId ?? '');
    setHomeName(fixture?.homeName ?? '');
    setAwayName(fixture?.awayName ?? '');
    setSlot(fixture?.slotIndex ?? slotIndex ?? 0);
    setCourt(fixture?.courtId ?? courtId ?? courts[0]?.id ?? '');
    setRound(
      fixture?.roundNumber === null || fixture?.roundNumber === undefined
        ? ''
        : String(fixture.roundNumber),
    );
    setBye(fixture?.status === 'BYE');
  }, [open, fixture, slotIndex, courtId, competitions, courts]);

  const comp = competitions.find((c) => c.id === competitionId) ?? null;
  const adHoc = competitionId === '';
  const played = fixture ? PLAYED.has(fixture.status) : false;
  const valid = adHoc
    ? homeName.trim() && (bye || awayName.trim())
    : homeTeamId && (bye || (awayTeamId && awayTeamId !== homeTeamId));

  const save = () => {
    onSave({
      key: fixture?.key ?? newKey(),
      id: fixture?.id,
      competitionId: adHoc ? null : competitionId,
      homeTeamId: adHoc ? null : homeTeamId,
      awayTeamId: adHoc || bye ? null : awayTeamId,
      homeName: adHoc ? homeName.trim() : null,
      awayName: adHoc && !bye ? awayName.trim() : null,
      slotIndex: bye ? null : slot,
      courtId: bye ? null : court,
      roundNumber: round === '' ? null : Number(round),
      status: bye ? 'BYE' : played ? (fixture as DraftFixture).status : 'SCHEDULED',
      homeScore: fixture?.homeScore ?? 0,
      awayScore: fixture?.awayScore ?? 0,
    });
  };

  return (
    <Dialog
      open={open}
      title={fixture ? 'Edit fixture' : 'Add fixture'}
      onClose={onClose}
      footer={
        <>
          {fixture && !played && (
            <Button variant="danger" onClick={() => onRemove(fixture.key)} className="mr-auto">
              Remove
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!valid}>
            {fixture ? 'Update' : 'Add'}
          </Button>
        </>
      }
    >
      {played && (
        <p className="mb-3 rounded bg-warning/20 px-3 py-2 text-sm">
          This game has been played; only its slot and court can change here. Edit the result on the
          Results page.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Competition" className="sm:col-span-2">
          <Select
            value={competitionId}
            onChange={(e) => setCompetitionId(e.target.value)}
            disabled={played}
          >
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="">— Ad-hoc game (typed names, no ladder) —</option>
          </Select>
        </Field>
        {adHoc ? (
          <>
            <Field label="Home">
              <TextInput
                value={homeName}
                onChange={(e) => setHomeName(e.target.value)}
                disabled={played}
              />
            </Field>
            <Field label="Away">
              <TextInput
                value={awayName}
                onChange={(e) => setAwayName(e.target.value)}
                disabled={played || bye}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Home team">
              <Select
                value={homeTeamId}
                onChange={(e) => setHomeTeamId(e.target.value)}
                disabled={played}
              >
                <option value="">—</option>
                {(comp?.teams ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Away team">
              <Select
                value={awayTeamId}
                onChange={(e) => setAwayTeamId(e.target.value)}
                disabled={played || bye}
              >
                <option value="">—</option>
                {(comp?.teams ?? [])
                  .filter((t) => t.id !== homeTeamId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </>
        )}
        <Field label="Slot">
          <Select
            value={slot}
            onChange={(e) => setSlot(Number(e.target.value))}
            disabled={bye}
            aria-label="Slot"
          >
            {Array.from({ length: Math.max(slotCount, 1) }, (_, i) => (
              <option key={i} value={i}>
                Slot {i + 1}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Court">
          <Select
            value={court}
            onChange={(e) => setCourt(e.target.value)}
            disabled={bye}
            aria-label="Court"
          >
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Round (optional)">
          <TextInput
            type="number"
            min={0}
            value={round}
            onChange={(e) => setRound(e.target.value)}
          />
        </Field>
        <label className="mt-6 inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={bye}
            onChange={(e) => setBye(e.target.checked)}
            disabled={played}
            className="h-4 w-4"
          />
          Bye (home team has no game this round)
        </label>
      </div>
    </Dialog>
  );
}
