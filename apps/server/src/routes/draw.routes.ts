import { type FastifyInstance } from 'fastify';
import { drawGenerateInputSchema } from '@scoreboard/shared';
import { z } from 'zod';
import { RuleViolationError } from '../errors.js';
import { param, parse } from '../lib/validate.js';
import { mapSeason } from '../mappers/index.js';
import { type Services, actorOf } from '../services/index.js';

/** Draw generation (§8): preview returns the full report; commit regenerates with the same seed and writes. */
export function registerDrawRoutes(app: FastifyInstance, s: Services): void {
  app.post('/api/draw/preview', { preHandler: [app.requireAdmin] }, async (request) => {
    const input = parse(drawGenerateInputSchema, request.body, 'draw input');
    const seed = input.seed ?? Math.floor(Math.random() * 1_000_000);
    const drawInput = await s.draw.buildInput({ ...input, seed });
    const result = s.draw.generate(drawInput);
    if (!result.ok)
      return {
        ok: false,
        seed,
        conflicts: result.conflicts,
        warnings: result.warnings,
        stats: result.stats,
      };
    const competitions = new Map(drawInput.competitions.map((c) => [c.id, c.name]));
    return {
      ok: true,
      seed,
      warnings: result.warnings,
      stats: result.stats,
      sessions: result.sessions.map((sess) => ({
        date: sess.date,
        nightOfWeek: sess.nightOfWeek,
        weekNumber: sess.weekNumber,
        slotCount: sess.slotCount,
        slotLengthMinutes: sess.slotLengthMinutes,
        firstSlotTime: sess.firstSlotTime,
        fixtures: sess.fixtures.filter((f) => f.status === 'SCHEDULED').length,
        byes: sess.fixtures.filter((f) => f.status === 'BYE').length,
        competitions: [
          ...new Set(
            sess.fixtures.map((f) => competitions.get(f.competitionId) ?? f.competitionId),
          ),
        ],
      })),
    };
  });

  app.post('/api/draw/commit', { preHandler: [app.requireAdmin] }, async (request) => {
    const input = parse(
      drawGenerateInputSchema.extend({ seed: z.number().int().nonnegative() }),
      request.body,
      'draw input',
    );
    const drawInput = await s.draw.buildInput(input);
    const result = s.draw.generate(drawInput);
    if (!result.ok)
      throw new RuleViolationError(
        'The draw has conflicts; fix them and preview again',
        result.conflicts,
      );
    const summary = await s.draw.commit(input.seasonId, result, {
      replaceExisting: input.replaceExisting,
      onlyWeeks: input.onlyWeeks,
    });
    await s.audit.record({
      actor: actorOf(request),
      action: 'draw.commit',
      payload: {
        seasonId: input.seasonId,
        seed: input.seed,
        onlyWeeks: input.onlyWeeks ?? null,
        ...summary,
      },
      requestId: request.id,
    });
    return { ...summary, seed: input.seed, warnings: result.warnings };
  });

  /** Publishes the season and every one of its sessions (visible to controllers, kiosks and public pages). */
  app.post('/api/seasons/:id/publish', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    const input = parse(
      z.object({ published: z.boolean().default(true) }),
      request.body ?? {},
      'publish',
    );
    const [season] = await s.db.$transaction([
      s.db.season.update({
        where: { id },
        data: { status: input.published ? 'PUBLISHED' : 'DRAFT' },
      }),
      s.db.session.updateMany({ where: { seasonId: id }, data: { published: input.published } }),
    ]);
    await s.audit.record({
      actor: actorOf(request),
      action: 'season.publish',
      payload: { id, published: input.published },
      requestId: request.id,
    });
    return mapSeason(season);
  });
}
