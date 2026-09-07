/** Build version baked in by Vite; "dev-…" in development. */
export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';

export function isDevBuild(): boolean {
  return APP_VERSION.startsWith('dev-') || APP_VERSION === 'unknown' || APP_VERSION === 'test';
}

/** True when the server announces a different build than the one running here. */
export function isNewerBuild(serverVersion: string): boolean {
  if (isDevBuild()) return false;
  return serverVersion !== APP_VERSION && serverVersion !== 'dev';
}

export function newActionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
