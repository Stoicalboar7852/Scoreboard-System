/**
 * Demo venue seed (§14): 6 courts, Fours and Pairs formats, a Monday season with three
 * pairs competitions of 6 teams, a Wednesday season with a fours and a pairs competition
 * of 8 teams (two players in both), a generated draw, tonight's session, and the admin
 * user from the environment. Set SEED_RESET=true to wipe existing venue data first.
 */
import { formatInTimeZone } from 'date-fns-tz';
import {
  DEFAULT_FINALS_TEMPLATE,
  VENUE_POINTS_RULE,
  addDays,
  dayOfWeek,
  formatSlotMinutes,
} from '@scoreboard/shared';
import { loadConfig } from '../src/config.js';
import { createPrisma } from '../src/db/prisma.js';
import { AuthService, hashPassword } from '../src/services/auth.service.js';
import { ClashService } from '../src/services/clash.service.js';
import { DrawService } from '../src/services/draw.service.js';
import { LadderService } from '../src/services/ladder.service.js';

const TEAM_NAMES = [
  'Aces',
  'Blockers',
  'Crushers',
  'Diggers',
  'Eagles',
  'Falcons',
  'Giants',
  'Hawks',
  'Icons',
  'Jets',
  'Kings',
  'Lions',
];

function teamNames(prefix: string, n: number): string[] {
  return TEAM_NAMES.slice(0, n).map((name) => `${prefix} ${name}`);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createPrisma(config);
  const now = () => Date.now();
  const auth = new AuthService(db, now, config.SESSION_TTL_HOURS * 3_600_000);
  const ladders = new LadderService(db);
  const draw = new DrawService(db, new ClashService(db), ladders);

  try {
    const existing = await db.gameFormat.count();
    if (existing > 0) {
      if (process.env.SEED_RESET !== 'true') {
        console.log(
          'Venue data already exists; set SEED_RESET=true to wipe and reseed. Ensuring admin + settings only.',
        );
        await auth.ensureAdmin(config.ADMIN_EMAIL, config.ADMIN_PASSWORD);
        await ensureSettings();
        return;
      }
      console.log('SEED_RESET=true: wiping venue data');
      await db.$transaction([
        db.auditLog.deleteMany(),
        db.courtLiveState.deleteMany(),
        db.clock.deleteMany(),
        db.fixture.deleteMany(),
        db.session.deleteMany(),
        db.ladderAdjustment.deleteMany(),
        db.finalsSeed.deleteMany(),
        db.teamClashLink.deleteMany(),
        db.teamPlayer.deleteMany(),
        db.player.deleteMany(),
        db.team.deleteMany(),
        db.competition.deleteMany(),
        db.season.deleteMany(),
        db.deviceToken.deleteMany(),
        db.courtFormat.deleteMany(),
        db.court.deleteMany(),
        db.gameFormat.deleteMany(),
      ]);
    }

    async function ensureSettings(): Promise<void> {
      const settings = await db.settings.findUnique({ where: { id: 'singleton' } });
      if (!settings) {
        await db.settings.create({
          data: {
            id: 'singleton',
            venueName: config.VENUE_NAME,
            timezone: config.VENUE_TIMEZONE,
            controllerPinHash: await hashPassword(config.CONTROLLER_PIN),
          },
        });
      } else if (!settings.controllerPinHash) {
        await db.settings.update({
          where: { id: 'singleton' },
          data: { controllerPinHash: await hashPassword(config.CONTROLLER_PIN) },
        });
      }
    }

    await auth.ensureAdmin(config.ADMIN_EMAIL, config.ADMIN_PASSWORD);
    await ensureSettings();
    console.log(`Admin: ${config.ADMIN_EMAIL}`);

    const fours = await db.gameFormat.create({
      data: {
        name: 'Fours',
        halfSeconds: 1200,
        halfTimeSeconds: 60,
        betweenGamesSeconds: 60,
        timeoutSeconds: 60,
        colour: '#38BDF8',
        displayOrder: 0,
      },
    });
    const pairs = await db.gameFormat.create({
      data: {
        name: 'Pairs',
        halfSeconds: 840,
        halfTimeSeconds: 60,
        betweenGamesSeconds: 60,
        timeoutSeconds: 60,
        colour: '#A78BFA',
        displayOrder: 1,
      },
    });
    const courts = [];
    for (let i = 1; i <= 6; i++) {
      courts.push(
        await db.court.create({
          data: {
            name: `Court ${i}`,
            displayOrder: i,
            supportedFormats: { create: [{ formatId: fours.id }, { formatId: pairs.id }] },
          },
        }),
      );
    }
    console.log(`Formats: Fours, Pairs. Courts: ${courts.length}`);

    // Seasons start on the Monday of the current week in the venue timezone.
    const today = formatInTimeZone(new Date(), config.VENUE_TIMEZONE, 'yyyy-MM-dd');
    const monday = addDays(today, -((dayOfWeek(today) + 6) % 7));
    const weeks = 10;

    const mondaySeason = await db.season.create({
      data: {
        name: 'Monday Pairs Season',
        startDate: monday,
        regularWeeks: weeks,
        finalsTemplate: DEFAULT_FINALS_TEMPLATE,
        status: 'PUBLISHED',
      },
    });
    const mondayComps = [];
    for (const [i, grade] of ['A Grade Pairs', 'B Grade Pairs', 'C Grade Pairs'].entries()) {
      const comp = await db.competition.create({
        data: {
          seasonId: mondaySeason.id,
          name: grade,
          nightOfWeek: 1,
          formatId: pairs.id,
          ladderRule: VENUE_POINTS_RULE,
          displayOrder: i,
          published: true,
          teams: {
            create: teamNames(grade.split(' ')[0] as string, 6).map((name) => ({
              name,
              shortName: name.split(' ').pop() as string,
            })),
          },
        },
      });
      mondayComps.push(comp);
    }

    const wednesdaySeason = await db.season.create({
      data: {
        name: 'Wednesday Mixed Season',
        startDate: monday,
        regularWeeks: weeks,
        finalsTemplate: DEFAULT_FINALS_TEMPLATE,
        status: 'PUBLISHED',
      },
    });
    const wedFours = await db.competition.create({
      data: {
        seasonId: wednesdaySeason.id,
        name: 'C Grade Mixed Fours',
        nightOfWeek: 3,
        formatId: fours.id,
        ladderRule: VENUE_POINTS_RULE,
        displayOrder: 0,
        published: true,
        teams: {
          create: teamNames('Fours', 8).map((name) => ({
            name,
            shortName: name.split(' ').pop() as string,
          })),
        },
      },
      include: { teams: true },
    });
    const wedPairs = await db.competition.create({
      data: {
        seasonId: wednesdaySeason.id,
        name: 'B Grade Mixed Pairs',
        nightOfWeek: 3,
        formatId: pairs.id,
        ladderRule: VENUE_POINTS_RULE,
        displayOrder: 1,
        published: true,
        teams: {
          create: teamNames('Pairs', 8).map((name) => ({
            name,
            shortName: name.split(' ').pop() as string,
          })),
        },
      },
      include: { teams: true },
    });
    // Two players who play both fours and pairs on Wednesday → automatic clash constraints.
    await db.player.create({
      data: {
        name: 'Sam Rivera',
        teams: {
          create: [
            { teamId: (wedFours.teams[0] as { id: string }).id },
            { teamId: (wedPairs.teams[2] as { id: string }).id },
          ],
        },
      },
    });
    await db.player.create({
      data: {
        name: 'Jordan Lee',
        teams: {
          create: [
            { teamId: (wedFours.teams[4] as { id: string }).id },
            { teamId: (wedPairs.teams[6] as { id: string }).id },
          ],
        },
      },
    });
    console.log(
      `Seasons: ${mondaySeason.name} (3 competitions), ${wednesdaySeason.name} (2 competitions, 2 shared players)`,
    );

    const courtIds = courts.map((c) => c.id);
    for (const [season, nights] of [
      [
        mondaySeason,
        [
          {
            nightOfWeek: 1,
            courtIds,
            firstSlotTime: '18:30',
            linkShorterToLonger: false,
            extraSlots: 0,
          },
        ],
      ],
      [
        wednesdaySeason,
        [
          {
            nightOfWeek: 3,
            courtIds,
            firstSlotTime: '18:30',
            linkShorterToLonger: true,
            extraSlots: 0,
          },
        ],
      ],
    ] as const) {
      const input = await draw.buildInput({
        seasonId: season.id,
        nights: [...nights],
        replaceExisting: false,
        seed: 2026,
      });
      const result = draw.generate(input);
      if (!result.ok) {
        console.error('Draw generation failed', result.conflicts);
        throw new Error('Seed draw generation failed');
      }
      const summary = await draw.commit(season.id, result, { replaceExisting: true });
      await db.session.updateMany({ where: { seasonId: season.id }, data: { published: true } });
      console.log(
        `Draw for ${season.name}: ${summary.sessionsCreated} sessions, ${summary.fixturesCreated} fixtures`,
      );
    }

    // Tonight's session: if today is Monday/Wednesday the generated one is used; otherwise
    // prepare a demo night today by copying the Wednesday week-1 fixtures (both formats, linked).
    const tonight = await db.session.findFirst({ where: { date: today } });
    if (!tonight) {
      const source = await db.session.findFirst({
        where: { seasonId: wednesdaySeason.id },
        orderBy: { date: 'asc' },
        include: { fixtures: true },
      });
      if (source) {
        const slotLength = Math.max(formatSlotMinutes(fours), formatSlotMinutes(pairs));
        const demo = await db.session.create({
          data: {
            seasonId: null,
            date: today,
            nightOfWeek: dayOfWeek(today),
            firstSlotTime: '18:30',
            slotLengthMinutes: slotLength,
            slotCount: source.slotCount,
            linkShorterToLonger: true,
            published: true,
          },
        });
        await db.fixture.createMany({
          data: source.fixtures.map((f) => ({
            seasonId: null,
            competitionId: f.competitionId,
            sessionId: demo.id,
            roundNumber: null,
            slotIndex: f.slotIndex,
            courtId: f.courtId,
            homeTeamId: f.homeTeamId,
            awayTeamId: f.awayTeamId,
            status: f.status,
          })),
        });
        console.log(
          `Demo session prepared for tonight (${today}) with ${source.fixtures.length} fixtures (results count on the Wednesday ladders for demo purposes).`,
        );
      }
    } else {
      console.log(`Tonight (${today}) already has a generated session.`);
    }
    console.log('Seed complete.');
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
