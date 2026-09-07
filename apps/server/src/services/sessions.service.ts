import { type Prisma, type PrismaClient } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import {
  formatSlotMinutes,
  validateNight,
  type Fixture,
  type Session,
  type SessionGridSave,
  type ValidationIssue,
} from '@scoreboard/shared';
import { NotFoundError, RuleViolationError } from '../errors.js';
import { mapFixture, mapSession } from '../mappers/index.js';
import { type ClashService } from './clash.service.js';
import { type LadderService } from './ladder.service.js';

export interface FixtureWithNames extends Fixture {
  competitionName: string | null;
  formatId: string | null;
  formatName: string | null;
  courtName: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
}

const fixtureInclude = {
  competition: { include: { format: true } },
  court: true,
  homeTeam: true,
  awayTeam: true,
} as const;

type FixtureRow = Prisma.FixtureGetPayload<{ include: typeof fixtureInclude }>;

export function mapFixtureWithNames(row: FixtureRow): FixtureWithNames {
  return {
    ...mapFixture(row),
    competitionName: row.competition?.name ?? null,
    formatId: row.competition?.formatId ?? null,
    formatName: row.competition?.format.name ?? null,
    courtName: row.court?.name ?? null,
    homeTeamName: row.homeTeam?.name ?? row.homeName ?? null,
    awayTeamName: row.status === 'BYE' ? 'BYE' : (row.awayTeam?.name ?? row.awayName ?? null),
  };
}

export { fixtureInclude };

export class SessionsService {
  constructor(
    private readonly db: PrismaClient,
    private readonly clashes: ClashService,
    private readonly ladders: LadderService,
  ) {}

  /** Today's calendar date in the venue timezone. */
  todayIn(timezone: string, nowMs: number): string {
    return formatInTimeZone(new Date(nowMs), timezone, 'yyyy-MM-dd');
  }

  async detail(
    id: string,
  ): Promise<{ session: Session; fixtures: FixtureWithNames[]; issues: ValidationIssue[] }> {
    const row = await this.db.session.findUnique({ where: { id } });
    if (!row) throw new NotFoundError('Session', id);
    const fixtures = await this.db.fixture.findMany({
      where: { sessionId: id },
      include: fixtureInclude,
      orderBy: [{ slotIndex: 'asc' }, { createdAt: 'asc' }],
    });
    const issues = await this.validateRows(row, fixtures);
    return { session: mapSession(row), fixtures: fixtures.map(mapFixtureWithNames), issues };
  }

  async validate(id: string): Promise<ValidationIssue[]> {
    const row = await this.db.session.findUnique({ where: { id } });
    if (!row) throw new NotFoundError('Session', id);
    const fixtures = await this.db.fixture.findMany({
      where: { sessionId: id },
      include: fixtureInclude,
    });
    return this.validateRows(row, fixtures);
  }

  private async validateRows(
    session: { slotCount: number; linkShorterToLonger: boolean },
    fixtures: FixtureRow[],
  ): Promise<ValidationIssue[]> {
    const [courts, clashes] = await Promise.all([
      this.db.court.findMany({ include: { supportedFormats: true } }),
      this.clashes.pairs(),
    ]);
    return validateNight(
      fixtures.map((f) => ({
        id: f.id,
        competitionId: f.competitionId,
        formatId: f.competition?.formatId ?? null,
        slotIndex: f.slotIndex,
        courtId: f.courtId,
        homeTeamId: f.homeTeamId,
        awayTeamId: f.awayTeamId,
        status: f.status,
      })),
      {
        courts: courts.map((c) => ({
          id: c.id,
          supportedFormatIds: c.supportedFormats.map((x) => x.formatId),
        })),
        clashes,
        linkShorterToLonger: session.linkShorterToLonger,
        slotCount: session.slotCount > 0 ? session.slotCount : undefined,
      },
    );
  }

  /** Slot length in minutes for a set of competitions (longest format wins). */
  async slotLengthFor(competitionIds: string[]): Promise<number | null> {
    if (competitionIds.length === 0) return null;
    const comps = await this.db.competition.findMany({
      where: { id: { in: competitionIds } },
      include: { format: true },
    });
    if (comps.length === 0) return null;
    return Math.max(...comps.map((c) => formatSlotMinutes(c.format)));
  }

  /** Bulk-saves the grid editor in one transaction after validating the result. */
  async saveGrid(
    id: string,
    input: SessionGridSave,
    actor: string,
  ): Promise<{ session: Session; fixtures: FixtureWithNames[]; issues: ValidationIssue[] }> {
    const session = await this.db.session.findUnique({ where: { id } });
    if (!session) throw new NotFoundError('Session', id);
    if (session.status === 'LIVE')
      throw new RuleViolationError(
        'The session is live; use the live control page to change fixtures',
      );
    const compIds = [
      ...new Set(input.fixtures.map((f) => f.competitionId).filter((x): x is string => x !== null)),
    ];
    const comps = await this.db.competition.findMany({ where: { id: { in: compIds } } });
    const compById = new Map(comps.map((c) => [c.id, c]));

    await this.db.$transaction(async (tx) => {
      if (input.deleteFixtureIds.length) {
        await tx.fixture.deleteMany({
          where: {
            id: { in: input.deleteFixtureIds },
            sessionId: id,
            status: { in: ['SCHEDULED', 'BYE', 'CANCELLED'] },
          },
        });
      }
      await tx.session.update({ where: { id }, data: { slotCount: input.slotCount } });
      for (const f of input.fixtures) {
        const comp = f.competitionId ? compById.get(f.competitionId) : undefined;
        const data = {
          seasonId: comp?.seasonId ?? session.seasonId,
          competitionId: f.competitionId,
          sessionId: id,
          roundNumber: f.roundNumber,
          slotIndex: f.status === 'BYE' ? null : f.slotIndex,
          courtId: f.status === 'BYE' ? null : f.courtId,
          homeTeamId: f.homeTeamId,
          awayTeamId: f.status === 'BYE' ? null : f.awayTeamId,
          homeName: f.homeName,
          awayName: f.awayName,
          status: f.status,
        };
        if (f.id) {
          const existing = await tx.fixture.findUnique({ where: { id: f.id } });
          if (!existing || existing.sessionId !== id) throw new NotFoundError('Fixture', f.id);
          if (
            existing.status === 'LIVE' ||
            existing.status === 'COMPLETED' ||
            existing.status === 'FORFEIT'
          ) {
            // Only placement may change for played games.
            await tx.fixture.update({
              where: { id: f.id },
              data: { slotIndex: data.slotIndex, courtId: data.courtId },
            });
          } else {
            await tx.fixture.update({ where: { id: f.id }, data });
          }
        } else {
          await tx.fixture.create({ data });
        }
      }
      await tx.auditLog.create({
        data: {
          actor,
          action: 'session.saveGrid',
          payload: {
            sessionId: id,
            fixtures: input.fixtures.length,
            deleted: input.deleteFixtureIds.length,
          },
        },
      });
    });
    for (const c of compIds) this.ladders.invalidate(c);
    return this.detail(id);
  }
}
