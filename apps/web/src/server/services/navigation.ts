import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { taxYearRange } from '@rental/domain';
import { getDb } from '@/db/client';
import {
  actors,
  expenses,
  interestYears,
  jobs,
  properties,
  rentReceipts,
  timeEntries,
  trips,
} from '@/db/schema';

/**
 * The counts beside each item in the navigation rail.
 *
 * Counted rather than listed. The rail renders on every page, and pulling
 * eighty expense rows just to show "78" would put a table scan on the critical
 * path of every navigation in the app.
 *
 * They are all year-scoped except the reference tables, because "Expenses 78"
 * has to mean the year you are looking at. A count that quietly spans all
 * years would contradict the table directly underneath it.
 */
export interface RailCountsResult {
  expenses: number;
  income: number;
  time: number;
  trips: number;
  properties: number;
  jobs: number;
  people: number;
  interest: number;
  reports: number;
}

/**
 * The newest calendar year that actually holds a record.
 *
 * The app used to open on whatever year it happened to be, which through 2026
 * meant landing on an empty screen - $0.00, nothing per property, every count
 * zero - while a fully reconciled 2025 sat one click away in a switcher nobody
 * had a reason to touch. An empty year is a fine thing to look at once you have
 * asked for it, and a bad thing to be shown by default.
 *
 * Returns null on an empty database, where the current year is the only
 * sensible answer.
 *
 * Interest years are deliberately not in the union. They carry a tax year
 * rather than a date, and a household that has typed in a 1099-INT and nothing
 * else has not started using the app for that year - opening on it would show
 * an empty rental ledger.
 */
export async function latestYearWithData(): Promise<number | null> {
  const db = getDb();

  // One round trip. These four dates are stored as text `YYYY-MM-DD`, so max()
  // over them is an ordinary lexicographic max and needs no casting.
  const result = await db.execute(sql`
    select max(d) as d from (
      select max(${expenses.date}) as d from ${expenses}
      union all select max(${rentReceipts.date}) from ${rentReceipts}
      union all select max(${timeEntries.date}) from ${timeEntries}
      union all select max(${trips.date}) from ${trips}
    ) as latest
  `);

  const value = (result.rows[0] as { d?: string | null } | undefined)?.d;
  if (!value) return null;

  const year = Number(String(value).slice(0, 4));
  return Number.isInteger(year) ? year : null;
}

export async function railCounts(
  taxYear: number,
  reportCount: number,
): Promise<RailCountsResult> {
  const db = getDb();
  const range = taxYearRange(taxYear);

  // Written out per table rather than through a shared helper: a column
  // reference carries its table in its type, so one helper typed to
  // `expenses.date` cannot accept `trips.date` without a cast, and casting
  // here would only be hiding that the query is table-specific anyway.
  const count = sql<number>`count(*)::int`;

  const [expenseRow, incomeRow, timeRow, tripRow, propertyRow, jobRow, peopleRow, interestRow] =
    await Promise.all([
      db
        .select({ c: count })
        .from(expenses)
        .where(and(gte(expenses.date, range.start), lte(expenses.date, range.end))),
      db
        .select({ c: count })
        .from(rentReceipts)
        .where(and(gte(rentReceipts.date, range.start), lte(rentReceipts.date, range.end))),
      db
        .select({ c: count })
        .from(timeEntries)
        .where(and(gte(timeEntries.date, range.start), lte(timeEntries.date, range.end))),
      db
        .select({ c: count })
        .from(trips)
        .where(and(gte(trips.date, range.start), lte(trips.date, range.end))),
      db
        .select({ c: count })
        .from(properties)
        .where(eq(properties.isArchived, false)),
      db.select({ c: count }).from(jobs),
      db
        .select({ c: count })
        .from(actors)
        .where(eq(actors.isArchived, false)),
      // The one count keyed on a tax year rather than filtered by a date:
      // a 1099-INT is a fact about a year, not something that happened on a day.
      db
        .select({ c: count })
        .from(interestYears)
        .where(eq(interestYears.taxYear, taxYear)),
    ]);

  return {
    expenses: expenseRow[0]?.c ?? 0,
    income: incomeRow[0]?.c ?? 0,
    time: timeRow[0]?.c ?? 0,
    trips: tripRow[0]?.c ?? 0,
    properties: propertyRow[0]?.c ?? 0,
    jobs: jobRow[0]?.c ?? 0,
    people: peopleRow[0]?.c ?? 0,
    interest: interestRow[0]?.c ?? 0,
    reports: reportCount,
  };
}
