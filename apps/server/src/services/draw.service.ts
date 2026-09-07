import { type PrismaClient } from '@prisma/client';
import {
  formatSlotMinutes,
  generateDraw,
  type DrawGenerateInput,
  type DrawInput,
  type DrawResult,
} from '@scoreboard/shared';
import { NotFoundError, RuleViolationError } from '../errors.js';
import { type ClashService } from './clash.service.js';
import { type LadderService } from './ladder.service.js';

export interface DrawCommitSummary {
  sessionsCreated: number;
  fixturesCreated: number;
  sessionsReplaced: number;
}

/** Builds generator input from the database and commits a generated draw transactionally. */
export class DrawService {
  constructor(
    private readonly db: PrismaClient,
    private readonly clashes: ClashService,
    private readonly ladders: LadderService,
  ) {}

  async buildInput(input: DrawGenerateInput): Promise<DrawInput> {
    const season = await this.db.season.findUnique({
      where: { id: input.seasonId },
      include: { competitions: { include: { teams: true } } },
    });
    if (!season) throw new NotFoundError('Season', input.seasonId);
    const [courts, formats, clashes] = await Promise.all([
      this.db.court.findMany({ where: { active: true }, include: { supportedFormats: true } }),
      this.db.gameFormat.findMany(),
      this.clashes.pairs(),
    ]);
    return {
      weeks: input.weeks ?? season.regularWeeks,
      startDate: season.startDate,
      skippedDates: season.skippedDates,
      competitions: season.competitions.map((c) => ({
        id: c.id,
        name: c.name,
        nightOfWeek: c.nightOfWeek,
        formatId: c.formatId,
        teamIds: c.teams.map((t) => t.id),
      })),
      courts: courts.map((c) => ({
        id: c.id,
        name: c.name,
        supportedFormatIds: c.supportedFormats.map((f) => f.formatId),
      })),
      formats: formats.map((f) => ({
        id: f.id,
        name: f.name,
        halfSeconds: f.halfSeconds,
        halfTimeSeconds: f.halfTimeSeconds,
        betweenGamesSeconds: f.betweenGamesSeconds,
      })),
      nights: input.nights,
      clashes: clashes.map((c) => ({ teamAId: c.teamAId, teamBId: c.teamBId })),
      seed: input.seed,
    };
  }

  generate(drawInput: DrawInput): DrawResult {
    return generateDraw(drawInput);
  }

  /**
   * Writes generated sessions and fixtures. Existing regular-season sessions for the same
   * dates are replaced only when `replaceExisting` is set (and none of them is live).
   */
  async commit(
    seasonId: string,
    result: Extract<DrawResult, { ok: true }>,
    options: { replaceExisting: boolean; onlyWeeks?: number[] },
  ): Promise<DrawCommitSummary> {
    const season = await this.db.season.findUnique({
      where: { id: seasonId },
      include: { competitions: true },
    });
    if (!season) throw new NotFoundError('Season', seasonId);
    const formats = await this.db.gameFormat.findMany();
    const formatById = new Map(formats.map((f) => [f.id, f]));
    const competitionFormat = new Map(season.competitions.map((c) => [c.id, c.formatId]));
    const sessions = options.onlyWeeks
      ? result.sessions.filter((s) => options.onlyWeeks?.includes(s.weekNumber))
      : result.sessions;

    return this.db.$transaction(async (tx) => {
      let sessionsCreated = 0;
      let fixturesCreated = 0;
      let sessionsReplaced = 0;
      for (const drawSession of sessions) {
        const existing = await tx.session.findFirst({
          where: { seasonId, date: drawSession.date },
        });
        let sessionId: string;
        if (existing) {
          if (!options.replaceExisting) {
            throw new RuleViolationError(
              `A session already exists for ${drawSession.date}; choose "replace existing" to overwrite it`,
            );
          }
          if (existing.status === 'LIVE')
            throw new RuleViolationError(
              `Session ${drawSession.date} is live and cannot be replaced`,
            );
          await tx.fixture.deleteMany({ where: { sessionId: existing.id, stage: 'REGULAR' } });
          await tx.session.update({
            where: { id: existing.id },
            data: {
              slotCount: drawSession.slotCount,
              slotLengthMinutes: drawSession.slotLengthMinutes,
              firstSlotTime: drawSession.firstSlotTime,
              linkShorterToLonger: drawSession.linkShorterToLonger,
            },
          });
          sessionId = existing.id;
          sessionsReplaced += 1;
        } else {
          const created = await tx.session.create({
            data: {
              seasonId,
              date: drawSession.date,
              nightOfWeek: drawSession.nightOfWeek,
              firstSlotTime: drawSession.firstSlotTime,
              slotLengthMinutes: drawSession.slotLengthMinutes,
              slotCount: drawSession.slotCount,
              linkShorterToLonger: drawSession.linkShorterToLonger,
            },
          });
          sessionId = created.id;
          sessionsCreated += 1;
        }
        await tx.fixture.createMany({
          data: drawSession.fixtures.map((f) => ({
            seasonId,
            competitionId: f.competitionId,
            sessionId,
            roundNumber: f.roundNumber,
            slotIndex: f.slotIndex,
            courtId: f.courtId,
            homeTeamId: f.homeTeamId,
            awayTeamId: f.awayTeamId,
            status: f.status,
          })),
        });
        fixturesCreated += drawSession.fixtures.length;
      }
      for (const c of season.competitions) this.ladders.invalidate(c.id);
      // Sanity: every competition's format must have a slot length no longer than its session's.
      for (const drawSession of sessions) {
        for (const f of drawSession.fixtures) {
          const format = formatById.get(competitionFormat.get(f.competitionId) ?? '');
          if (format && formatSlotMinutes(format) > drawSession.slotLengthMinutes) {
            throw new RuleViolationError(
              `Slot length ${drawSession.slotLengthMinutes} min is shorter than the ${format.name} game`,
            );
          }
        }
      }
      return { sessionsCreated, fixturesCreated, sessionsReplaced };
    });
  }
}
