import { type FastifyInstance } from 'fastify';
import { mapCourt, mapFormat } from '../mappers/index.js';
import { type Services } from '../services/index.js';

/** Bootstrap data for a controller tablet (device-token authenticated). */
export function registerControllerRoutes(app: FastifyInstance, s: Services): void {
  app.get('/api/controller/bootstrap', { preHandler: [app.requireController] }, async (request) => {
    const [courts, formats, settings] = await Promise.all([
      s.db.court.findMany({
        where: { active: true },
        include: { supportedFormats: true },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      }),
      s.db.gameFormat.findMany({ orderBy: { displayOrder: 'asc' } }),
      s.settings.get(),
    ]);
    return {
      device: request.device,
      courts: courts.map(mapCourt),
      formats: formats.map(mapFormat),
      settings: {
        venueName: settings.venueName,
        timezone: settings.timezone,
        nextGameWindowMinutes: settings.nextGameWindowMinutes,
        defaultTimeoutSeconds: settings.defaultTimeoutSeconds,
        accentOverrides: settings.accentOverrides,
      },
    };
  });
}
