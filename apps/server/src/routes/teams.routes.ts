import { type FastifyInstance } from 'fastify';
import { teamInputSchema, teamUpdateSchema } from '@scoreboard/shared';
import { param, parse } from '../lib/validate.js';
import { mapTeam } from '../mappers/index.js';
import { type Services, actorOf } from '../services/index.js';

/** "Northern Beaches Spikers" → "NBS"; short names → the name itself (≤12 chars). */
export function deriveShortName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 12) return trimmed;
  const initials = trimmed
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (initials.length >= 2 ? initials : trimmed).slice(0, 12);
}

export function registerTeamRoutes(app: FastifyInstance, s: Services): void {
  app.get('/api/teams', { preHandler: [app.requireAdmin] }, async (request) => {
    const query = request.query as { competitionId?: string };
    const rows = await s.db.team.findMany({
      where: query.competitionId ? { competitionId: query.competitionId } : undefined,
      orderBy: { name: 'asc' },
      include: { players: { include: { player: true } } },
    });
    return rows.map((r) => ({
      ...mapTeam(r),
      players: r.players.map((p) => ({ id: p.player.id, name: p.player.name })),
    }));
  });

  app.post('/api/teams', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const input = parse(teamInputSchema, request.body, 'team');
    const row = await s.db.team.create({
      data: { ...input, shortName: input.shortName ?? deriveShortName(input.name) },
    });
    s.ladders.invalidate(row.competitionId);
    await s.audit.record({
      actor: actorOf(request),
      action: 'team.create',
      payload: { id: row.id, name: row.name },
      requestId: request.id,
    });
    return reply.status(201).send(mapTeam(row));
  });

  app.put('/api/teams/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    const input = parse(teamUpdateSchema, request.body, 'team');
    const row = await s.db.team.update({ where: { id }, data: input });
    s.ladders.invalidate(row.competitionId);
    await s.audit.record({
      actor: actorOf(request),
      action: 'team.update',
      payload: { id, ...input },
      requestId: request.id,
    });
    return mapTeam(row);
  });

  app.delete('/api/teams/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    const row = await s.db.team.delete({ where: { id } });
    s.ladders.invalidate(row.competitionId);
    await s.audit.record({
      actor: actorOf(request),
      action: 'team.delete',
      payload: { id },
      requestId: request.id,
    });
    return { ok: true };
  });
}
