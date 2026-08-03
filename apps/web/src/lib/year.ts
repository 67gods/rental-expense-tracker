/**
 * The tax year, carried through every link.
 *
 * This exists because of a real bug rather than for tidiness. The year used to
 * live only in the signed-in session, so a fully loaded 2025 was invisible to
 * someone whose active year was 2026 - the data was in the database and no
 * screen would show it. Making the year a URL parameter fixed that, but only
 * if EVERY link preserves it. One link that drops it silently throws the user
 * back to the session year mid-task.
 *
 * So there is one helper, and the rail, the tabs and the page actions all use
 * it. Nothing builds a URL by hand.
 */

/** Years outside this are a typo or a tampered query string, not a choice. */
const MIN_YEAR = 1900;
const MAX_YEAR = 2999;

/**
 * Reads a year from a query parameter, falling back to the session's year.
 *
 * Deliberately tolerant: a bad value falls back rather than throwing, because
 * a mistyped URL should show you your own data, not an error page.
 */
export function resolveTaxYear(
  raw: string | undefined,
  fallback: number,
): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > MIN_YEAR && parsed < MAX_YEAR
    ? parsed
    : fallback;
}

/**
 * Adds or replaces `year` on a path that may already carry a query string.
 *
 * Hand-rolled rather than using URL, which needs an absolute base and would
 * mean inventing an origin on the server for something this small.
 */
export function withYear(href: string, taxYear: number): string {
  const [path, query = ''] = href.split('?');
  const params = new URLSearchParams(query);
  params.set('year', String(taxYear));
  return `${path}?${params.toString()}`;
}

/** The years offered in the switcher: this one and the two behind it. */
export function yearChoices(current: number, sessionYear: number): number[] {
  const years = [sessionYear, sessionYear - 1, sessionYear - 2];
  if (!years.includes(current)) years.unshift(current);
  return years;
}
