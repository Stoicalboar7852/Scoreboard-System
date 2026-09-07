import { randomBytes } from 'node:crypto';
import ExcelJS from 'exceljs';
import { type Prisma, type PrismaClient } from '@prisma/client';
import {
  FIXTURE_TEMPLATE_HEADERS,
  parseFixtureRows,
  validateNight,
  type ImportContext,
  type ParsedFixtureRow,
  type RawRow,
  type ValidationIssue,
} from '@scoreboard/shared';
import { NotFoundError, RuleViolationError, ValidationError } from '../errors.js';
import { type Now } from '../lib/time.js';
import { type LadderService } from './ladder.service.js';

export interface ImportPreview {
  previewId: string;
  sessionId: string | null;
  autoCreateTeams: boolean;
  createdAtMs: number;
  rows: ParsedFixtureRow[];
  issues: ValidationIssue[];
  summary: { total: number; valid: number; invalid: number; teamsToCreate: number; byes: number };
}

export interface ImportCommitResult {
  sessionId: string | null;
  fixturesCreated: number;
  teamsCreated: number;
  sessionsCreated: number;
}

const PREVIEW_TTL_MS = 30 * 60_000;

/** Reads a workbook (xlsx or csv) into header-keyed rows. */
export async function readWorkbookRows(buffer: Buffer, filename: string): Promise<RawRow[]> {
  const workbook = new ExcelJS.Workbook();
  let sheet: ExcelJS.Worksheet | undefined;
  if (buffer.length === 0) throw new ValidationError('The uploaded file is empty');
  try {
    if (/\.csv$/i.test(filename)) {
      const { Readable } = await import('node:stream');
      sheet = await workbook.csv.read(Readable.from(buffer));
    } else {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
      sheet = workbook.worksheets[0];
    }
  } catch (err) {
    throw new ValidationError('Could not read the file. Upload an .xlsx workbook or a .csv file.', {
      cause: err instanceof Error ? err.message : String(err),
    });
  }
  if (!sheet) throw new ValidationError('The file has no worksheet');
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = String(cell.value ?? '').trim();
  });
  if (headers.filter(Boolean).length === 0)
    throw new ValidationError('The first row must contain column headers');
  const rows: RawRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const header = headers[col];
      if (!header) return;
      cells[header] = cell.value;
    });
    rows.push({ rowNumber, cells });
  });
  return rows;
}

/** Import preview / commit with an in-memory preview store (single-instance server). */
export class ImportService {
  private readonly previews = new Map<string, ImportPreview>();

  constructor(
    private readonly db: PrismaClient,
    private readonly ladders: LadderService,
    private readonly now: Now,
  ) {}

  private sweep(): void {
    const cutoff = this.now() - PREVIEW_TTL_MS;
    for (const [id, preview] of this.previews)
      if (preview.createdAtMs < cutoff) this.previews.delete(id);
  }

  async buildContext(sessionId: string | null, autoCreateTeams: boolean): Promise<ImportContext> {
    const [competitions, courts, session] = await Promise.all([
      this.db.competition.findMany({ include: { teams: true } }),
      this.db.court.findMany({ where: { active: true } }),
      sessionId ? this.db.session.findUnique({ where: { id: sessionId } }) : Promise.resolve(null),
    ]);
    if (sessionId && !session) throw new NotFoundError('Session', sessionId);
    return {
      competitions: competitions.map((c) => ({
        id: c.id,
        name: c.name,
        teams: c.teams.map((t) => ({ id: t.id, name: t.name })),
      })),
      courts: courts.map((c) => ({ id: c.id, name: c.name })),
      session: session
        ? {
            date: session.date,
            firstSlotTime: session.firstSlotTime,
            slotLengthMinutes: session.slotLengthMinutes,
          }
        : null,
      autoCreateTeams,
    };
  }

  async preview(
    rawRows: RawRow[],
    sessionId: string | null,
    autoCreateTeams: boolean,
  ): Promise<ImportPreview> {
    this.sweep();
    const ctx = await this.buildContext(sessionId, autoCreateTeams);
    const rows = parseFixtureRows(rawRows, ctx);
    const issues = await this.validateAgainstExisting(rows, sessionId, ctx);
    const teamsToCreate = new Set(
      rows.flatMap((r) =>
        r.value.createTeams.map((t) => `${r.value.competitionId}|${t.toLowerCase()}`),
      ),
    );
    const preview: ImportPreview = {
      previewId: randomBytes(12).toString('hex'),
      sessionId,
      autoCreateTeams,
      createdAtMs: this.now(),
      rows,
      issues,
      summary: {
        total: rows.length,
        valid: rows.filter((r) => r.ok).length,
        invalid: rows.filter((r) => !r.ok).length,
        teamsToCreate: teamsToCreate.size,
        byes: rows.filter((r) => r.value.isBye).length,
      },
    };
    this.previews.set(preview.previewId, preview);
    return preview;
  }

