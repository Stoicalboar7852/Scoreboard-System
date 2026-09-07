import { type Fixture as DbFixture, type Prisma, type PrismaClient } from '@prisma/client';
import {
  resolveFinals,
  type FinalsResultInput,
  type FinalsSeed,
  type Fixture,
  type ResultInput,
} from '@scoreboard/shared';
import { NotFoundError, RuleViolationError } from '../errors.js';
import { mapFixture, parseFinalsTemplate } from '../mappers/index.js';
import { type Now } from '../lib/time.js';
import { type LadderService } from './ladder.service.js';

export type Tx = Prisma.TransactionClient | PrismaClient;

/** Result editing, finalisation and finals placeholder resolution. */
export class FixturesService {
  constructor(
    private readonly db: PrismaClient,
    private readonly ladders: LadderService,
    private readonly now: Now,
  ) {}

  async get(id: string): Promise<Fixture> {
    const row = await this.db.fixture.findUnique({ where: { id } });
    if (!row) throw new NotFoundError('Fixture', id);
    return mapFixture(row);
  }

  /** Admin edits a result. Reopening (status SCHEDULED) clears the completion. */
  async setResult(id: string, input: ResultInput): Promise<Fixture> {
    const existing = await this.db.fixture.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Fixture', id);
    if (existing.status === 'BYE') throw new RuleViolationError('A bye has no result');
    const completed = input.status === 'COMPLETED' || input.status === 'FORFEIT';
    const row = await this.db.fixture.update({
      where: { id },
      data: {
        homeScore: input.homeScore,
        awayScore: input.awayScore,
        status: input.status,
        forfeitBy: input.status === 'FORFEIT' ? input.forfeitBy : null,
        resultNotes: input.resultNotes,
        completedAt: completed ? (existing.completedAt ?? new Date(this.now())) : null,
      },
    });
    this.ladders.invalidate(row.competitionId);
    if (row.competitionId && row.stage !== 'REGULAR')
      await this.resolveFinalsFor(row.competitionId);
    return mapFixture(row);
  }

  /** Finalises a live fixture with the given scores (called when Half 2 ends). */
  async finalise(
    tx: Tx,
    fixtureId: string,
    scores: { homeScore: number; awayScore: number },
  ): Promise<DbFixture | null> {
    const existing = await tx.fixture.findUnique({ where: { id: fixtureId } });
    if (!existing || existing.status !== 'LIVE') return null;
    const row = await tx.fixture.update({
      where: { id: fixtureId },
      data: { ...scores, status: 'COMPLETED', completedAt: new Date(this.now()) },
    });
    this.ladders.invalidate(row.competitionId);
    if (row.competitionId && row.stage !== 'REGULAR')
      await this.resolveFinalsFor(row.competitionId, tx);
    return row;
  }

  /**
   * Re-resolves finals placeholders for a competition from the locked ladder seeds and
   * completed finals results; updates team ids and display names on the finals fixtures.
   */
  async resolveFinalsFor(competitionId: string, tx: Tx = this.db): Promise<number> {
    const competition = await tx.competition.findUnique({
      where: { id: competitionId },
      include: { season: true, teams: true },
    });
    if (!competition) return 0;
    const finals = await tx.fixture.findMany({
      where: { competitionId, stage: { not: 'REGULAR' } },
    });
    if (finals.length === 0) return 0;
    const seeds = await this.loadSeeds(tx, competitionId);
    if (seeds.length === 0) return 0;
    const results: FinalsResultInput[] = finals
      .filter((f) => f.finalsKey)
      .map((f) => ({
        key: f.finalsKey as string,
        homeTeamId: f.homeTeamId,
        awayTeamId: f.awayTeamId,
        homeScore: f.homeScore,
        awayScore: f.awayScore,
        status: f.status,
        forfeitBy: f.forfeitBy,
      }));
    const resolved = resolveFinals(
      parseFinalsTemplate(competition.season.finalsTemplate),
      seeds,
      results,
    );
    let changed = 0;
    for (const match of resolved) {
      const fixture = finals.find((f) => f.finalsKey === match.key);
      if (!fixture) continue;
      const data: Prisma.FixtureUpdateInput = {};
      if (fixture.homeTeamId !== match.home.teamId) {
        data.homeTeam = match.home.teamId
          ? { connect: { id: match.home.teamId } }
          : { disconnect: true };
      }
      if (fixture.awayTeamId !== match.away.teamId) {
        data.awayTeam = match.away.teamId
          ? { connect: { id: match.away.teamId } }
          : { disconnect: true };
      }
      if (fixture.homeName !== match.home.label) data.homeName = match.home.label;
      if (fixture.awayName !== match.away.label) data.awayName = match.away.label;
      if (Object.keys(data).length === 0) continue;
      await tx.fixture.update({ where: { id: fixture.id }, data });
      changed += 1;
    }
    return changed;
  }

  /** Seeds frozen when finals were generated. */
  async loadSeeds(tx: Tx, competitionId: string): Promise<FinalsSeed[]> {
    const rows = await tx.finalsSeed.findMany({
      where: { competitionId },
      include: { team: true },
      orderBy: { seed: 'asc' },
    });
    return rows.map((r) => ({ seed: r.seed, teamId: r.teamId, teamName: r.team.name }));
  }
}
