import { slotIndexForTime } from '../time/format.js';

export const FIXTURE_TEMPLATE_HEADERS = [
  'Date',
  'Start Time or Slot',
  'Court',
  'Competition',
  'Home Team',
  'Away Team',
  'Round',
] as const;

export interface ImportContext {
  competitions: ReadonlyArray<{
    id: string;
    name: string;
    teams: ReadonlyArray<{ id: string; name: string }>;
  }>;
  courts: ReadonlyArray<{ id: string; name: string }>;
  /** The session being imported into; null when importing a whole season by date. */
  session: { date: string; firstSlotTime: string; slotLengthMinutes: number } | null;
  autoCreateTeams: boolean;
}

export interface RawRow {
  /** 1-based spreadsheet row number, for error messages. */
  rowNumber: number;
  /** Header → cell value as read from the sheet. */
  cells: Record<string, unknown>;
}

export type RowIssueCode =
  | 'MISSING'
  | 'INVALID_DATE'
  | 'DATE_NOT_IN_SESSION'
  | 'INVALID_TIME'
  | 'TIME_NOT_ON_SLOT'
  | 'TIME_WITHOUT_SESSION'
  | 'INVALID_SLOT'
  | 'UNKNOWN_COURT'
  | 'UNKNOWN_COMPETITION'
  | 'UNKNOWN_TEAM'
  | 'TEAM_WILL_BE_CREATED'
  | 'SAME_TEAM'
  | 'INVALID_ROUND';

export interface RowIssue {
  code: RowIssueCode;
  field: string;
  message: string;
}

export interface ParsedFixtureValue {
  date: string | null;
  slotIndex: number | null;
  startTime: string | null;
  courtId: string | null;
  courtName: string;
  competitionId: string | null;
  competitionName: string;
  homeTeamId: string | null;
  homeTeamName: string;
  awayTeamId: string | null;
  awayTeamName: string;
  roundNumber: number | null;
  isBye: boolean;
  /** Team names to create in this competition before committing (autoCreateTeams). */
  createTeams: string[];
}

export interface ParsedFixtureRow {
  rowNumber: number;
  ok: boolean;
  errors: RowIssue[];
  warnings: RowIssue[];
  value: ParsedFixtureValue;
}

export function normaliseHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

const HEADER_ALIASES: Record<string, string[]> = {
  date: ['date'],
  time: ['start time or slot', 'start time slot', 'start time', 'time', 'slot', 'time or slot'],
  court: ['court'],
  competition: ['competition', 'grade', 'division'],
  home: ['home team', 'home'],
  away: ['away team', 'away'],
  round: ['round', 'week'],
};

function readCell(cells: Record<string, unknown>, field: keyof typeof HEADER_ALIASES): unknown {
  const normalised = new Map<string, unknown>();
  for (const [key, value] of Object.entries(cells)) normalised.set(normaliseHeader(key), value);
  for (const alias of HEADER_ALIASES[field] ?? []) {
    if (normalised.has(alias)) return normalised.get(alias);
  }
  return undefined;
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? 'invalid date' : value.toISOString();
  if (typeof value === 'object' && value !== null && 'text' in value) {
    return String((value as { text: unknown }).text ?? '').trim();
  }
  if (typeof value === 'object' && value !== null && 'result' in value) {
    return String((value as { result: unknown }).result ?? '').trim();
  }
  return String(value).trim();
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/** Accepts YYYY-MM-DD, DD/MM/YYYY, a JS Date, or an Excel serial number. */
export function parseDateCell(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 1) return null;
    return new Date(EXCEL_EPOCH_MS + Math.floor(value) * 86_400_000).toISOString().slice(0, 10);
  }
  const text = asText(value);
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (match) {
    const [d, m, y] = [match[1], match[2], match[3]].map(Number);
    const date = new Date(Date.UTC(y as number, (m as number) - 1, d as number));
    if (date.getUTCMonth() !== (m as number) - 1) return null;
    return date.toISOString().slice(0, 10);
  }
  return null;
}

