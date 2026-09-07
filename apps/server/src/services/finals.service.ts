import { type PrismaClient } from '@prisma/client';
import {
  dayOfWeek,
  resolveFinals,
  validateNight,
  type FinalsGenerateInput,
  type FinalsSeed,
  type FixtureStage,
  type ResolvedFinalsMatch,
  type ValidationIssue,
} from '@scoreboard/shared';
import { NotFoundError, RuleViolationError } from '../errors.js';
import { parseFinalsTemplate } from '../mappers/index.js';
import { type ClashService } from './clash.service.js';
import { type FixturesService } from './fixtures.service.js';
import { type LadderService } from './ladder.service.js';

const KNOWN_STAGES: ReadonlySet<string> = new Set(['SF1', 'SF2', 'PF', 'GF']);

export interface FinalsStatus {
  competitionId: string;
  competitionName: string;
  lockedAtMs: number | null;
  seeds: FinalsSeed[];
  matches: Array<
    ResolvedFinalsMatch & {
      fixtureId: string | null;
      status: string | null;
      homeScore: number;
      awayScore: number;
      date: string | null;
    }
  >;
}

export interface FinalsGenerateResult {
  seeds: FinalsSeed[];
  fixturesCreated: number;
  sessionsCreated: number;
  issues: ValidationIssue[];
}

/** Locks the ladder into seeds and creates finals fixtures from the season template (§8.4). */
export class FinalsService {
  constructor(
    private readonly db: PrismaClient,
    private readonly ladders: LadderService,
    private readonly clashes: ClashService,
    private readonly fixtures: FixturesService,
  ) {}

  private stageFor(key: string, isLastWeek: boolean): FixtureStage {
    if (KNOWN_STAGES.has(key)) return key as FixtureStage;
    return isLastWeek ? 'GF' : 'SF1';
  }

  async status(competitionId: string): Promise<FinalsStatus> {
    const competition = await this.db.competition.findUnique({
      where: { id: competitionId },
      include: { season: true },
    });
    if (!competition) throw new NotFoundError('Competition', competitionId);
    const seeds = await this.fixtures.loadSeeds(this.db, competitionId);
    const finals = await this.db.fixture.findMany({
      where: { competitionId, stage: { not: 'REGULAR' } },
      include: { session: true },
    });
    const template = parseFinalsTemplate(competition.season.finalsTemplate);
    const resolved = seeds.length
      ? resolveFinals(
          template,
          seeds,
          finals
            .filter((f) => f.finalsKey)
            .map((f) => ({
              key: f.finalsKey as string,
              homeTeamId: f.homeTeamId,
              awayTeamId: f.awayTeamId,
              homeScore: f.homeScore,
              awayScore: f.awayScore,
              status: f.status,
              forfeitBy: f.forfeitBy,
            })),
        )
      : [];
    return {
      competitionId,
      competitionName: competition.name,
      lockedAtMs: competition.ladderLockedAt?.getTime() ?? null,
      seeds,
      matches: resolved.map((m) => {
        const fixture = finals.find((f) => f.finalsKey === m.key);
        return {
          ...m,
          fixtureId: fixture?.id ?? null,
          status: fixture?.status ?? null,
          homeScore: fixture?.homeScore ?? 0,
          awayScore: fixture?.awayScore ?? 0,
          date: fixture?.session?.date ?? null,
        };
      }),
    };
  }

  /** Unlocks: deletes seeds and unplayed finals fixtures so the finals can be regenerated. */
  async unlock(competitionId: string): Promise<void> {
    const played = await this.db.fixture.count({
      where: {
        competitionId,
        stage: { not: 'REGULAR' },
        status: { in: ['LIVE', 'COMPLETED', 'FORFEIT'] },
      },
    });
    if (played > 0)
      throw new RuleViolationError(
        'Finals games have already been played; reopen or delete their results first',
      );
    await this.db.$transaction([
      this.db.fixture.deleteMany({ where: { competitionId, stage: { not: 'REGULAR' } } }),
      this.db.finalsSeed.deleteMany({ where: { competitionId } }),
      this.db.competition.update({ where: { id: competitionId }, data: { ladderLockedAt: null } }),
    ]);
  }