  /** Session-level checks (double booking, clashes) including fixtures already in the session. */
  private async validateAgainstExisting(
    rows: ParsedFixtureRow[],
    sessionId: string | null,
    ctx: ImportContext,
  ): Promise<ValidationIssue[]> {
    const byDate = new Map<string, ParsedFixtureRow[]>();
    for (const row of rows) {
      if (!row.ok || row.value.date === null) continue;
      byDate.set(row.value.date, [...(byDate.get(row.value.date) ?? []), row]);
    }
    const [courts, clashes, competitions] = await Promise.all([
      this.db.court.findMany({ include: { supportedFormats: true } }),
      this.db.teamClashLink.findMany(),
      this.db.competition.findMany(),
    ]);
    const formatOf = new Map(competitions.map((c) => [c.id, c.formatId]));
    const issues: ValidationIssue[] = [];
    for (const [date, dateRows] of byDate) {
      const session = sessionId
        ? await this.db.session.findUnique({
            where: { id: sessionId },
            include: { fixtures: true },
          })
        : await this.db.session.findFirst({ where: { date }, include: { fixtures: true } });
      const existing = (session?.fixtures ?? []).map((f) => ({
        id: `existing:${f.id}`,
        competitionId: f.competitionId,
        formatId: f.competitionId ? (formatOf.get(f.competitionId) ?? null) : null,
        slotIndex: f.slotIndex,
        courtId: f.courtId,
        homeTeamId: f.homeTeamId,
        awayTeamId: f.awayTeamId,
        status: f.status,
      }));
      const incoming = dateRows.map((r) => ({
        id: `row:${r.rowNumber}`,
        competitionId: r.value.competitionId,
        formatId: r.value.competitionId ? (formatOf.get(r.value.competitionId) ?? null) : null,
        slotIndex: r.value.slotIndex,
        courtId: r.value.courtId,
        homeTeamId:
          r.value.homeTeamId ??
          (r.value.homeTeamName
            ? `new:${r.value.competitionId}:${r.value.homeTeamName.toLowerCase()}`
            : null),
        awayTeamId: r.value.isBye
          ? null
          : (r.value.awayTeamId ??
            (r.value.awayTeamName
              ? `new:${r.value.competitionId}:${r.value.awayTeamName.toLowerCase()}`
              : null)),
        status: r.value.isBye ? ('BYE' as const) : ('SCHEDULED' as const),
      }));
      issues.push(
        ...validateNight([...existing, ...incoming], {
          courts: courts.map((c) => ({
            id: c.id,
            supportedFormatIds: c.supportedFormats.map((f) => f.formatId),
          })),
          clashes: clashes.map((c) => ({ teamAId: c.teamAId, teamBId: c.teamBId })),
          linkShorterToLonger: session?.linkShorterToLonger ?? ctx.session !== null,
        }).filter((issue) => issue.fixtureIds.some((id) => id.startsWith('row:'))),
      );
    }
    return issues;
  }

  getPreview(previewId: string): ImportPreview {
    this.sweep();
    const preview = this.previews.get(previewId);
    if (!preview) throw new NotFoundError('Import preview', previewId);
    return preview;
  }

