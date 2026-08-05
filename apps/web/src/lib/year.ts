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

/**
 * The years offered in the switcher.
 *
 * Anchored on the LATER of the session year and today's calendar year, not on
 * the session year alone. The session deliberately opens on the newest year
 * that holds records, so all through 2026 that resolved to 2025 - and a
 * switcher built from 2025 offered 2025, 2024 and 2023. There was no way to
 * reach 2026, and the only thing that would have made it reachable was a 2026
 * record, which there was no way to add. A year you cannot navigate to is a
 * year you cannot file.
 *
 * `current` is kept in the list even when it falls outside the window, so a
 * link into an older year does not render a switcher that disagrees with the
 * page beneath it.
 */
export function yearChoices(
  current: number,
  sessionYear: number,
  calendarYear: number = sessionYear,
): number[] {
  const newest = Math.max(sessionYear, calendarYear);
  const years = new Set([newest, newest - 1, newest - 2, sessionYear, current]);
  return [...years].sort((a, b) => b - a);
}
