import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { CompetitionWithTeams } from '../../../lib/adminApi.js';
import { adminApi } from '../../../lib/adminApi.js';
import { queryClient } from '../../../lib/query.js';
import { useToast } from '../../../components/Toaster.js';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Select,
  Table,
  TextInput,
  errorMessage,
} from '../../../components/ui/index.js';

function useInvalidate(keys: string[][]) {
  return async () => {
    for (const key of keys) await queryClient.invalidateQueries({ queryKey: key });
  };
}

/** Teams of one competition: add, rename, colour, delete. */
export function TeamsPanel({ competition }: { competition: CompetitionWithTeams }) {
  const { toast } = useToast();
  const teams = useQuery({
    queryKey: ['teams', competition.id],
    queryFn: () => adminApi.teams.list(competition.id),
  });
  const invalidate = useInvalidate([['teams'], ['competitions'], ['seasons']]);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string; shortName: string } | null>(
    null,
  );
  const create = useMutation({
    mutationFn: () => adminApi.teams.create({ competitionId: competition.id, name, colour: null }),
    onSuccess: async () => {
      await invalidate();
      setName('');
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const update = useMutation({
    mutationFn: (t: { id: string; name: string; shortName: string }) =>
      adminApi.teams.update(t.id, { name: t.name, shortName: t.shortName }),
    onSuccess: async () => {
      await invalidate();
      setEditing(null);
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.teams.remove(id),
    onSuccess: invalidate,
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-2 font-semibold text-team">
        Teams ({teams.data?.length ?? competition.teams.length})
      </h3>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New team name"
          aria-label="New team name"
        />
        <Button type="submit" variant="primary" disabled={!name.trim() || create.isPending}>
          Add
        </Button>
      </form>
      {teams.data?.length === 0 && <EmptyState>No teams yet.</EmptyState>}
      {teams.data && teams.data.length > 0 && (
        <Table>
          <thead>
            <tr>
              <th>Team</th>
              <th>Short</th>
              <th>Players</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {teams.data.map((t) =>
              editing?.id === t.id ? (
                <tr key={t.id}>
                  <td>
                    <TextInput
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      aria-label="Team name"
                    />
                  </td>
                  <td>
                    <TextInput
                      value={editing.shortName}
                      maxLength={12}
                      onChange={(e) => setEditing({ ...editing, shortName: e.target.value })}
                      aria-label="Short name"
                    />
                  </td>
                  <td></td>
                  <td className="text-right">
                    <Button size="sm" variant="primary" onClick={() => update.mutate(editing)}>
                      Save
                    </Button>{' '}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </td>
                </tr>
              ) : (
                <tr key={t.id}>
                  <td className="font-semibold text-team">{t.name}</td>
                  <td>{t.shortName}</td>
                  <td className="text-xs text-text-muted">
                    {t.players.map((p) => p.name).join(', ') || '—'}
                  </td>
                  <td className="text-right">
                    <Button
                      size="sm"
                      onClick={() => setEditing({ id: t.id, name: t.name, shortName: t.shortName })}
                    >
                      Edit
                    </Button>{' '}
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(t.id)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </Table>
      )}
    </section>
  );
}

/** Players with team membership across competitions; a player in two teams creates a clash automatically. */
export function PlayersPanel({ competitions }: { competitions: CompetitionWithTeams[] }) {
  const { toast } = useToast();
  const players = useQuery({ queryKey: ['players'], queryFn: () => adminApi.players.list() });
  const invalidate = useInvalidate([['players'], ['teams'], ['clash-links']]);
  const [name, setName] = useState('');
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const allTeams = competitions.flatMap((c) =>
    c.teams.map((t) => ({ ...t, competitionName: c.name })),
  );
  const teamLabel = (id: string) => {
    const t = allTeams.find((x) => x.id === id);
    return t ? `${t.name} (${t.competitionName})` : id;
  };
  const create = useMutation({
    mutationFn: () =>
      adminApi.players.create({ name: name.trim(), email: null, phone: null, teamIds }),
    onSuccess: async () => {
      await invalidate();
      setName('');
      setTeamIds([]);
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const setTeams = useMutation({
    mutationFn: ({ id, ids }: { id: string; ids: string[] }) =>
      adminApi.players.update(id, { teamIds: ids }),
    onSuccess: invalidate,
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.players.remove(id),
    onSuccess: invalidate,
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-1 font-semibold text-team">Players (optional rosters)</h3>
      <p className="mb-3 text-xs text-text-muted">
        A player in teams from two competitions on the same night makes those teams clash-linked
        automatically.
      </p>
      <form
        className="mb-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Player name"
          aria-label="Player name"
        />
        <Select
          multiple
          value={teamIds}
          onChange={(e) => setTeamIds([...e.target.selectedOptions].map((o) => o.value))}
          aria-label="Teams"
          size={3}
        >
          {allTeams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.competitionName})
            </option>
          ))}
        </Select>
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          Add player
        </Button>
      </form>
      {players.data && players.data.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Teams</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {players.data.map((p) => (
              <tr key={p.id}>
                <td className="font-semibold text-team">{p.name}</td>
                <td>
                  <div className="flex flex-wrap items-center gap-1">
                    {p.teamIds.map((id) => (
                      <Badge key={id} tone={p.teamIds.length > 1 ? 'warning' : 'muted'}>
                        {teamLabel(id)}
                        <button
                          type="button"
                          className="ml-1"
                          aria-label={`Remove ${teamLabel(id)}`}
                          onClick={() =>
                            setTeams.mutate({ id: p.id, ids: p.teamIds.filter((x) => x !== id) })
                          }
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                    <Select
                      value=""
                      onChange={(e) =>
                        e.target.value &&
                        setTeams.mutate({ id: p.id, ids: [...p.teamIds, e.target.value] })
                      }
                      className="w-auto py-1 text-xs"
                      aria-label={`Add ${p.name} to a team`}
                    >
                      <option value="">+ team</option>
                      {allTeams
                        .filter((t) => !p.teamIds.includes(t.id))
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.competitionName})
                          </option>
                        ))}
                    </Select>
                  </div>
                </td>
                <td className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(p.id)}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState>
          No players entered. Rosters are optional; use clash links instead if you prefer.
        </EmptyState>
      )}
    </section>
  );
}

/** Explicit "never in the same slot" links, plus the effective list including roster-derived ones. */
export function ClashLinksPanel({ competitions }: { competitions: CompetitionWithTeams[] }) {
  const { toast } = useToast();
  const links = useQuery({ queryKey: ['clash-links'], queryFn: adminApi.clashLinks.list });
  const effective = useQuery({
    queryKey: ['clash-links', 'effective'],
    queryFn: adminApi.clashLinks.effective,
  });
  const invalidate = useInvalidate([['clash-links']]);
  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  const [reason, setReason] = useState('');
  const allTeams = competitions.flatMap((c) =>
    c.teams.map((t) => ({ ...t, competitionName: c.name })),
  );
  const teamName = (id: string) => {
    const t = allTeams.find((x) => x.id === id);
    return t ? `${t.name} (${t.competitionName})` : id;
  };
  const create = useMutation({
    mutationFn: () =>
      adminApi.clashLinks.create({ teamAId: teamA, teamBId: teamB, reason: reason.trim() || null }),
    onSuccess: async () => {
      await invalidate();
      setTeamA('');
      setTeamB('');
      setReason('');
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.clashLinks.remove(id),
    onSuccess: invalidate,
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const derived = (effective.data ?? []).filter((c) => c.source === 'PLAYER');

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-1 font-semibold text-team">Clash links</h3>
      <p className="mb-3 text-xs text-text-muted">
        Two teams that must never be scheduled in the same time slot (for venues that do not enter
        rosters).
      </p>
      <form
        className="mb-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          if (teamA && teamB && teamA !== teamB) create.mutate();
        }}
      >
        <Field label="Team A">
          <Select value={teamA} onChange={(e) => setTeamA(e.target.value)}>
            <option value="">—</option>
            {allTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.competitionName})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Team B">
          <Select value={teamB} onChange={(e) => setTeamB(e.target.value)}>
            <option value="">—</option>
            {allTeams
              .filter((t) => t.id !== teamA)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.competitionName})
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Reason (optional)">
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="pt-6">
          <Button type="submit" variant="primary" disabled={!teamA || !teamB || teamA === teamB}>
            Link
          </Button>
        </div>
      </form>
      {links.data && links.data.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {links.data.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded bg-surface-2 px-3 py-1.5"
            >
              <span>
                {teamName(l.teamAId)} ↔ {teamName(l.teamBId)}
                {l.reason && <span className="text-text-muted"> · {l.reason}</span>}
              </span>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(l.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>No explicit clash links.</EmptyState>
      )}
      {derived.length > 0 && (
        <div className="mt-3 text-xs text-text-muted">
          <p className="mb-1 font-semibold">From shared players:</p>
          <ul className="space-y-0.5">
            {derived.map((c) => (
              <li key={`${c.teamAId}-${c.teamBId}`}>
                {teamName(c.teamAId)} ↔ {teamName(c.teamBId)} ({c.playerName})
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
