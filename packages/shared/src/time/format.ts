/** Formats a remaining-time value as m:ss (or h:mm:ss above an hour), rounding up seconds. */
export function formatClock(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Parses HH:mm into minutes since midnight. */
export function parseTimeOfDay(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`Invalid time of day: ${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Invalid time of day: ${value}`);
  return hours * 60 + minutes;
}

/** Formats minutes since midnight as HH:mm. */
export function formatTimeOfDay(minutesSinceMidnight: number): string {
  const m = ((minutesSinceMidnight % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Formats minutes since midnight as a friendly 12-hour label, e.g. 8:15pm. */
export function formatTimeOfDay12h(minutesSinceMidnight: number): string {
  const m = ((minutesSinceMidnight % 1440) + 1440) % 1440;
  const hours24 = Math.floor(m / 60);
  const minutes = m % 60;
  const suffix = hours24 >= 12 ? 'pm' : 'am';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, '0')}${suffix}`;
}

/** Start time (minutes since midnight) of a slot. */
export function slotStartMinutes(
  firstSlotTime: string,
  slotLengthMinutes: number,
  slotIndex: number,
): number {
  return parseTimeOfDay(firstSlotTime) + slotLengthMinutes * slotIndex;
}

/**
 * Converts a wall-clock time to a slot index, or null when it does not fall on a slot
 * boundary (within one minute of tolerance).
 */
export function slotIndexForTime(
  firstSlotTime: string,
  slotLengthMinutes: number,
  time: string,
): number | null {
  const offset = parseTimeOfDay(time) - parseTimeOfDay(firstSlotTime);
  if (offset < 0) return null;
  const index = Math.round(offset / slotLengthMinutes);
  return Math.abs(index * slotLengthMinutes - offset) <= 1 ? index : null;
}

/** Slot length in minutes for a format: two halves plus half time plus the gap, rounded up. */
export function formatSlotMinutes(format: {
  halfSeconds: number;
  halfTimeSeconds: number;
  betweenGamesSeconds: number;
}): number {
  const seconds = format.halfSeconds * 2 + format.halfTimeSeconds + format.betweenGamesSeconds;
  return Math.ceil(seconds / 60);
}
