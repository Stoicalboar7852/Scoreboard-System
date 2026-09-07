import { type FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import {
  fixtureInputSchema,
  fixtureUpdateSchema,
  listQuerySchema,
  resultInputSchema,
} from '@scoreboard/shared';
import { RuleViolationError } from '../errors.js';
import { param, parse } from '../lib/validate.js';
import { mapFixture } from '../mappers/index.js';
import { type Services, actorOf } from '../services/index.js';
import { fixtureInclude, mapFixtureWithNames } from '../services/sessions.service.js';

export function registerFixtureRoutes(app: FastifyInstance, s: Services): void {
  app.get('/api/fixtures', { preHandler: [app.requireAdmin] }, async (request) => {
    const q = parse(listQuerySchema, request.query, 'query');
    const rows = await s.db.fixture.findMany({
      where: {
        ...(q.competitionId ? { competitionId: q.competitionId } : {}),
        ...(q.seasonId ? { seasonId: q.seasonId } : {}),
        ...(q.sessionId ? { sessionId: q.sessionId } : {}),
        ...(q.round !== undefined ? { roundNumber: q.round } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.from || q.to
          ? {
              session: {
                date: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) },
              },
            }
          : {}),
      },
      include: { ...fixtureInclude, session: true },
      orderBy: [{ roundNumber: 'asc' }, { slotIndex: 'asc' }],
    });
    return rows.map((r) => ({ ...mapFixtureWithNames(r), sessionDate: r.session?.date ?? null }));
  });

  app.post('/api/fixtures', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const input = parse(fixtureInputSchema, request.body, 'fixture');
    const row = await s.db.fixture.create({
      data: {
        ...input,
        homeRef: input.homeRef === null ? Prisma.DbNull : input.homeRef,
        awayRef: input.awayRef === null ? Prisma.DbNull : input.awayRef,
      },
      include: fixtureInclude,
    });
    s.ladders.invalidate(row.competitionId);
    await s.audit.record({
      actor: actorOf(request),
      action: 'fixture.create',
      payload: { id: row.id },
      requestId: request.id,
    });
    return reply.status(201).send(mapFixtureWithNames(row));
  });

  app.put('/api/fixtures/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    const input = parse(fixtureUpdateSchema, request.body, 'fixture');
    const existing = await s.db.fixture.findUniqueOrThrow({ where: { id } });
    if (
      existing.status === 'LIVE' &&
      (input.homeTeamId !== undefined || input.awayTeamId !== undefined)
    ) {
      throw new RuleViolationError('Teams cannot change while the game is live');
    }
    const row = await s.db.fixture.update({ where: { id }, data: input, include: fixtureInclude });
    s.ladders.invalidate(existing.competitionId);
    s.ladders.invalidate(row.competitionId);
    await s.audit.record({
      actor: actorOf(request),
      action: 'fixture.update',
      payload: { id, ...input },
      requestId: request.id,
    });
    return mapFixtureWithNames(row);
  });

  app.put('/api/fixtures/:id/result', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    const input = parse(resultInputSchema, request.body, 'result');
    const before = await s.fixtures.get(id);
    const fixture = await s.fixtures.setResult(id, input);
    await s.audit.record({
      actor: actorOf(request),
      action: 'result.edit',
      payload: {
        fixtureId: id,
        before: {
          homeScore: before.homeScore,
          awayScore: before.awayScore,
          status: before.status,
          forfeitBy: before.forfeitBy,
        },
        after: {
          homeScore: fixture.homeScore,
          awayScore: fixture.awayScore,
          status: fixture.status,
          forfeitBy: fixture.forfeitBy,
          resultNotes: fixture.resultNotes,
        },
      },
      requestId: request.id,
    });
    return fixture;
  });

  app.delete('/api/fixtures/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = param(request.params, 'id');
    const existing = await s.db.fixture.findUniqueOrThrow({ where: { id } });
    if (existing.status === 'LIVE')
      throw new RuleViolationError('End the game before deleting the fixture');
    await s.db.fixture.delete({ where: { id } });
    s.ladders.invalidate(existing.competitionId);
    await s.audit.record({
      actor: actorOf(request),
      action: 'fixture.delete',
      payload: { id, fixture: mapFixture(existing) },
      requestId: request.id,
    });
    return { ok: true };
  });
}
