import { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '../errors.js';
import { param, parse } from '../lib/validate.js';
import { type Services, actorOf } from '../services/index.js';

const PNG_PREFIX = 'data:image/png;base64,';
const PNG_SIGNATURE = 0x89504e47;

const facebookPostSchema = z.object({
  /** PNG data URL produced by the admin ladder snapshot (≤ ~1.4 MB decoded within the 2 MB body limit). */
  imageDataUrl: z
    .string()
    .startsWith(PNG_PREFIX, 'imageDataUrl must be a PNG data URL')
    .max(1_900_000, 'Snapshot is too large'),
  caption: z.string().trim().max(2000).optional(),
});

/** Optional third-party integrations; every route is admin-only and feature-flagged. */
export function registerIntegrationRoutes(app: FastifyInstance, s: Services): void {
  app.get('/api/integrations', { preHandler: [app.requireAdmin] }, async () => ({
    facebook: s.facebook.status(),
  }));

  app.post(
    '/api/integrations/facebook/ladder/:competitionId',
    { preHandler: [app.requireAdmin], config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request) => {
      const competitionId = param(request.params, 'competitionId');
      const input = parse(facebookPostSchema, request.body, 'Facebook post');
      const competition = await s.db.competition.findUnique({
        where: { id: competitionId },
        select: { id: true, name: true },
      });
      if (!competition) throw new NotFoundError('Competition', competitionId);

      const png = Buffer.from(input.imageDataUrl.slice(PNG_PREFIX.length), 'base64');
      if (png.length < 8 || png.readUInt32BE(0) !== PNG_SIGNATURE)
        throw new ValidationError('imageDataUrl does not contain a PNG image');

      const settings = await s.settings.get();
      const publicUrl = `${s.config.APP_ORIGIN}/ladders/${competition.id}`;
      const caption =
        input.caption && input.caption.length > 0
          ? input.caption
          : `${competition.name} ladder — ${settings.venueName}\nLive ladders: ${publicUrl}`;

      const result = await s.facebook.postPhoto(png, caption);
      await s.audit.record({
        actor: actorOf(request),
        action: 'facebook.post',
        payload: { competitionId, postId: result.postId, bytes: png.length },
        requestId: request.id,
      });
      return result;
    },
  );
}
