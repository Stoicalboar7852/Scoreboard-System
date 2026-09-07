import ExcelJS from 'exceljs';
import { type PrismaClient } from '@prisma/client';
import { formatTimeOfDay, nightName, slotStartMinutes } from '@scoreboard/shared';
import { NotFoundError } from '../errors.js';
import { type LadderService } from './ladder.service.js';

interface FixtureRowOut {
  date: string;
  time: string;
  slot: number | string;
  court: string;
  competition: string;
  home: string;
  away: string;
  round: number | string;
  status: string;
  score: string;
}

/** Excel / CSV exports for sessions, seasons and ladders. */
export class ExportService {
  constructor(
    private readonly db: PrismaClient,
    private readonly ladders: LadderService,
  ) {}

  private async sessionRows(sessionIds: string[]): Promise<FixtureRowOut[]> {
    const sessions = await this.db.session.findMany({
      where: { id: { in: sessionIds } },
      include: {
        fixtures: { include: { competition: true, court: true, homeTeam: true, awayTeam: true } },
      },
      orderBy: { date: 'asc' },
    });
    const rows: FixtureRowOut[] = [];
    for (const session of sessions) {
      const fixtures = session.fixtures
        .slice()
        .sort(
          (a, b) =>
            (a.slotIndex ?? 99) - (b.slotIndex ?? 99) ||
            (a.court?.displayOrder ?? 0) - (b.court?.displayOrder ?? 0),
        );
      for (const f of fixtures) {
        const time =
          f.slotIndex === null
            ? ''
            : formatTimeOfDay(
                slotStartMinutes(session.firstSlotTime, session.slotLengthMinutes, f.slotIndex),
              );
        rows.push({
          date: session.date,
          time,
          slot: f.slotIndex === null ? '' : f.slotIndex + 1,
          court: f.court?.name ?? '',
          competition: f.competition?.name ?? '',
          home: f.homeTeam?.name ?? f.homeName ?? '',
          away: f.status === 'BYE' ? 'BYE' : (f.awayTeam?.name ?? f.awayName ?? ''),
          round: f.roundNumber ?? '',
          status: f.status,
          score:
            f.status === 'COMPLETED' || f.status === 'FORFEIT'
              ? `${f.homeScore}-${f.awayScore}`
              : '',
        });
      }
    }
    return rows;
  }

  private async workbookFromRows(title: string, rows: FixtureRowOut[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(title.slice(0, 30));
    sheet.addRow([
      'Date',
      'Start Time',
      'Slot',
      'Court',
      'Competition',
      'Home Team',
      'Away Team',
      'Round',
      'Status',
      'Score',
    ]);
    sheet.getRow(1).font = { bold: true };
    for (const r of rows)
      sheet.addRow([
        r.date,
        r.time,
        r.slot,
        r.court,
        r.competition,
        r.home,
        r.away,
        r.round,
        r.status,
        r.score,
      ]);
    sheet.columns.forEach((col) => {
      col.width = 18;
    });
    const out = await workbook.xlsx.writeBuffer();
    return Buffer.from(out as ArrayBuffer);
  }

  async sessionWorkbook(sessionId: string): Promise<{ filename: string; buffer: Buffer }> {
    const session = await this.db.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError('Session', sessionId);
    const rows = await this.sessionRows([sessionId]);
    return {
      filename: `fixtures-${session.date}.xlsx`,
      buffer: await this.workbookFromRows(
        `${nightName(session.nightOfWeek)} ${session.date}`,
        rows,
      ),
    };
  }

  async seasonWorkbook(seasonId: string): Promise<{ filename: string; buffer: Buffer }> {
    const season = await this.db.season.findUnique({
      where: { id: seasonId },
      include: { sessions: true },
    });
    if (!season) throw new NotFoundError('Season', seasonId);
    const rows = await this.sessionRows(season.sessions.map((s) => s.id));
    const safe = season.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    return {
      filename: `season-${safe}.xlsx`,
      buffer: await this.workbookFromRows(season.name, rows),
    };
  }

  async sessionPrintable(sessionId: string) {
    const session = await this.db.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError('Session', sessionId);
    return { session, rows: await this.sessionRows([sessionId]) };
  }

  async ladderCsv(competitionId: string): Promise<{ filename: string; csv: string }> {
    const ladder = await this.ladders.get(competitionId);
    const header = [
      'Pos',
      'Team',
      'P',
      'W',
      'D',
      'L',
      'Byes',
      'Forfeits',
      'For',
      'Against',
      'Diff',
      '%',
      'Bonus',
      'Adj',
      'Points',
    ];
    const escape = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(',')];
    for (const r of ladder.rows) {
      lines.push(
        [
          r.position,
          r.teamName,
          r.played,
          r.won,
          r.drawn,
          r.lost,
          r.byes,
          r.forfeits,
          r.pointsFor,
          r.pointsAgainst,
          r.pointsDiff,
          r.percentage,
          r.bonusPoints,
          r.adjustments,
          r.ladderPoints,
        ]
          .map(escape)
          .join(','),
      );
    }
    const safe = ladder.competitionName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    return { filename: `ladder-${safe}.csv`, csv: `${lines.join('\n')}\n` };
  }
}