  async generate(input: FinalsGenerateInput, actor: string): Promise<FinalsGenerateResult> {
    const competition = await this.db.competition.findUnique({
      where: { id: input.competitionId },
      include: { season: true, teams: true, format: true },
    });
    if (!competition) throw new NotFoundError('Competition', input.competitionId);
    if (competition.ladderLockedAt)
      throw new RuleViolationError(
        'Finals have already been generated; unlock first to regenerate',
      );
    const template = parseFinalsTemplate(competition.season.finalsTemplate);
    if (input.nights.length < template.weeks.length) {
      throw new RuleViolationError(
        `The finals template has ${template.weeks.length} week(s); give a date for each`,
      );
    }
    const seedsNeeded = Math.max(
      0,
      ...template.weeks.flatMap((w) =>
        w.matches.flatMap((m) => [m.home, m.away].map((r) => ('seed' in r ? r.seed : 0))),
      ),
    );
    const ladder = await this.ladders.get(competition.id);
    if (ladder.rows.length < seedsNeeded)
      throw new RuleViolationError(
        `The template needs ${seedsNeeded} teams but the ladder has ${ladder.rows.length}`,
      );
    const seeds: FinalsSeed[] = ladder.rows
      .slice(0, seedsNeeded)
      .map((r) => ({ seed: r.position, teamId: r.teamId, teamName: r.teamName }));
    const resolved = resolveFinals(template, seeds, []);
    const [courts, clashes] = await Promise.all([
      this.db.court.findMany({ include: { supportedFormats: true } }),
      this.clashes.pairs(),
    ]);
    const slotLength = Math.ceil(
      (competition.format.halfSeconds * 2 +
        competition.format.halfTimeSeconds +
        competition.format.betweenGamesSeconds) /
        60,
    );

    return this.db.$transaction(async (tx) => {
      await tx.finalsSeed.createMany({
        data: seeds.map((s) => ({ competitionId: competition.id, teamId: s.teamId, seed: s.seed })),
      });
      let fixturesCreated = 0;
      let sessionsCreated = 0;
      const allIssues: ValidationIssue[] = [];

      for (const [weekIndex, week] of template.weeks.entries()) {
        const night =
          input.nights.find((n) => n.weekIndex === weekIndex) ?? input.nights[weekIndex];
        if (!night) throw new RuleViolationError(`No night given for finals week ${weekIndex + 1}`);
        let session = await tx.session.findFirst({
          where: { seasonId: competition.seasonId, date: night.date },
        });
        if (!session) {
          session = await tx.session.create({
            data: {
              seasonId: competition.seasonId,
              date: night.date,
              nightOfWeek: dayOfWeek(night.date),
              firstSlotTime: night.firstSlotTime,
              slotLengthMinutes: Math.max(slotLength, 1),
              slotCount: 0,
              linkShorterToLonger: false,
            },
          });
          sessionsCreated += 1;
        }
        const existing = await tx.fixture.findMany({
          where: { sessionId: session.id },
          include: { competition: true },
        });
        const placed: Array<{
          key: string;
          slotIndex: number;
          courtId: string;
          home: string | null;
          away: string | null;
        }> = [];
        const isLast = weekIndex === template.weeks.length - 1;
        for (const match of week.matches) {
          const m = resolved.find((r) => r.key === match.key) as ResolvedFinalsMatch;
          const slotIndex = night.startSlotIndex + match.slotOffset;
          let chosen: string | null = null;
          for (const courtId of night.courtIds) {
            const candidate = {
              id: `new:${match.key}`,
              competitionId: competition.id,
              formatId: competition.formatId,
              slotIndex,
              courtId,
              homeTeamId: m.home.teamId,
              awayTeamId: m.away.teamId,
              status: 'SCHEDULED' as const,
            };
            const others = [
              ...existing.map((f) => ({
                id: f.id,
                competitionId: f.competitionId,
                formatId: f.competition?.formatId ?? null,
                slotIndex: f.slotIndex,
                courtId: f.courtId,
                homeTeamId: f.homeTeamId,
                awayTeamId: f.awayTeamId,
                status: f.status,
              })),
              ...placed.map((p) => ({
                id: `new:${p.key}`,
                competitionId: competition.id,
                formatId: competition.formatId,
                slotIndex: p.slotIndex,
                courtId: p.courtId,
                homeTeamId: p.home,
                awayTeamId: p.away,
                status: 'SCHEDULED' as const,
              })),
            ];
            const issues = validateNight([...others, candidate], {
              courts: courts.map((c) => ({
                id: c.id,
                supportedFormatIds: c.supportedFormats.map((x) => x.formatId),
              })),
              clashes,
              linkShorterToLonger: session.linkShorterToLonger,
            }).filter((i) => i.fixtureIds.includes(candidate.id));
            if (issues.length === 0) {
              chosen = courtId;
              break;
            }
            if (courtId === night.courtIds[night.courtIds.length - 1]) allIssues.push(...issues);
          }
          if (!chosen)
            throw new RuleViolationError(
              `Could not place ${match.key} on ${night.date}: every court in slot ${slotIndex + 1} conflicts`,
              allIssues,
            );
          placed.push({
            key: match.key,
            slotIndex,
            courtId: chosen,
            home: m.home.teamId,
            away: m.away.teamId,
          });
          await tx.fixture.create({
            data: {
              seasonId: competition.seasonId,
              competitionId: competition.id,
              sessionId: session.id,
              roundNumber: null,
              slotIndex,
              courtId: chosen,
              homeTeamId: m.home.teamId,
              awayTeamId: m.away.teamId,
              homeName: m.home.label,
              awayName: m.away.label,
              stage: this.stageFor(match.key, isLast),
              finalsKey: match.key,
              homeRef: match.home as object,
              awayRef: match.away as object,
              status: 'SCHEDULED',
            },
          });
          fixturesCreated += 1;
        }
        const maxSlot = Math.max(...placed.map((p) => p.slotIndex), session.slotCount - 1);
        await tx.session.update({ where: { id: session.id }, data: { slotCount: maxSlot + 1 } });
      }
      await tx.competition.update({
        where: { id: competition.id },
        data: { ladderLockedAt: new Date() },
      });
      await tx.season.update({ where: { id: competition.seasonId }, data: { status: 'FINALS' } });
      await tx.auditLog.create({
        data: {
          actor,
          action: 'finals.generate',
          payload: {
            competitionId: competition.id,
            seeds: seeds.map((x) => ({ ...x })),
            fixturesCreated,
            sessionsCreated,
          } as object,
        },
      });
      return { seeds, fixturesCreated, sessionsCreated, issues: allIssues };
    });
  }
}
