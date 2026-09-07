import type {
  AdjustmentInput,
  ClashLinkInput,
  Competition,
  CompetitionInput,
  Court,
  CourtInput,
  Fixture,
  FixtureInput,
  FixtureUpdate,
  GameFormat,
  GameFormatInput,
  LadderAdjustment,
  LadderRow,
  Player,
  PlayerInput,
  ResultInput,
  Season,
  SeasonInput,
  Session,
  SessionGridSave,
  SessionInput,
  Settings,
  SettingsUpdate,
  Team,
  TeamClashLink,
  TeamInput,
  ValidationIssue,
} from '@scoreboard/shared';
import { api } from './api.js';

export type Me =
  | { kind: 'admin'; user: { id: string; email: string; name: string } }
  | { kind: 'controller'; device: { deviceId: string; deviceName: string } }
  | { kind: 'anonymous' };

export interface SeasonWithCompetitions extends Season {
  competitions: Array<Competition & { ladderLockedAtMs: number | null }>;
  sessionDates?: Array<{
    id: string;
    date: string;
    nightOfWeek: number;
    status: string;
    published: boolean;
  }>;
}
export interface CompetitionWithTeams extends Competition {
  ladderLockedAtMs: number | null;
  teams: Team[];
}
export interface TeamWithPlayers extends Team {
  players: Array<{ id: string; name: string }>;
}
export interface PlayerWithTeams extends Player {
  teamIds: string[];
}
export interface ClashLinkWithNames extends TeamClashLink {
  teamAName: string;
  teamBName: string;
}
export interface EffectiveClash {
  teamAId: string;
  teamBId: string;
  source: 'LINK' | 'PLAYER';
  playerName?: string;
}
export interface FixtureWithNames extends Fixture {
  competitionName: string | null;
  formatId: string | null;
  formatName: string | null;
  courtName: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  sessionDate?: string | null;
}
export interface SessionListItem extends Session {
  fixtureCount: number;
}
export interface SessionDetail {
  session: Session;
  fixtures: FixtureWithNames[];
  issues: ValidationIssue[];
}
export interface DeviceRow {
  id: string;
  name: string;
  courtId: string | null;
  courtName: string | null;
  lastSeenAtMs: number | null;
  revokedAtMs: number | null;
  createdAtMs: number;
}
export interface AuditRow {
  id: string;
  actor: string;
  deviceId: string | null;
  action: string;
  payload: unknown;
  requestId: string | null;
  createdAtMs: number;
}
export interface DrawNightInput {
  nightOfWeek: number;
  courtIds: string[];
  firstSlotTime: string;
  linkShorterToLonger: boolean;
  extraSlots: number;
}
export interface DrawPreviewSession {
  date: string;
  nightOfWeek: number;
  weekNumber: number;
  slotCount: number;
  slotLengthMinutes: number;
  firstSlotTime: string;
  fixtures: number;
  byes: number;
  competitions: string[];
}
export interface DrawConflict {
  date: string;
  nightOfWeek: number;
  weekNumber: number;
  fixture: { competitionId: string; homeTeamId: string; awayTeamId: string | null };
  reason: string;
  suggestions: string[];
}
export type DrawPreview =
  | {
      ok: true;
      seed: number;
      warnings: string[];
      stats: { nightsPlanned: number; restarts: number; elapsedMs: number };
      sessions: DrawPreviewSession[];
    }
  | {
      ok: false;
      seed: number;
      warnings: string[];
      stats: { nightsPlanned: number; restarts: number; elapsedMs: number };
      conflicts: DrawConflict[];
    };
export interface DrawCommitResult {
  sessionsCreated: number;
  fixturesCreated: number;
  sessionsReplaced: number;
  seed: number;
  warnings: string[];
}
export interface FinalsNightInput {
  weekIndex: number;
  date: string;
  courtIds: string[];
  firstSlotTime: string;
  startSlotIndex: number;
}
export interface FinalsStatus {
  competitionId: string;
  competitionName: string;
  lockedAtMs: number | null;
  seeds: Array<{ seed: number; teamId: string; teamName: string }>;
  matches: Array<{
    key: string;
    weekIndex: number;
    weekName: string;
    slotOffset: number;
    home: { teamId: string | null; label: string };
    away: { teamId: string | null; label: string };
    fixtureId: string | null;
    status: string | null;
    homeScore: number;
    awayScore: number;
    date: string | null;
  }>;
}
export interface Integrations {
  facebook: {
    /** Flag on and page id + token present. */
    enabled: boolean;
    /** Flag on but a page id or token is missing. */
    misconfigured: boolean;
    pageId: string | null;
  };
}

