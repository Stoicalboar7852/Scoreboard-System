import { type FastifyInstance } from 'fastify';
import {
  dayOfWeek,
  sessionGridSaveSchema,
  sessionInputSchema,
  sessionUpdateSchema,
} from '@scoreboard/shared';
import { z } from 'zod';
import { param, parse } from '../lib/validate.js';
import { mapSession } from '../mappers/index.js';
import { type Services, actorOf } from '../services/index.js';
import { SessionsService } from '../services/sessions.service.js';

export function registerSessionRoutes(app: FastifyInstance, s: Services): void {
  const sessions = new SessionsService(s.db, s.clashes, s.ladders);

  app.get('/api/sessions', { preHandler: [app.requireAdmin] }, async (request) => {
    const query = parse(
      z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        seasonId: z.string().optional(),
      }),
      request.query,
      'query',
    );
    const rows = await s.db.session.findMany({
      where: {
        ...(query.seasonId ? { seasonId: query.seasonId } : {}),
        ...(query.from || query.to
          ? {
              date: {
                ...(query.from ? { gte: query.from } : {}),
                ...(query.to ? { lte: query.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: 'asc' },
      include: { _count: { select: { fixtures: true } } },
    });
    return rows.map((r) => ({ ...mapSession(r), fixtureCount: r._count.fixtures }));
  });

  app.get('/api/sessions/today', { preHandler: [app.requireAdminOrController] }, async () => {
    const settings = await s.settings.get();
    const today = sessions.todayIn(settings.timezone, s.now());
    const rows = await s.db.session.findMany({
      where: { date: today },
      orderBy: { firstSlotTime: 'asc' },
    });
    return { date: today, sessions: rows.map(mapSession) };
  });

  app.get('/api/sessions/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    return sessions.detail(param(request.params, 'id'));
  });

  app.get('/api/sessions/:id/validate', { preHandler: [app.requireAdmin] }, async (request) => {
    return { issues: await sessions.validate(param(request.params, 'id')) };
  });

  app.post('/api/sessions', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const input = parse(sessionInputSchema, request.body, 'session');
    const row = await s.db.session.create({
      data: { ...input, nightOfWeek: dayOfWeek(input.date) },
    });
    await s.audit.record({
      actor: actorOf(request),
      action: 'session.create',
      payload: { id: row.id, date: row.date },
      requestId: request.id,
    });
    return reply.status(201).send(mapSession(row));
  });

  app.put('/api/sessions/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    const input = parse(sessionUpdateSchema, request.body, 'session');
    const row = await s.db.session.update({
      where: { id },
      data: { ...input, ...(input.date ? { nightOfWeek: dayOfWeek(input.date) } : {}) },
    });
    await s.audit.record({
      actor: actorOf(request),
      action: 'session.update',
      payload: { id, ...input },
      requestId: request.id,
    });
    return mapSession(row);
  });

  app.put('/api/sessions/:id/grid', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    const input = parse(sessionGridSaveSchema, request.body, 'session grid');
    return sessions.saveGrid(id, input, actorOf(request));
  });

  app.post('/api/sessions/:id/publish', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    const input = parse(
      z.object({ published: z.boolean().default(true) }),
      request.body ?? {},
      'publish',
    );
    const row = await s.db.session.update({ where: { id }, data: { published: input.published } });
    await s.audit.record({
      actor: actorOf(request),
      action: 'session.publish',
      payload: { id, published: input.published },
      requestId: request.id,
    });
    return mapSession(row);
  });

  app.delete('/api/sessions/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    const existing = await s.db.session.findUniqueOrThrow({ where: { id } });
    if (existing.status === 'LIVE') {
      return {
        ok: false,
        error: { code: 'RULE_VIOLATION', message: 'End the night before deleting the session' },
      };
    }
    await s.db.fixture.deleteMany({ where: { sessionId: id } });
    await s.db.session.delete({ where: { id } });
    s.ladders.invalidateAll();
    await s.audit.record({
      actor: actorOf(request),
      action: 'session.delete',
      payload: { id },
      requestId: request.id,
    });
    return { ok: true };
  });
}
