/** Injectable clock so services and the scheduler can be tested with fake time. */
export interface Now {
  (): number;
}

export const systemNow: Now = () => Date.now();

export function toMs(date: Date | null | undefined): number | null {
  return date ? date.getTime() : null;
}

export function fromMs(ms: number | null | undefined): Date | null {
  return ms === null || ms === undefined ? null : new Date(ms);
}
