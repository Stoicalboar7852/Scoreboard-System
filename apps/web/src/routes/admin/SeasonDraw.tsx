import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { NIGHT_NAMES, nightName } from '@scoreboard/shared';
import { useToast } from '../../components/Toaster.js';
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Field,
  PageHeader,
  Select,
  TextInput,
  errorMessage,
} from '../../components/ui/index.js';
import { adminApi, type DrawNightInput, type DrawPreview } from '../../lib/adminApi.js';
import { queryClient } from '../../lib/query.js';
import { ConflictReport, DrawSummary } from './draw/DrawSummary.js';
import { FinalsPanel } from './draw/FinalsPanel.js';

/** Season wizard (§7.5/§8): nights & courts → preview → commit → review → regenerate per week → publish → finals. */
export function SeasonDraw() {
  const { id = '' } = useParams();
  const { toast } = useToast();
  const season = useQuery({
    queryKey: ['seasons', id],
    queryFn: () => adminApi.seasons.get(id),
    enabled: id !== '',
  });
  const competitions = useQuery({
    queryKey: ['competitions', id],
    queryFn: () => adminApi.competitions.list(id),
    enabled: id !== '',
  });
  const courts = useQuery({ queryKey: ['courts'], queryFn: adminApi.courts.list });
  const activeCourts = useMemo(() => (courts.data ?? []).filter((c) => c.active), [courts.data]);
  const nightsInUse = useMemo(
    () => [...new Set((competitions.data ?? []).map((c) => c.nightOfWeek))].sort(),
    [competitions.data],
  );
  const [nights, setNights] = useState<Record<number, DrawNightInput>>({});
  const [seed, setSeed] = useState<string>('');
  const [replace, setReplace] = useState(false);
  const [onlyWeek, setOnlyWeek] = useState<string>('');
  const [preview, setPreview] = useState<DrawPreview | null>(null);
  const [confirmCommit, setConfirmCommit] = useState(false);

  const nightInput = (night: number): DrawNightInput =>
    nights[night] ?? {
      nightOfWeek: night,
      courtIds: activeCourts.map((c) => c.id),
      firstSlotTime: '18:30',
      linkShorterToLonger: true,
      extraSlots: 0,
    };
  const setNight = (night: number, patch: Partial<DrawNightInput>) =>
    setNights({ ...nights, [night]: { ...nightInput(night), ...patch } });
  const body = () => ({
    seasonId: id,
    nights: nightsInUse.map(nightInput),
    ...(seed !== '' ? { seed: Number(seed) } : {}),
  });

  const run = useMutation({
    mutationFn: () => adminApi.draw.preview(body()),
    onSuccess: (p) => {
      setPreview(p);
      setSeed(String(p.seed));
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const commit = useMutation({
    mutationFn: () =>
      adminApi.draw.commit({
        ...body(),
        seed: Number(seed),
        replaceExisting: replace || onlyWeek !== '',
        onlyWeeks: onlyWeek ? [Number(onlyWeek)] : undefined,
      }),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ['seasons'] });
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast(
        `Draw saved: ${r.sessionsCreated} new, ${r.sessionsReplaced} replaced, ${r.fixturesCreated} fixtures`,
        'success',
      );
      setPreview(null);
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const publish = useMutation({
    mutationFn: (published: boolean) => adminApi.draw.publishSeason(id, published),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['seasons'] });
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast('Season updated', 'success');
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  if (season.isPending || !season.data) return <p className="text-text-muted">Loading season…</p>;
  const s = season.data;
  const sessionDates = s.sessionDates ?? [];
  const teamName = (teamId: string) =>
    competitions.data?.flatMap((c) => c.teams).find((t) => t.id === teamId)?.name ?? teamId;
  const competitionName = (compId: string) =>
    competitions.data?.find((c) => c.id === compId)?.name ?? compId;
  const lastDateFor = (night: number) =>
    sessionDates
      .filter((d) => d.nightOfWeek === night)
      .map((d) => d.date)
      .sort()
      .at(-1);
  const suggestedFinals = (night: number) => {
    const last = lastDateFor(night) ?? s.startDate;
    const d = new Date(`${last}T00:00:00Z`);
    return [1, 2, 3].map((w) => {
      const x = new Date(d);
      x.setUTCDate(x.getUTCDate() + 7 * w);
      return x.toISOString().slice(0, 10);
    });
  };

  return (
    <div>
      <PageHeader
        title={`${s.name} — draw`}
        subtitle={`${s.regularWeeks} weeks from ${s.startDate}${s.skippedDates.length ? ` · skipping ${s.skippedDates.join(', ')}` : ''} · ${sessionDates.length} session(s) exist`}
        actions={
          <>
            <Link to="/admin/seasons" className="self-center text-sm text-text-muted underline">
              Seasons
            </Link>
            <Badge
              tone={s.status === 'PUBLISHED' ? 'success' : s.status === 'FINALS' ? 'info' : 'muted'}
            >
              {s.status}
            </Badge>
            <Button
              variant={s.status === 'DRAFT' ? 'primary' : 'secondary'}
              onClick={() => publish.mutate(s.status === 'DRAFT')}
              disabled={sessionDates.length === 0}
            >
              {s.status === 'DRAFT' ? 'Publish season' : 'Unpublish'}
            </Button>
          </>
        }
      />

      <section className="mb-4 rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 font-semibold text-team">1. Nights and courts</h2>
        {nightsInUse.length === 0 && (
          <p className="text-sm text-text-muted">Add competitions to this season first.</p>
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          {nightsInUse.map((night) => {
            const n = nightInput(night);
            return (
              <div key={night} className="rounded border border-border p-3" data-draw-night={night}>
                <p className="mb-2 font-semibold">
                  {nightName(night)}{' '}
                  <span className="text-xs font-normal text-text-muted">
                    {(competitions.data ?? [])
                      .filter((c) => c.nightOfWeek === night)
                      .map((c) => c.name)
                      .join(', ')}
                  </span>
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Courts">
                    <div className="flex flex-wrap gap-2">
                      {activeCourts.map((c) => (
                        <Checkbox
                          key={c.id}
                          label={c.name}
                          checked={n.courtIds.includes(c.id)}
                          onChange={(e) =>
                            setNight(night, {
                              courtIds: e.target.checked
                                ? [...n.courtIds, c.id]
                                : n.courtIds.filter((x) => x !== c.id),
                            })
                          }
                        />
                      ))}
                    </div>
                  </Field>
                  <Field label="First slot starts">
                    <TextInput
                      type="time"
                      value={n.firstSlotTime}
                      onChange={(e) => setNight(night, { firstSlotTime: e.target.value })}
                    />
                  </Field>
                  <Field label="Extra slots allowed" hint="Only if the generator reports conflicts">
                    <TextInput
                      type="number"
                      min={0}
                      max={5}
                      value={n.extraSlots}
                      onChange={(e) => setNight(night, { extraSlots: Number(e.target.value) })}
                    />
                  </Field>
                  <div className="pt-6">
                    <Checkbox
                      label="Shorter games wait for the longest"
                      checked={n.linkShorterToLonger}
                      onChange={(e) => setNight(night, { linkShorterToLonger: e.target.checked })}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-4 rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 font-semibold text-team">2. Generate</h2>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Seed (blank = random; keep it to reproduce)">
            <TextInput
              type="number"
              min={0}
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="w-40"
            />
          </Field>
          <Button
            variant="primary"
            onClick={() => run.mutate()}
            disabled={run.isPending || nightsInUse.length === 0}
          >
            {run.isPending ? 'Generating…' : 'Preview draw'}
          </Button>
          {preview?.ok && (
            <span className="text-xs text-text-muted">
              Took {preview.stats.elapsedMs} ms · {preview.stats.restarts} restart(s)
            </span>
          )}
        </div>
        {preview && !preview.ok && (
          <div className="mt-3">
            <ConflictReport
              conflicts={preview.conflicts}
              teamName={teamName}
              competitionName={competitionName}
            />
          </div>
        )}
        {preview?.ok && (
          <div className="mt-3 space-y-3">
            <DrawSummary sessions={preview.sessions} warnings={preview.warnings} />
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Only regenerate week">
                <Select
                  value={onlyWeek}
                  onChange={(e) => setOnlyWeek(e.target.value)}
                  className="w-40"
                >
                  <option value="">All weeks</option>
                  {Array.from({ length: s.regularWeeks }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      Week {i + 1}
                    </option>
                  ))}
                </Select>
              </Field>
              <Checkbox
                label="Replace existing sessions on these dates"
                checked={replace || onlyWeek !== ''}
                onChange={(e) => setReplace(e.target.checked)}
                disabled={onlyWeek !== ''}
              />
              <Button
                variant="primary"
                onClick={() => setConfirmCommit(true)}
                disabled={commit.isPending}
              >
                Save draw as draft sessions
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="mb-4 rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 font-semibold text-team">3. Review sessions</h2>
        {sessionDates.length === 0 ? (
          <p className="text-sm text-text-muted">
            No sessions yet. Save a draw or add sessions by hand.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-sm">
            {sessionDates.map((d) => (
              <li key={d.id}>
                <Link
                  to={`/admin/sessions/${d.id}`}
                  className={`rounded border px-2 py-1 ${d.published ? 'border-success/50' : 'border-border'} hover:border-court`}
                >
                  {NIGHT_NAMES[d.nightOfWeek as 0].slice(0, 3)} {d.date}
                  {d.status !== 'PLANNED' && (
                    <span className="ml-1 text-xs text-text-muted">{d.status.toLowerCase()}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 font-semibold text-team">4. Finals</h2>
        <p className="mb-3 text-xs text-text-muted">
          Template:{' '}
          {s.finalsTemplate.weeks
            .map((w) => `${w.name} (${w.matches.map((m) => m.key).join(', ')})`)
            .join(' → ')}
          . Drawn finals go to the higher seed.
        </p>
        <div className="grid gap-3 xl:grid-cols-2">
          {(competitions.data ?? []).map((c) => (
            <FinalsPanel
              key={c.id}
              competition={c}
              template={s.finalsTemplate}
              courts={activeCourts}
              suggestedDates={suggestedFinals(c.nightOfWeek)}
            />
          ))}
        </div>
      </section>

      <ConfirmDialog
        open={confirmCommit}
        title={onlyWeek ? `Regenerate week ${onlyWeek}?` : 'Save the draw?'}
        message={
          onlyWeek
            ? `The session for week ${onlyWeek} on each night is replaced with the previewed layout. Other weeks are untouched.`
            : replace
              ? 'Existing sessions on the same dates are replaced (played nights are protected).'
              : 'Sessions are created as drafts you can review and edit before publishing.'
        }
        confirmLabel={onlyWeek ? 'Regenerate week' : 'Save draw'}
        onConfirm={() => {
          setConfirmCommit(false);
          commit.mutate();
        }}
        onClose={() => setConfirmCommit(false)}
      />
    </div>
  );
}