  /** Commits a preview in one transaction: creates missing teams, sessions and fixtures. */
  async commit(previewId: string, actor: string): Promise<ImportCommitResult> {
    const preview = this.getPreview(previewId);
    if (preview.summary.invalid > 0) {
      throw new RuleViolationError(
        `${preview.summary.invalid} row(s) have errors; fix the spreadsheet and preview again`,
      );
    }
    if (preview.issues.some((i) => i.severity === 'ERROR')) {
      throw new RuleViolationError(
        'The preview has scheduling conflicts; resolve them before committing',
        preview.issues,
      );
    }
    const result = await this.db.$transaction(async (tx) => {
      let teamsCreated = 0;
      let sessionsCreated = 0;
      let fixturesCreated = 0;
      const createdTeams = new Map<string, string>();
      const ensureTeam = async (competitionId: string, name: string): Promise<string> => {
        const key = `${competitionId}|${name.toLowerCase()}`;
        const known = createdTeams.get(key);
        if (known) return known;
        const existing = await tx.team.findFirst({
          where: { competitionId, name: { equals: name, mode: 'insensitive' } },
        });
        if (existing) {
          createdTeams.set(key, existing.id);
          return existing.id;
        }
        const created = await tx.team.create({
          data: { competitionId, name, shortName: name.slice(0, 12) },
        });
        teamsCreated += 1;
        createdTeams.set(key, created.id);
        return created.id;
      };
      const sessionByDate = new Map<string, { id: string; seasonId: string | null }>();
      const ensureSession = async (
        date: string,
        competitionId: string,
      ): Promise<{ id: string; seasonId: string | null }> => {
        if (preview.sessionId) {
          const s = await tx.session.findUniqueOrThrow({ where: { id: preview.sessionId } });
          return { id: s.id, seasonId: s.seasonId };
        }
        const cached = sessionByDate.get(date);
        if (cached) return cached;
        const existing = await tx.session.findFirst({ where: { date } });
        if (existing) {
          sessionByDate.set(date, { id: existing.id, seasonId: existing.seasonId });
          return { id: existing.id, seasonId: existing.seasonId };
        }
        const competition = await tx.competition.findUniqueOrThrow({
          where: { id: competitionId },
          include: { format: true },
        });
        const created = await tx.session.create({
          data: {
            seasonId: competition.seasonId,
            date,
            nightOfWeek: new Date(`${date}T00:00:00Z`).getUTCDay(),
            firstSlotTime: '18:00',
            slotLengthMinutes: Math.ceil(
              (competition.format.halfSeconds * 2 +
                competition.format.halfTimeSeconds +
                competition.format.betweenGamesSeconds) /
                60,
            ),
            slotCount: 0,
          },
        });
        sessionsCreated += 1;
        sessionByDate.set(date, { id: created.id, seasonId: created.seasonId });
        return { id: created.id, seasonId: created.seasonId };
      };

      const touchedCompetitions = new Set<string>();
      const touchedSessions = new Set<string>();
      for (const row of preview.rows) {
        const v = row.value;
        if (!v.competitionId || !v.date) continue;
        const session = await ensureSession(v.date, v.competitionId);
        const homeTeamId = v.homeTeamId ?? (await ensureTeam(v.competitionId, v.homeTeamName));
        const awayTeamId = v.isBye
          ? null
          : (v.awayTeamId ?? (await ensureTeam(v.competitionId, v.awayTeamName)));
        const data: Prisma.FixtureUncheckedCreateInput = {
          seasonId: session.seasonId,
          competitionId: v.competitionId,
          sessionId: session.id,
          roundNumber: v.roundNumber,
          slotIndex: v.isBye ? null : v.slotIndex,
          courtId: v.isBye ? null : v.courtId,
          homeTeamId,
          awayTeamId,
          status: v.isBye ? 'BYE' : 'SCHEDULED',
        };
        await tx.fixture.create({ data });
        fixturesCreated += 1;
        touchedCompetitions.add(v.competitionId);
        touchedSessions.add(session.id);
      }
      // Grow slot counts to cover imported slots.
      for (const sessionId of touchedSessions) {
        const max = await tx.fixture.aggregate({ where: { sessionId }, _max: { slotIndex: true } });
        const needed = (max._max.slotIndex ?? -1) + 1;
        await tx.session.updateMany({
          where: { id: sessionId, slotCount: { lt: needed } },
          data: { slotCount: needed },
        });
      }
      await tx.auditLog.create({
        data: {
          actor,
          action: 'import.commit',
          payload: { previewId, fixturesCreated, teamsCreated, sessionsCreated },
        },
      });
      for (const c of touchedCompetitions) this.ladders.invalidate(c);
      return { sessionId: preview.sessionId, fixturesCreated, teamsCreated, sessionsCreated };
    });
    this.previews.delete(previewId);
    return result;
  }

  /** Builds the downloadable template workbook. */
  async buildTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Fixtures');
    sheet.addRow([...FIXTURE_TEMPLATE_HEADERS]);
    sheet.getRow(1).font = { bold: true };
    sheet.addRow(['2026-02-02', '18:30', 'Court 1', 'A Grade Pairs', 'Aces', 'Blockers', 1]);
    sheet.addRow(['2026-02-02', 'Slot 2', 'Court 2', 'A Grade Pairs', 'Crushers', 'Diggers', 1]);
    sheet.addRow(['2026-02-02', '', '', 'A Grade Pairs', 'Eagles', 'BYE', 1]);
    sheet.columns.forEach((col) => {
      col.width = 20;
    });
    const notes = workbook.addWorksheet('How to use');
    notes.addRow(['Column', 'Meaning']);
    notes.addRow([
      'Date',
      'YYYY-MM-DD or DD/MM/YYYY. Leave blank when importing into a specific session.',
    ]);
    notes.addRow([
      'Start Time or Slot',
      'A time such as 18:30 / 6:30 pm, or a slot number such as 2 or "Slot 2". Blank for byes.',
    ]);
    notes.addRow(['Court', 'Court name exactly as configured (case-insensitive). Blank for byes.']);
    notes.addRow(['Competition', 'Competition (grade) name exactly as configured.']);
    notes.addRow([
      'Home Team / Away Team',
      'Team names within that competition. Use BYE as the away team for a bye.',
    ]);
    notes.addRow(['Round', 'Optional round number.']);
    notes.getColumn(1).width = 24;
    notes.getColumn(2).width = 90;
    const out = await workbook.xlsx.writeBuffer();
    return Buffer.from(out as ArrayBuffer);
  }
}
