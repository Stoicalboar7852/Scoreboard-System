import type { Competition, Court, Fixture, LadderRow } from '@scoreboard/shared';
import { api } from './api.js';

export interface PublicLadder {
  competitionId: string;
  competitionName: string;
  computedAtMs: number;
  rows: LadderRow[];
}
export interface PublicLadderGroup {
  competitionId: string;
  competitionName: string;
  nightOfWeek: number;
  nightName: string;
  ladder: PublicLadder;
}
export interface PublicFixture extends Fixture {
  competitionName: string | null;
  formatName: string | null;
  courtName: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  sessionDate?: string | null;
  startTime?: string | null;
}
export interface PublicCompetition extends Competition {
  seasonName: string;
  formatName: string;
  nightName: string;
}
export interface PublicLadderPage {
  competition: PublicCompetition;
  ladder: PublicLadder;
  lastRound: { round: number; fixtures: PublicFixture[] } | null;
  nextRound: { round: number; fixtures: PublicFixture[] } | null;
}
export interface PublicDraw {
  competition: PublicCompetition;
  rounds: Array<{ round: number; date: string | null; fixtures: PublicFixture[] }>;
}
export interface PublicTonight {
  date: string;
  courts: Court[];
  sessions: Array<{
    id: string;
    date: string;
    nightOfWeek: number;
    firstSlotTime: string;
    slotLengthMinutes: number;
    slotCount: number;
    status: 'PLANNED' | 'LIVE' | 'COMPLETE';
    fixtures: PublicFixture[];
  }>;
}

export const publicApi = {
  ladders: () => api<PublicLadderGroup[]>('/api/public/ladders'),
  ladder: (competitionId: string) => api<PublicLadderPage>(`/api/public/ladders/${competitionId}`),
  draw: (competitionId: string) => api<PublicDraw>(`/api/public/draw/${competitionId}`),
  tonight: () => api<PublicTonight>('/api/public/tonight'),
};
