import { type PrismaClient } from '@prisma/client';
import { computeLadder, type LadderRow } from '@scoreboard/shared';
import { NotFoundError } from '../errors.js';
import { parseLadderRule } from '../mappers/index.js';

export interface LadderResult {
  competitionId: string;
  competitionName: string;
  computedAtMs: number;
  rows: LadderRow[];
}

/** Computes ladders on demand and caches them per competition until invalidated. */
export class LadderService {
  private readonly cache = new Map<string, LadderResult>();

  constructor(private readonly db: PrismaClient) {}

  invalidate(competitionId: string | null | undefined): void {
    if (competitionId) this.cache.delete(competitionId);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  async get(competitionId: string): Promise<LadderResult> {
    const cached = this.cache.get(competitionId);
    if (cached) return cached;
    const competition = await this.db.competition.findUnique({
      where: { id: competitionId },
      include: { teams: true, adjustments: true },
    });
    if (!competition) throw new NotFoundError('Competition', competitionId);
    const fixtures = await this.db.fixture.findMany({
      where: { competitionId, status: { in: ['COMPLETED', 'FORFEIT', 'BYE'] } },
    });
    const rows = computeLadder({
      teams: competition.teams.map((t) => ({ id: t.id, name: t.name })),
      fixtures: fixtures.map((f) => ({
        id: f.id,
        homeTeamId: f.homeTeamId,
        awayTeamId: f.awayTeamId,
        homeScore: f.homeScore,
        awayScore: f.awayScore,
        status: f.status,
        stage: f.stage,
        forfeitBy: f.forfeitBy,
      })),
      rule: parseLadderRule(competition.ladderRule),
      adjustments: competition.adjustments.map((a) => ({
        teamId: a.teamId,
        pointsDelta: a.pointsDelta,
      })),
    });
    const result: LadderResult = {
      competitionId,
      competitionName: competition.name,
      computedAtMs: Date.now(),
      rows,
    };
    this.cache.set(competitionId, result);
    return result;
  }
}