/** Returns { time } for a wall-clock value, { slot } for a slot number, or null. */
export function parseTimeOrSlotCell(value: unknown): { time: string } | { slot: number } | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return {
      time: `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`,
    };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 1) return { slot: value };
    if (value > 0 && value < 1) {
      const minutes = Math.round(value * 1440);
      return {
        time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
      };
    }
    return null;
  }
  const text = asText(value).toLowerCase();
  if (!text) return null;
  let match = /^(?:slot\s*)?(\d{1,2})$/.exec(text);
  if (match) return { slot: Number(match[1]) };
  match = /^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/.exec(text);
  if (match) {
    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const suffix = match[3];
    if (suffix === 'pm' && hours < 12) hours += 12;
    if (suffix === 'am' && hours === 12) hours = 0;
    if (hours > 23 || minutes > 59) return null;
    return { time: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` };
  }
  match = /^(\d{1,2})\s*(am|pm)$/.exec(text);
  if (match) {
    let hours = Number(match[1]);
    if (match[2] === 'pm' && hours < 12) hours += 12;
    if (match[2] === 'am' && hours === 12) hours = 0;
    return { time: `${String(hours).padStart(2, '0')}:00` };
  }
  return null;
}

function isEmptyRow(cells: Record<string, unknown>): boolean {
  return Object.values(cells).every((v) => asText(v) === '');
}

/** Validates spreadsheet rows against the venue's competitions, teams and courts. */
export function parseFixtureRows(rows: readonly RawRow[], ctx: ImportContext): ParsedFixtureRow[] {
  const courtsByName = new Map(ctx.courts.map((c) => [normaliseName(c.name), c]));
  const compsByName = new Map(ctx.competitions.map((c) => [normaliseName(c.name), c]));

  return rows
    .filter((row) => !isEmptyRow(row.cells))
    .map((row) => {
      const errors: RowIssue[] = [];
      const warnings: RowIssue[] = [];
      const error = (code: RowIssueCode, field: string, message: string) =>
        errors.push({ code, field, message });

      const dateRaw = readCell(row.cells, 'date');
      const timeRaw = readCell(row.cells, 'time');
      const courtName = asText(readCell(row.cells, 'court'));
      const competitionName = asText(readCell(row.cells, 'competition'));
      const homeTeamName = asText(readCell(row.cells, 'home'));
      const awayTeamName = asText(readCell(row.cells, 'away'));
      const roundRaw = readCell(row.cells, 'round');
      const isBye = normaliseName(awayTeamName) === 'bye';

      // Date
      let date: string | null = null;
      if (asText(dateRaw) === '') {
        if (ctx.session) date = ctx.session.date;
        else error('MISSING', 'date', 'Date is required');
      } else {
        date = parseDateCell(dateRaw);
        if (!date) error('INVALID_DATE', 'date', `Unrecognised date "${asText(dateRaw)}"`);
        else if (ctx.session && date !== ctx.session.date) {
          error(
            'DATE_NOT_IN_SESSION',
            'date',
            `Row is dated ${date} but the session is ${ctx.session.date}`,
          );
        }
      }

      // Time or slot
      let slotIndex: number | null = null;
      let startTime: string | null = null;
      if (!isBye) {
        if (asText(timeRaw) === '') {
          error('MISSING', 'time', 'Start time or slot is required');
        } else {
          const parsed = parseTimeOrSlotCell(timeRaw);
          if (!parsed)
            error('INVALID_TIME', 'time', `Unrecognised time or slot "${asText(timeRaw)}"`);
          else if ('slot' in parsed) slotIndex = parsed.slot - 1;
          else {
            startTime = parsed.time;
            if (!ctx.session) {
              error(
                'TIME_WITHOUT_SESSION',
                'time',
                'Use a slot number when importing without a session',
              );
            } else {
              slotIndex = slotIndexForTime(
                ctx.session.firstSlotTime,
                ctx.session.slotLengthMinutes,
                parsed.time,
              );
              if (slotIndex === null) {
                error(
                  'TIME_NOT_ON_SLOT',
                  'time',
                  `${parsed.time} does not fall on a slot boundary`,
                );
              }
            }
          }
        }
      }

      // Court
      let courtId: string | null = null;
      if (!isBye) {
        if (courtName === '') error('MISSING', 'court', 'Court is required');
        else {
          const court = courtsByName.get(normaliseName(courtName));
          if (!court) error('UNKNOWN_COURT', 'court', `Unknown court "${courtName}"`);
          else courtId = court.id;
        }
      }

      // Competition and teams
      let competitionId: string | null = null;
      let homeTeamId: string | null = null;
      let awayTeamId: string | null = null;
      const createTeams: string[] = [];
      if (competitionName === '') error('MISSING', 'competition', 'Competition is required');
      const competition = compsByName.get(normaliseName(competitionName));
      if (competitionName !== '' && !competition) {
        error('UNKNOWN_COMPETITION', 'competition', `Unknown competition "${competitionName}"`);
      }
      if (competition) {
        competitionId = competition.id;
        const teamsByName = new Map(competition.teams.map((t) => [normaliseName(t.name), t]));
        const resolveTeam = (name: string, field: string): string | null => {
          if (name === '') {
            error('MISSING', field, `${field === 'homeTeam' ? 'Home' : 'Away'} team is required`);
            return null;
          }
          const team = teamsByName.get(normaliseName(name));
          if (team) return team.id;
          if (ctx.autoCreateTeams) {
            if (!createTeams.some((n) => normaliseName(n) === normaliseName(name)))
              createTeams.push(name);
            warnings.push({
              code: 'TEAM_WILL_BE_CREATED',
              field,
              message: `Team "${name}" will be created in ${competition.name}`,
            });
            return null;
          }
          error('UNKNOWN_TEAM', field, `Unknown team "${name}" in ${competition.name}`);
          return null;
        };
        homeTeamId = resolveTeam(homeTeamName, 'homeTeam');
        if (!isBye) awayTeamId = resolveTeam(awayTeamName, 'awayTeam');
      } else {
        if (homeTeamName === '') error('MISSING', 'homeTeam', 'Home team is required');
        if (awayTeamName === '' && !isBye) error('MISSING', 'awayTeam', 'Away team is required');
      }
      if (
        !isBye &&
        homeTeamName !== '' &&
        normaliseName(homeTeamName) === normaliseName(awayTeamName)
      ) {
        error('SAME_TEAM', 'awayTeam', 'Home and away team are the same');
      }

      // Round
      let roundNumber: number | null = null;
      if (asText(roundRaw) !== '') {
        const n = Number(asText(roundRaw));
        if (!Number.isInteger(n) || n < 0)
          error('INVALID_ROUND', 'round', `Round must be a whole number`);
        else roundNumber = n;
      }

      return {
        rowNumber: row.rowNumber,
        ok: errors.length === 0,
        errors,
        warnings,
        value: {
          date,
          slotIndex,
          startTime,
          courtId,
          courtName,
          competitionId,
          competitionName,
          homeTeamId,
          homeTeamName,
          awayTeamId,
          awayTeamName: isBye ? 'BYE' : awayTeamName,
          roundNumber,
          isBye,
          createTeams,
        },
      };
    });
}
