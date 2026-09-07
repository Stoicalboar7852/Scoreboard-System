import { type FastifyInstance } from 'fastify';
import { finalsGenerateInputSchema } from '@scoreboard/shared';
import { param, parse } from '../lib/validate.js';
import { type Services, actorOf } from '../services/index.js';

export function registerFinalsRoutes(app: FastifyInstance, s: Services): void {
  app.get('/api/finals/:competitionId', { preHandler: [app.requireAdmin] }, async (request) =>
    s.finals.status(param(request.params, 'competitionId')),
  );

  app.post('/api/finals/generate', { preHandler: [app.requireAdmin] }, async (request) => {
    const input = parse(finalsGenerateInputSchema, request.body, 'finals input');
    const result = await s.finals.generate(input, actorOf(request));
    s.ladders.invalidate(input.competitionId);
    return result;
  });

  app.post(
    '/api/finals/:competitionId/unlock',
    { preHandler: [app.requireAdmin] },
    async (request) => {
      const competitionId = param(request.params, 'competitionId');
      await s.finals.unlock(competitionId);
      await s.audit.record({
        actor: actorOf(request),
        action: 'finals.unlock',
        payload: { competitionId },
        requestId: request.id,
      });
      return { ok: true };
    },
  );
}
