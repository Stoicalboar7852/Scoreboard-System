import { type FastifyInstance } from 'fastify';
import { param } from '../lib/validate.js';
import { type Services } from '../services/index.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function registerExportRoutes(app: FastifyInstance, s: Services): void {
  app.get(
    '/api/export/sessions/:id.xlsx',
    { preHandler: [app.requireAdmin] },
    async (request, reply) => {
      const { filename, buffer } = await s.exporter.sessionWorkbook(param(request.params, 'id'));
      return reply
        .header('Content-Type', XLSX)
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(buffer);
    },
  );

  app.get(
    '/api/export/seasons/:id.xlsx',
    { preHandler: [app.requireAdmin] },
    async (request, reply) => {
      const { filename, buffer } = await s.exporter.seasonWorkbook(param(request.params, 'id'));
      return reply
        .header('Content-Type', XLSX)
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(buffer);
    },
  );

  app.get('/api/export/sessions/:id/print', { preHandler: [app.requireAdmin] }, async (request) => {
    return s.exporter.sessionPrintable(param(request.params, 'id'));
  });

  app.get(
    '/api/export/ladders/:competitionId.csv',
    { preHandler: [app.requireAdmin] },
    async (request, reply) => {
      const { filename, csv } = await s.exporter.ladderCsv(param(request.params, 'competitionId'));
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(csv);
    },
  );
}
