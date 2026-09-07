import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, seedMiniVenue, type TestContext } from './helpers.js';

async function workbook(rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Fixtures');
  sheet.addRow([
    'Date',
    'Start Time or Slot',
    'Court',
    'Competition',
    'Home Team',
    'Away Team',
    'Round',
  ]);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

function multipart(
  fields: Record<string, string>,
  file: { name: string; buffer: Buffer },
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = '----scoreboardtest';
  const parts: Buffer[] = [];
  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
  );
  parts.push(file.buffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('Excel import and export', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('serves the template', async () => {
    const res = await ctx.asAdmin({ method: 'GET', url: '/api/import/template' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('fixtures-template.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    expect(wb.worksheets[0]?.getRow(1).values).toEqual([
      undefined,
      'Date',
      'Start Time or Slot',
      'Court',
      'Competition',
      'Home Team',
      'Away Team',
      'Round',
    ]);
  });

  it('rejects a sheet with deliberate errors row by row and refuses to commit it', async () => {
    const { season } = await seedMiniVenue(ctx.db);
    const session = await ctx.db.session.create({
      data: {
        seasonId: season.id,
        date: '2026-02-02',
        nightOfWeek: 1,
        firstSlotTime: '18:30',
        slotLengthMinutes: 30,
        slotCount: 2,
      },
    });
    const buffer = await workbook([
      ['2026-02-02', '18:30', 'Court 1', 'A Grade', 'Aces', 'Blockers', 1],
      ['2026-02-02', '18:30', 'Court 9', 'A Grade', 'Crushers', 'Diggers', 1],
      ['2026-02-02', '18:40', 'Court 2', 'Z Grade', 'Crushers', 'Nobody', 1],
      ['2026-02-02', '18:30', 'Court 1', 'A Grade', 'Crushers', 'Diggers', 1],
    ]);
    const req = multipart({ sessionId: session.id }, { name: 'fixtures.xlsx', buffer });
    const res = await ctx.asAdmin({
      method: 'POST',
      url: '/api/import/preview',
      payload: req.payload,
      headers: req.headers,
    });
    expect(res.statusCode).toBe(200);
    const preview = res.json();
    expect(preview.summary).toMatchObject({ total: 4, valid: 2, invalid: 2 });
    expect(preview.rows[1].errors.map((e: { code: string }) => e.code)).toEqual(['UNKNOWN_COURT']);
    expect(preview.rows[2].errors.map((e: { code: string }) => e.code).sort()).toEqual([
      'TIME_NOT_ON_SLOT',
      'UNKNOWN_COMPETITION',
    ]);
    expect(preview.issues.map((i: { code: string }) => i.code)).toContain('CELL_DOUBLE_BOOKED');

    const commit = await ctx.asAdmin({
      method: 'POST',
      url: '/api/import/commit',
      payload: { previewId: preview.previewId },
    });
    expect(commit.statusCode).toBe(422);
    expect(await ctx.db.fixture.count()).toBe(0);
  });

  it('imports a clean sheet in one transaction, creating missing teams when allowed', async () => {
    const { season, competition } = await seedMiniVenue(ctx.db);
    const session = await ctx.db.session.create({
      data: {
        seasonId: season.id,
        date: '2026-02-02',
        nightOfWeek: 1,
        firstSlotTime: '18:30',
        slotLengthMinutes: 30,
        slotCount: 1,
      },
    });
    const buffer = await workbook([
      ['', '18:30', 'Court 1', 'A Grade', 'Aces', 'Blockers', 1],
      ['', 'Slot 2', 'Court 2', 'A Grade', 'Crushers', 'Eagles', 1],
      ['', '', '', 'A Grade', 'Diggers', 'BYE', 1],
    ]);
    const strict = multipart({ sessionId: session.id }, { name: 'fixtures.xlsx', buffer });
    const strictRes = await ctx.asAdmin({
      method: 'POST',
      url: '/api/import/preview',
      payload: strict.payload,
      headers: strict.headers,
    });
    expect(strictRes.json().rows[1].errors[0].code).toBe('UNKNOWN_TEAM');

    const lenient = multipart(
      { sessionId: session.id, autoCreateTeams: 'true' },
      { name: 'fixtures.xlsx', buffer },
    );
    const res = await ctx.asAdmin({
      method: 'POST',
      url: '/api/import/preview',
      payload: lenient.payload,
      headers: lenient.headers,
    });
    const preview = res.json();
    expect(preview.summary).toMatchObject({
      total: 3,
      valid: 3,
      invalid: 0,
      teamsToCreate: 1,
      byes: 1,
    });
    expect(preview.issues).toEqual([]);

    const commit = await ctx.asAdmin({
      method: 'POST',
      url: '/api/import/commit',
      payload: { previewId: preview.previewId },
    });
    expect(commit.statusCode).toBe(200);
    expect(commit.json()).toMatchObject({
      fixturesCreated: 3,
      teamsCreated: 1,
      sessionsCreated: 0,
    });
    expect(await ctx.db.team.count({ where: { competitionId: competition.id } })).toBe(5);
    const fixtures = await ctx.db.fixture.findMany({
      where: { sessionId: session.id },
      orderBy: { slotIndex: 'asc' },
    });
    expect(fixtures.map((f) => f.status)).toEqual(
      expect.arrayContaining(['SCHEDULED', 'SCHEDULED', 'BYE']),
    );
    expect((await ctx.db.session.findUniqueOrThrow({ where: { id: session.id } })).slotCount).toBe(
      2,
    );

    const again = await ctx.asAdmin({
      method: 'POST',
      url: '/api/import/commit',
      payload: { previewId: preview.previewId },
    });
    expect(again.statusCode).toBe(404);

    const csv = Buffer.from(
      'Date,Start Time or Slot,Court,Competition,Home Team,Away Team,Round\n2026-02-09,1,Court 1,A Grade,Aces,Crushers,2\n',
    );
    const csvReq = multipart({}, { name: 'week2.csv', buffer: csv });
    const csvRes = await ctx.asAdmin({
      method: 'POST',
      url: '/api/import/preview',
      payload: csvReq.payload,
      headers: csvReq.headers,
    });
    expect(csvRes.statusCode).toBe(200);
    expect(csvRes.json().summary.valid).toBe(1);
    const csvCommit = await ctx.asAdmin({
      method: 'POST',
      url: '/api/import/commit',
      payload: { previewId: csvRes.json().previewId },
    });
    expect(csvCommit.json()).toMatchObject({ fixturesCreated: 1, sessionsCreated: 1 });

    const exportSession = await ctx.asAdmin({
      method: 'GET',
      url: `/api/export/sessions/${session.id}.xlsx`,
    });
    expect(exportSession.statusCode).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(exportSession.rawPayload as unknown as ArrayBuffer);
    expect(wb.worksheets[0]?.rowCount).toBe(4);
    const exportSeason = await ctx.asAdmin({
      method: 'GET',
      url: `/api/export/seasons/${season.id}.xlsx`,
    });
    expect(exportSeason.statusCode).toBe(200);
    const printable = await ctx.asAdmin({
      method: 'GET',
      url: `/api/export/sessions/${session.id}/print`,
    });
    expect(printable.json().rows).toHaveLength(3);
    expect(printable.json().rows[0]).toMatchObject({
      time: '18:30',
      court: 'Court 1',
      home: 'Aces',
      away: 'Blockers',
    });
  });

  it('rejects uploads without a file', async () => {
    const req = multipart({ autoCreateTeams: 'true' }, { name: 'x.xlsx', buffer: Buffer.alloc(0) });
    const res = await ctx.asAdmin({
      method: 'POST',
      url: '/api/import/preview',
      payload: req.payload,
      headers: req.headers,
    });
    expect([400, 422]).toContain(res.statusCode);
  });
});
