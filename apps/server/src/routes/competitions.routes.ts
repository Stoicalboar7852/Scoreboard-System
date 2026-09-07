import { type FastifyInstance } from 'fastify';
import {
  VENUE_POINTS_RULE,
  competitionInputSchema,
  competitionUpdateSchema,
} from '@scoreboard/shared';
import { param, parse } from '../lib/validate.js';
import { mapCompetition, mapTeam } from '../mappers/index.js';
import { type Services, actorOf } from '../services/index.js';

export function registerCompetitionRoutes(app: FastifyInstance, s: Services): void {
  app.get('/api/competitions', { preHandler: [app.requireAdminOrController] }, async (request) => {
    const query = request.query as { seasonId?: string };
    const rows = await s.db.competition.findMany({
      where: query.seasonId ? { seasonId: query.seasonId } : undefined,
      orderBy: [{ nightOfWeek: 'asc' }, { displayOrder: 'asc' }, { name: 'asc' }],
      include: { teams: { orderBy: { name: 'asc' } } },
    });
    return rows.map((r) => ({ ...mapCompetition(r), teams: r.teams.map(mapTeam) }));
  });

  app.get('/api/competitions/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    const row = await s.db.competition.findUniqueOrThrow({
      where: { id },
      include: { teams: { orderBy: { name: 'asc' } } },
    });
    return { ...mapCompetition(row), teams: row.teams.map(mapTeam) };
  });

  app.post('/api/competitions', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const input = parse(competitionInputSchema, request.body, 'competition');
    const row = await s.db.competition.create({
      data: { ...input, ladderRule: input.ladderRule ?? VENUE_POINTS_RULE },
    });
    await s.audit.record({
      actor: actorOf(request),
      action: 'competition.create',
      payload: { id: row.id, name: row.name },
      requestId: request.id,
    });
    return reply.status(201).send(mapCompetition(row));
  });

  app.put('/api/competitions/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    const input = parse(competitionUpdateSchema, request.body, 'competition');
    const row = await s.db.competition.update({ where: { id }, data: input });
    s.ladders.invalidate(id);
    await s.audit.record({
      actor: actorOf(request),
      action: 'competition.update',
      payload: { id, ...input },
      requestId: request.id,
    });
    return mapCompetition(row);
  });

  app.delete('/api/competitions/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    await s.db.competition.delete({ where: { id } });
    s.ladders.invalidate(id);
    await s.audit.record({
      actor: actorOf(request),
      action: 'competition.delete',
      payload: { id },
      requestId: request.id,
    });
    return { ok: true };
  });
}
