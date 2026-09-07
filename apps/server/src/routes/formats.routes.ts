import { type FastifyInstance } from 'fastify';
import { gameFormatInputSchema, gameFormatUpdateSchema } from '@scoreboard/shared';
import { param, parse } from '../lib/validate.js';
import { mapFormat } from '../mappers/index.js';
import { type Services, actorOf } from '../services/index.js';

export function registerFormatRoutes(app: FastifyInstance, s: Services): void {
  app.get('/api/formats', { preHandler: [app.requireAdminOrController] }, async () => {
    const rows = await s.db.gameFormat.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(mapFormat);
  });

  app.post('/api/formats', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const input = parse(gameFormatInputSchema, request.body, 'format');
    const row = await s.db.gameFormat.create({ data: input });
    // New formats are supported by every court by default (§5 Court: "default all").
    const courts = await s.db.court.findMany({ select: { id: true } });
    if (courts.length)
      await s.db.courtFormat.createMany({
        data: courts.map((c) => ({ courtId: c.id, formatId: row.id })),
        skipDuplicates: true,
      });
    await s.audit.record({
      actor: actorOf(request),
      action: 'format.create',
      payload: { id: row.id, name: row.name },
      requestId: request.id,
    });
    return reply.status(201).send(mapFormat(row));
  });

  app.put('/api/formats/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    const input = parse(gameFormatUpdateSchema, request.body, 'format');
    const row = await s.db.gameFormat.update({ where: { id }, data: input });
    await s.audit.record({
      actor: actorOf(request),
      action: 'format.update',
      payload: { id, ...input },
      requestId: request.id,
    });
    return mapFormat(row);
  });

  app.delete('/api/formats/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    await s.db.gameFormat.delete({ where: { id } });
    await s.audit.record({
      actor: actorOf(request),
      action: 'format.delete',
      payload: { id },
      requestId: request.id,
    });
    return { ok: true };
  });
}
