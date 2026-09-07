import { readJson, remove, writeJson } from './storage.js';

const TOKEN_KEY = 'sb.deviceToken';
const COURT_KEY = 'sb.controllerCourtId';
const SCOREBOARD_COURT_KEY = 'sb.scoreboardCourtId';

export function getDeviceToken(): string | null {
  return readJson<string | null>(TOKEN_KEY, null);
}
export function setDeviceToken(token: string | null): void {
  if (token) writeJson(TOKEN_KEY, token);
  else remove(TOKEN_KEY);
}
export function getControllerCourtId(): string | null {
  return readJson<string | null>(COURT_KEY, null);
}
export function setControllerCourtId(courtId: string | null): void {
  if (courtId) writeJson(COURT_KEY, courtId);
  else remove(COURT_KEY);
}
export function getScoreboardCourtId(): string | null {
  return readJson<string | null>(SCOREBOARD_COURT_KEY, null);
}
export function setScoreboardCourtId(courtId: string | null): void {
  if (courtId) writeJson(SCOREBOARD_COURT_KEY, courtId);
  else remove(SCOREBOARD_COURT_KEY);
}
