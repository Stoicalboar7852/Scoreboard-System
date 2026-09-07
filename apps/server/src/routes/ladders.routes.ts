import { type FastifyInstance } from 'fastify';
import { param } from '../lib/validate.js';
import { type Services } from '../services/index.js';

export function registerLadderRoutes(app: FastifyInstance, s: Services): void {
  app.get('/api/ladders/:competitionId', { preHandler: [app.requireAdmin] }, async (request) => {
    return s.ladders.get(param(request.params, 'competitionId'));
  });
}
