import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { taxYearRange } from '@rental/domain';
import { getDb } from '@/db/client';
import {
  actors,
  expenses,
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
  reports: number;
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

  const [expenseRow, incomeRow, timeRow, tripRow, propertyRow, jobRow, peopleRow] =
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
    ]);

  return {
    expenses: expenseRow[0]?.c ?? 0,
    income: incomeRow[0]?.c ?? 0,
    time: timeRow[0]?.c ?? 0,
    trips: tripRow[0]?.c ?? 0,
    properties: propertyRow[0]?.c ?? 0,
    jobs: jobRow[0]?.c ?? 0,
    people: peopleRow[0]?.c ?? 0,
    reports: reportCount,
  };
}
