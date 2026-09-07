import { type FastifyInstance } from 'fastify';
import { playerInputSchema, playerUpdateSchema } from '@scoreboard/shared';
import { param, parse } from '../lib/validate.js';
import { mapPlayer } from '../mappers/index.js';
import { type Services, actorOf } from '../services/index.js';

export function registerPlayerRoutes(app: FastifyInstance, s: Services): void {
  app.get('/api/players', { preHandler: [app.requireAdmin] }, async (request) => {
    const query = request.query as { teamId?: string; q?: string };
    const rows = await s.db.player.findMany({
      where: {
        ...(query.teamId ? { teams: { some: { teamId: query.teamId } } } : {}),
        ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
      include: { teams: true },
    });
    return rows.map(mapPlayer);
  });

  app.post('/api/players', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const input = parse(playerInputSchema, request.body, 'player');
    const row = await s.db.player.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        teams: { create: input.teamIds.map((teamId) => ({ teamId })) },
      },
      include: { teams: true },
    });
    await s.audit.record({
      actor: actorOf(request),
      action: 'player.create',
      payload: { id: row.id, name: row.name },
      requestId: request.id,
    });
    return reply.status(201).send(mapPlayer(row));
  });

  app.put('/api/players/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    const input = parse(playerUpdateSchema, request.body, 'player');
    const row = await s.db.player.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.teamIds !== undefined
          ? { teams: { deleteMany: {}, create: input.teamIds.map((teamId) => ({ teamId })) } }
          : {}),
      },
      include: { teams: true },
    });
    await s.audit.record({
      actor: actorOf(request),
      action: 'player.update',
      payload: { id, ...input },
      requestId: request.id,
    });
    return mapPlayer(row);
  });

  app.delete('/api/players/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    await s.db.player.delete({ where: { id } });
    await s.audit.record({
      actor: actorOf(request),
      action: 'player.delete',
      payload: { id },
      requestId: request.id,
    });
    return { ok: true };
  });
}
