// Calendar dates written as YYYY-MM-DD, as a user's own local date (US10).
// Client-safe: no server imports.

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// The furthest time zones from UTC: UTC−12 and UTC+14.
const WEST_MOST_OFFSET_MS = -12 * 60 * 60 * 1000;
const EAST_MOST_OFFSET_MS = 14 * 60 * 60 * 1000;

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
export function isLocalDate(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The UTC calendar date at `date`, as YYYY-MM-DD. */
export function utcCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Today's calendar date in this device's time zone, as YYYY-MM-DD. Unlike toISOString(),
 * it doesn't switch to the next day before local midnight west of UTC, or after it east.
 */
export function todayLocalDate(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

const WORN_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

/**
 * A stored YYYY-MM-DD date written out in full ("Wednesday, November 11, 2026"). It is read
 * as UTC midnight and formatted in UTC, so no time zone can move it to another day.
 */
export function formatWornDate(value: string): string {
  return WORN_DATE_FORMAT.format(new Date(`${value}T00:00:00.000Z`));
}

/**
 * True when `value` is today's date in some time zone at `now`. A user's local date can be
 * one day either side of the UTC date, but never older or later than every time zone.
 */
export function isCurrentDateSomewhere(value: string, now: Date): boolean {
  if (!isLocalDate(value)) {
    return false;
  }
  const earliest = utcCalendarDate(new Date(now.getTime() + WEST_MOST_OFFSET_MS));
  const latest = utcCalendarDate(new Date(now.getTime() + EAST_MOST_OFFSET_MS));
  // YYYY-MM-DD strings compare in calendar order.
  return value >= earliest && value <= latest;
}
