import { type FastifyInstance } from 'fastify';
import { importCommitSchema } from '@scoreboard/shared';
import { z } from 'zod';
import { ValidationError } from '../errors.js';
import { parse } from '../lib/validate.js';
import { type Services, actorOf } from '../services/index.js';
import { readWorkbookRows } from '../services/import.service.js';

export function registerImportRoutes(app: FastifyInstance, s: Services): void {
  app.get('/api/import/template', { preHandler: [app.requireAdmin] }, async (_request, reply) => {
    const buffer = await s.importer.buildTemplate();
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', 'attachment; filename="fixtures-template.xlsx"')
      .send(buffer);
  });

  /** multipart/form-data: file (xlsx or csv), sessionId (optional), autoCreateTeams (optional "true"). */
  app.post('/api/import/preview', { preHandler: [app.requireAdmin] }, async (request) => {
    const parts = request.parts();
    let file: { buffer: Buffer; filename: string } | null = null;
    const fields: Record<string, string> = {};
    for await (const part of parts) {
      if (part.type === 'file') {
        file = { buffer: await part.toBuffer(), filename: part.filename };
      } else {
        fields[part.fieldname] = String(part.value);
      }
    }
    if (!file) throw new ValidationError('Upload a .xlsx or .csv file in the "file" field');
    const options = parse(
      z.object({
        sessionId: z.string().uuid().optional(),
        autoCreateTeams: z.enum(['true', 'false']).optional(),
      }),
      fields,
      'import options',
    );
    const rows = await readWorkbookRows(file.buffer, file.filename);
    const preview = await s.importer.preview(
      rows,
      options.sessionId ?? null,
      options.autoCreateTeams === 'true',
    );
    return preview;
  });

  app.post('/api/import/commit', { preHandler: [app.requireAdmin] }, async (request) => {
    const input = parse(importCommitSchema, request.body, 'import commit');
    const result = await s.importer.commit(input.previewId, actorOf(request));
    return result;
  });
}
