import { type FastifyInstance } from 'fastify';
import { adjustmentInputSchema } from '@scoreboard/shared';
import { z } from 'zod';
import { param, parse } from '../lib/validate.js';
import { mapAdjustment } from '../mappers/index.js';
import { type Services, actorOf } from '../services/index.js';

export function registerAdjustmentRoutes(app: FastifyInstance, s: Services): void {
  app.get('/api/adjustments', { preHandler: [app.requireAdmin] }, async (request) => {
    const q = parse(
      z.object({ competitionId: z.string().uuid().optional() }),
      request.query,
      'query',
    );
    const rows = await s.db.ladderAdjustment.findMany({
      where: q.competitionId ? { competitionId: q.competitionId } : undefined,
      include: { team: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({ ...mapAdjustment(r), teamName: r.team.name }));
  });

  app.post('/api/adjustments', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const input = parse(adjustmentInputSchema, request.body, 'adjustment');
    const row = await s.db.ladderAdjustment.create({
      data: { ...input, createdBy: actorOf(request) },
      include: { team: true },
    });
    s.ladders.invalidate(input.competitionId);
    await s.audit.record({
      actor: actorOf(request),
      action: 'ladder.adjust',
      payload: { id: row.id, ...input },
      requestId: request.id,
    });
    return reply.status(201).send({ ...mapAdjustment(row), teamName: row.team.name });
  });

  app.delete('/api/adjustments/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    const row = await s.db.ladderAdjustment.delete({ where: { id } });
    s.ladders.invalidate(row.competitionId);
    await s.audit.record({
      actor: actorOf(request),
      action: 'ladder.adjustmentRemoved',
      payload: mapAdjustment(row),
      requestId: request.id,
    });
    return { ok: true };
  });
}
