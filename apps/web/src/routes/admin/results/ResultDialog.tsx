import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { resultInputSchema, type ResultInput } from '@scoreboard/shared';
import type { z } from 'zod';
import { Button, Dialog, Field, Select, TextInput } from '../../../components/ui/index.js';
import type { FixtureWithNames } from '../../../lib/adminApi.js';

interface Props {
  fixture: FixtureWithNames | null;
  onSave: (input: ResultInput) => void;
  onClose: () => void;
  saving?: boolean;
}

/** Edit scores, mark forfeits, add notes (§7.6). Reopening sets the fixture back to scheduled. */
export function ResultDialog({ fixture, onSave, onClose, saving = false }: Props) {
  const form = useForm<z.input<typeof resultInputSchema>, unknown, ResultInput>({
    resolver: zodResolver(resultInputSchema),
  });
  useEffect(() => {
    if (fixture) {
      form.reset({
        homeScore: fixture.homeScore,
        awayScore: fixture.awayScore,
        status:
          fixture.status === 'FORFEIT' ||
          fixture.status === 'CANCELLED' ||
          fixture.status === 'COMPLETED'
            ? fixture.status
            : 'COMPLETED',
        forfeitBy: fixture.forfeitBy,
        resultNotes: fixture.resultNotes ?? '',
      });
    }
  }, [fixture, form]);
  const status = form.watch('status');
  return (
    <Dialog
      open={fixture !== null}
      title={
        fixture
          ? `${fixture.homeTeamName ?? fixture.homeName} v ${fixture.awayTeamName ?? fixture.awayName}`
          : 'Result'
      }
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={form.handleSubmit((v) => onSave(v))} disabled={saving}>
            Save result
          </Button>
        </>
      }
    >
      {fixture && (
        <form
          className="grid gap-3 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit((v) => onSave(v))}
          data-result-form
        >
          <p className="text-xs text-text-muted sm:col-span-2">
            {fixture.competitionName ?? 'Quick game'} · round {fixture.roundNumber ?? '—'} ·{' '}
            {fixture.sessionDate ?? ''} · {fixture.courtName ?? 'no court'} · currently{' '}
            {fixture.status.toLowerCase()}
          </p>
          <Field
            label={`${fixture.homeTeamName ?? fixture.homeName ?? 'Home'} score`}
            error={form.formState.errors.homeScore?.message}
          >
            <TextInput
              type="number"
              min={0}
              max={999}
              {...form.register('homeScore', { valueAsNumber: true })}
            />
          </Field>
          <Field
            label={`${fixture.awayTeamName ?? fixture.awayName ?? 'Away'} score`}
            error={form.formState.errors.awayScore?.message}
          >
            <TextInput
              type="number"
              min={0}
              max={999}
              {...form.register('awayScore', { valueAsNumber: true })}
            />
          </Field>
          <Field label="Status" error={form.formState.errors.status?.message}>
            <Select {...form.register('status')}>
              <option value="COMPLETED">Completed</option>
              <option value="FORFEIT">Forfeit</option>
              <option value="CANCELLED">Cancelled (not counted)</option>
              <option value="SCHEDULED">Reopen (not played yet)</option>
            </Select>
          </Field>
          {status === 'FORFEIT' && (
            <Field label="Forfeited by" error={form.formState.errors.forfeitBy?.message}>
              <Select {...form.register('forfeitBy')}>
                <option value="">— choose —</option>
                <option value="HOME">{fixture.homeTeamName ?? fixture.homeName ?? 'Home'}</option>
                <option value="AWAY">{fixture.awayTeamName ?? fixture.awayName ?? 'Away'}</option>
              </Select>
            </Field>
          )}
          <Field
            label="Notes (optional)"
            className="sm:col-span-2"
            error={form.formState.errors.resultNotes?.message}
          >
            <TextInput
              {...form.register('resultNotes')}
              maxLength={500}
              placeholder="e.g. score corrected after referee card check"
            />
          </Field>
        </form>
      )}
    </Dialog>
  );
}
