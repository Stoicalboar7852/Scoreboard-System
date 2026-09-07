import { type FastifyInstance } from 'fastify';
import { DEFAULT_FINALS_TEMPLATE, seasonInputSchema, seasonUpdateSchema } from '@scoreboard/shared';
import { param, parse } from '../lib/validate.js';
import { mapCompetition, mapSeason } from '../mappers/index.js';
import { type Services, actorOf } from '../services/index.js';

export function registerSeasonRoutes(app: FastifyInstance, s: Services): void {
  app.get('/api/seasons', { preHandler: [app.requireAdmin] }, async () => {
    const rows = await s.db.season.findMany({
      orderBy: { startDate: 'desc' },
      include: { competitions: { orderBy: { displayOrder: 'asc' } } },
    });
    return rows.map((r) => ({ ...mapSeason(r), competitions: r.competitions.map(mapCompetition) }));
  });

  app.get('/api/seasons/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    const row = await s.db.season.findUniqueOrThrow({
      where: { id },
      include: {
        competitions: { orderBy: { displayOrder: 'asc' } },
        sessions: { orderBy: { date: 'asc' } },
      },
    });
    return {
      ...mapSeason(row),
      competitions: row.competitions.map(mapCompetition),
      sessionDates: row.sessions.map((x) => ({
        id: x.id,
        date: x.date,
        nightOfWeek: x.nightOfWeek,
        status: x.status,
        published: x.published,
      })),
    };
  });

  app.post('/api/seasons', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const input = parse(seasonInputSchema, request.body, 'season');
    const row = await s.db.season.create({
      data: {
        name: input.name,
        startDate: input.startDate,
        regularWeeks: input.regularWeeks,
        skippedDates: input.skippedDates,
        finalsTemplate: input.finalsTemplate ?? DEFAULT_FINALS_TEMPLATE,
      },
    });
    await s.audit.record({
      actor: actorOf(request),
      action: 'season.create',
      payload: { id: row.id, name: row.name },
      requestId: request.id,
    });
    return reply.status(201).send(mapSeason(row));
  });

  app.put('/api/seasons/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    const input = parse(seasonUpdateSchema, request.body, 'season');
    const row = await s.db.season.update({ where: { id }, data: input });
    await s.audit.record({
      actor: actorOf(request),
      action: 'season.update',
      payload: { id, ...input },
      requestId: request.id,
    });
    return mapSeason(row);
  });

  app.delete('/api/seasons/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    await s.db.season.delete({ where: { id } });
    s.ladders.invalidateAll();
    await s.audit.record({
      actor: actorOf(request),
      action: 'season.delete',
      payload: { id },
      requestId: request.id,
    });
    return { ok: true };
  });
}
