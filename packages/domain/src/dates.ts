/**
 * Date handling.
 *
 * Every business date in this app is a plain `YYYY-MM-DD` string anchored to
 * the household's timezone, never a UTC timestamp. A repair logged at 8pm on
 * 31 December must stay in that tax year, and storing it as an instant would
 * push it into January for anyone east of the household.
 *
 * `created_at` is the exception: it is a true instant, because it is the
 * contemporaneity evidence (§6).
 */

export class DateError extends Error {
  override readonly name = 'DateError';
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Round-trip through UTC to reject 2025-02-30 and friends.
  const probe = new Date(Date.UTC(y, m - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === m - 1 &&
    probe.getUTCDate() === d
  );
}

export function assertIsoDate(value: string, field = 'date'): string {
  if (!isIsoDate(value)) {
    throw new DateError(`${field} must be a real calendar date as YYYY-MM-DD, received: "${value}"`);
  }
  return value;
}

/**
 * Today's calendar date in the given timezone.
 * `en-CA` formats as YYYY-MM-DD, which avoids hand-rolling the padding.
 */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** The calendar year a business date falls in. Read off the string, not parsed. */
export function taxYearOf(isoDate: string): number {
  assertIsoDate(isoDate);
  return Number(isoDate.slice(0, 4));
}

/** The current tax year in the household timezone. */
export function currentTaxYear(timeZone: string, now: Date = new Date()): number {
  return taxYearOf(todayInZone(timeZone, now));
}

export interface DateRange {
  /** Inclusive. */
  start: string;
  /** Inclusive. */
  end: string;
}

/** The full calendar year as an inclusive date range, for report filters. */
export function taxYearRange(year: number): DateRange {
  if (!Number.isInteger(year) || year < 1900 || year > 2999) {
    throw new DateError(`Not a usable tax year: ${year}`);
  }
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/** Year-to-date range: 1 January through today, in the household timezone. */
export function yearToDateRange(timeZone: string, now: Date = new Date()): DateRange {
  const today = todayInZone(timeZone, now);
  return { start: `${today.slice(0, 4)}-01-01`, end: today };
}

/** Whether a business date falls inside an inclusive range. String compare is safe for ISO dates. */
export function isWithin(isoDate: string, range: DateRange): boolean {
  return isoDate >= range.start && isoDate <= range.end;
}

/**
 * Whether an entry was written for a date earlier than the day it was created.
 *
 * Backdating is allowed - people log Saturday's work on Monday - but it is
 * recorded, because a contemporaneous record and a reconstructed one are not
 * the same evidence (§6).
 */
export function isBackdated(
  entryDate: string,
  createdAt: Date,
  timeZone: string,
): boolean {
  return entryDate < todayInZone(timeZone, createdAt);
}

/** How many days after the fact an entry was written. Zero when same-day. */
export function daysBetween(startIso: string, endIso: string): number {
  assertIsoDate(startIso, 'start');
  assertIsoDate(endIso, 'end');
  const start = Date.parse(`${startIso}T00:00:00Z`);
  const end = Date.parse(`${endIso}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

/** Adds days to a business date, staying in plain-date space. */
export function addDays(isoDate: string, days: number): string {
  assertIsoDate(isoDate);
  const base = new Date(`${isoDate}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** "Mon 5 Jan" style label for dense list rows. */
export function formatDateShort(isoDate: string): string {
  assertIsoDate(isoDate);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** "January 5, 2026" for report headers. */
export function formatDateLong(isoDate: string): string {
  assertIsoDate(isoDate);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** The month number (1-12) of a business date, for the W-9 warning window. */
export function monthOf(isoDate: string): number {
  assertIsoDate(isoDate);
  return Number(isoDate.slice(5, 7));
}
