import { type FastifyInstance } from 'fastify';
import { clashLinkInputSchema } from '@scoreboard/shared';
import { param, parse } from '../lib/validate.js';
import { mapClashLink } from '../mappers/index.js';
import { type Services, actorOf } from '../services/index.js';

export function registerClashLinkRoutes(app: FastifyInstance, s: Services): void {
  app.get('/api/clash-links', { preHandler: [app.requireAdmin] }, async () => {
    const rows = await s.db.teamClashLink.findMany({
      include: { teamA: true, teamB: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      ...mapClashLink(r),
      teamAName: r.teamA.name,
      teamBName: r.teamB.name,
    }));
  });

  /** All effective clash constraints: explicit links plus those derived from shared players. */
  app.get('/api/clash-links/effective', { preHandler: [app.requireAdmin] }, async () =>
    s.clashes.pairs(),
  );

  app.post('/api/clash-links', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const input = parse(clashLinkInputSchema, request.body, 'clash link');
    const [teamAId, teamBId] =
      input.teamAId < input.teamBId
        ? [input.teamAId, input.teamBId]
        : [input.teamBId, input.teamAId];
    const row = await s.db.teamClashLink.create({
      data: { teamAId, teamBId, reason: input.reason },
    });
    await s.audit.record({
      actor: actorOf(request),
      action: 'clashLink.create',
      payload: { id: row.id, teamAId, teamBId },
      requestId: request.id,
    });
    return reply.status(201).send(mapClashLink(row));
  });

  app.delete('/api/clash-links/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    await s.db.teamClashLink.delete({ where: { id } });
    await s.audit.record({
      actor: actorOf(request),
      action: 'clashLink.delete',
      payload: { id },
      requestId: request.id,
    });
    return { ok: true };
  });
}
