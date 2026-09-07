/** Calendar arithmetic on YYYY-MM-DD strings, done in UTC so no timezone can shift a day. */

function toUtc(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y as number, (m as number) - 1, d as number));
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function dayOfWeek(date: string): number {
  return toUtc(date).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/**
 * Dates on which a given night of the week plays, one per week starting from the week
 * of `startDate`. A skipped date pushes that week and every later week back by 7 days.
 */
export function sessionDates(
  startDate: string,
  weeks: number,
  nightOfWeek: number,
  skippedDates: readonly string[],
): string[] {
  const skipped = new Set(skippedDates);
  const offset = (nightOfWeek - dayOfWeek(startDate) + 7) % 7;
  let date = addDays(startDate, offset);
  const dates: string[] = [];
  while (dates.length < weeks) {
    if (!skipped.has(date)) dates.push(date);
    date = addDays(date, 7);
  }
  return dates;
}