export interface FacebookPostResult {
  postId: string;
  url: string;
}

export interface LadderResult {
  competitionId: string;
  competitionName: string;
  computedAtMs: number;
  rows: LadderRow[];
}

const q = (params: Record<string, string | number | undefined>): string => {
  const entries = Object.entries(params).filter(
    (e): e is [string, string | number] => e[1] !== undefined && e[1] !== '',
  );
  return entries.length
    ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`
    : '';
};

/** Typed wrappers for every admin REST route. */
export const adminApi = {
  me: () => api<Me>('/api/auth/me'),
  logout: () => api<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api<{ ok: true }>('/api/auth/password', { method: 'POST', body }),
  devices: () => api<DeviceRow[]>('/api/auth/devices'),
  revokeDevice: (id: string) => api<{ ok: true }>(`/api/auth/devices/${id}`, { method: 'DELETE' }),
  audit: (params: { limit?: number; action?: string } = {}) =>
    api<AuditRow[]>(`/api/audit${q(params)}`),

  settings: {
    get: () => api<Settings>('/api/settings'),
    update: (body: SettingsUpdate) => api<Settings>('/api/settings', { method: 'PUT', body }),
  },
  courts: {
    list: () => api<Court[]>('/api/courts'),
    create: (body: CourtInput) => api<Court>('/api/courts', { method: 'POST', body }),
    update: (id: string, body: Partial<CourtInput>) =>
      api<Court>(`/api/courts/${id}`, { method: 'PUT', body }),
    remove: (id: string) => api<{ ok: true }>(`/api/courts/${id}`, { method: 'DELETE' }),
  },
  formats: {
    list: () => api<GameFormat[]>('/api/formats'),
    create: (body: GameFormatInput) => api<GameFormat>('/api/formats', { method: 'POST', body }),
    update: (id: string, body: Partial<GameFormatInput>) =>
      api<GameFormat>(`/api/formats/${id}`, { method: 'PUT', body }),
    remove: (id: string) => api<{ ok: true }>(`/api/formats/${id}`, { method: 'DELETE' }),
  },
  seasons: {
    list: () => api<SeasonWithCompetitions[]>('/api/seasons'),
    get: (id: string) => api<SeasonWithCompetitions>(`/api/seasons/${id}`),
    create: (body: SeasonInput) => api<Season>('/api/seasons', { method: 'POST', body }),
    update: (id: string, body: Partial<SeasonInput> & { status?: Season['status'] }) =>
      api<Season>(`/api/seasons/${id}`, { method: 'PUT', body }),
    remove: (id: string) => api<{ ok: true }>(`/api/seasons/${id}`, { method: 'DELETE' }),
  },
  competitions: {
    list: (seasonId?: string) => api<CompetitionWithTeams[]>(`/api/competitions${q({ seasonId })}`),
    get: (id: string) => api<CompetitionWithTeams>(`/api/competitions/${id}`),
    create: (body: CompetitionInput) =>
      api<Competition>('/api/competitions', { method: 'POST', body }),
    update: (id: string, body: Partial<CompetitionInput>) =>
      api<Competition>(`/api/competitions/${id}`, { method: 'PUT', body }),
    remove: (id: string) => api<{ ok: true }>(`/api/competitions/${id}`, { method: 'DELETE' }),
  },
  teams: {
    list: (competitionId?: string) => api<TeamWithPlayers[]>(`/api/teams${q({ competitionId })}`),
    create: (body: TeamInput) => api<Team>('/api/teams', { method: 'POST', body }),
    update: (id: string, body: Partial<TeamInput>) =>
      api<Team>(`/api/teams/${id}`, { method: 'PUT', body }),
    remove: (id: string) => api<{ ok: true }>(`/api/teams/${id}`, { method: 'DELETE' }),
  },
  players: {
    list: (params: { teamId?: string; q?: string } = {}) =>
      api<PlayerWithTeams[]>(`/api/players${q(params)}`),
    create: (body: PlayerInput) => api<PlayerWithTeams>('/api/players', { method: 'POST', body }),
    update: (id: string, body: Partial<PlayerInput>) =>
      api<PlayerWithTeams>(`/api/players/${id}`, { method: 'PUT', body }),
    remove: (id: string) => api<{ ok: true }>(`/api/players/${id}`, { method: 'DELETE' }),
  },
  clashLinks: {
    list: () => api<ClashLinkWithNames[]>('/api/clash-links'),
    effective: () => api<EffectiveClash[]>('/api/clash-links/effective'),
    create: (body: ClashLinkInput) =>
      api<TeamClashLink>('/api/clash-links', { method: 'POST', body }),
    remove: (id: string) => api<{ ok: true }>(`/api/clash-links/${id}`, { method: 'DELETE' }),
  },
  sessions: {
    list: (params: { from?: string; to?: string; seasonId?: string } = {}) =>
      api<SessionListItem[]>(`/api/sessions${q(params)}`),
    today: () => api<{ date: string; sessions: Session[] }>('/api/sessions/today'),
    get: (id: string) => api<SessionDetail>(`/api/sessions/${id}`),
    create: (body: SessionInput) => api<Session>('/api/sessions', { method: 'POST', body }),
    update: (id: string, body: Partial<SessionInput>) =>
      api<Session>(`/api/sessions/${id}`, { method: 'PUT', body }),
    saveGrid: (id: string, body: SessionGridSave) =>
      api<SessionDetail>(`/api/sessions/${id}/grid`, { method: 'PUT', body }),
    publish: (id: string, published: boolean) =>
      api<Session>(`/api/sessions/${id}/publish`, { method: 'POST', body: { published } }),
    validate: (id: string) => api<{ issues: ValidationIssue[] }>(`/api/sessions/${id}/validate`),
    remove: (id: string) => api<{ ok: boolean }>(`/api/sessions/${id}`, { method: 'DELETE' }),
  },
  fixtures: {
    list: (
      params: {
        competitionId?: string;
        sessionId?: string;
        seasonId?: string;
        round?: number;
        status?: string;
        from?: string;
        to?: string;
      } = {},
    ) => api<FixtureWithNames[]>(`/api/fixtures${q(params)}`),
    create: (body: FixtureInput) =>
      api<FixtureWithNames>('/api/fixtures', { method: 'POST', body }),
    update: (id: string, body: FixtureUpdate) =>
      api<FixtureWithNames>(`/api/fixtures/${id}`, { method: 'PUT', body }),
    result: (id: string, body: ResultInput) =>
      api<Fixture>(`/api/fixtures/${id}/result`, { method: 'PUT', body }),
    remove: (id: string) => api<{ ok: true }>(`/api/fixtures/${id}`, { method: 'DELETE' }),
  },
  adjustments: {
    list: (competitionId?: string) =>
      api<Array<LadderAdjustment & { teamName: string }>>(
        `/api/adjustments${q({ competitionId })}`,
      ),
    create: (body: AdjustmentInput) =>
      api<LadderAdjustment & { teamName: string }>('/api/adjustments', { method: 'POST', body }),
    remove: (id: string) => api<{ ok: true }>(`/api/adjustments/${id}`, { method: 'DELETE' }),
  },
  ladders: {
    get: (competitionId: string) => api<LadderResult>(`/api/ladders/${competitionId}`),
    postToFacebook: (competitionId: string, body: { imageDataUrl: string; caption?: string }) =>
      api<FacebookPostResult>(`/api/integrations/facebook/ladder/${competitionId}`, {
        method: 'POST',
        body,
      }),
  },
  integrations: {
    get: () => api<Integrations>('/api/integrations'),
  },
  draw: {
    preview: (body: {
      seasonId: string;
      weeks?: number;
      nights: DrawNightInput[];
      seed?: number;
    }) => api<DrawPreview>('/api/draw/preview', { method: 'POST', body }),
    commit: (body: {
      seasonId: string;
      weeks?: number;
      nights: DrawNightInput[];
      seed: number;
      onlyWeeks?: number[];
      replaceExisting: boolean;
    }) => api<DrawCommitResult>('/api/draw/commit', { method: 'POST', body }),
    publishSeason: (seasonId: string, published: boolean) =>
      api<Season>(`/api/seasons/${seasonId}/publish`, { method: 'POST', body: { published } }),
  },
  finals: {
    status: (competitionId: string) => api<FinalsStatus>(`/api/finals/${competitionId}`),
    generate: (body: { competitionId: string; nights: FinalsNightInput[] }) =>
      api<{ seeds: FinalsStatus['seeds']; fixturesCreated: number; sessionsCreated: number }>(
        '/api/finals/generate',
        { method: 'POST', body },
      ),
    unlock: (competitionId: string) =>
      api<{ ok: true }>(`/api/finals/${competitionId}/unlock`, { method: 'POST' }),
  },
};
