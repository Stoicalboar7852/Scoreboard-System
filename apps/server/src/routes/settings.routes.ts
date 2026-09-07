import { type FastifyInstance } from 'fastify';
import { settingsUpdateSchema } from '@scoreboard/shared';
import { parse } from '../lib/validate.js';
import { type Services, actorOf } from '../services/index.js';

export function registerSettingsRoutes(app: FastifyInstance, s: Services): void {
  app.get('/api/settings', { preHandler: [app.requireAdmin] }, async () => s.settings.get());

  app.put('/api/settings', { preHandler: [app.requireAdmin] }, async (request) => {
    const input = parse(settingsUpdateSchema, request.body, 'settings');
    const settings = await s.settings.update(input);
    const { controllerPin: _pin, ...auditable } = input;
    await s.audit.record({
      actor: actorOf(request),
      action: 'settings.update',
      payload: { ...auditable, controllerPinChanged: input.controllerPin !== undefined },
      requestId: request.id,
    });
    return settings;
  });

  app.get('/api/audit', { preHandler: [app.requireAdmin] }, async (request) => {
    const query = request.query as { limit?: string; action?: string };
    const limit = Math.min(500, Math.max(1, Number(query.limit ?? 100) || 100));
    const rows = await s.db.auditLog.findMany({
      where: query.action ? { action: { startsWith: query.action } } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      actor: r.actor,
      deviceId: r.deviceId,
      action: r.action,
      payload: r.payload,
      requestId: r.requestId,
      createdAtMs: r.createdAt.getTime(),
    }));
  });
}
