import { type FastifyInstance } from 'fastify';
import { courtInputSchema, courtUpdateSchema } from '@scoreboard/shared';
import { NotFoundError } from '../errors.js';
import { param, parse } from '../lib/validate.js';
import { mapCourt } from '../mappers/index.js';
import { type Services, actorOf } from '../services/index.js';

export function registerCourtRoutes(app: FastifyInstance, s: Services): void {
  const include = { supportedFormats: true } as const;

  app.get('/api/courts', { preHandler: [app.requireAdminOrController] }, async () => {
    const rows = await s.db.court.findMany({
      include,
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(mapCourt);
  });

  app.post('/api/courts', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const input = parse(courtInputSchema, request.body, 'court');
    const formatIds = input.supportedFormatIds.length
      ? input.supportedFormatIds
      : (await s.db.gameFormat.findMany({ select: { id: true } })).map((f) => f.id);
    const row = await s.db.court.create({
      data: {
        name: input.name,
        displayOrder: input.displayOrder,
        active: input.active,
        supportedFormats: { create: formatIds.map((formatId) => ({ formatId })) },
      },
      include,
    });
    await s.audit.record({
      actor: actorOf(request),
      action: 'court.create',
      payload: { id: row.id, name: row.name },
      requestId: request.id,
    });
    return reply.status(201).send(mapCourt(row));
  });

  app.put('/api/courts/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    const input = parse(courtUpdateSchema, request.body, 'court');
    const existing = await s.db.court.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Court', id);
    const row = await s.db.court.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.supportedFormatIds !== undefined
          ? {
              supportedFormats: {
                deleteMany: {},
                create: input.supportedFormatIds.map((formatId) => ({ formatId })),
              },
            }
          : {}),
      },
      include,
    });
    await s.audit.record({
      actor: actorOf(request),
      action: 'court.update',
      payload: { id, ...input },
      requestId: request.id,
    });
    return mapCourt(row);
  });

  app.delete('/api/courts/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    await s.db.court.delete({ where: { id } });
    await s.audit.record({
      actor: actorOf(request),
      action: 'court.delete',
      payload: { id },
      requestId: request.id,
    });
    return { ok: true };
  });
}
