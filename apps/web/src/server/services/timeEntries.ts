import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import {
  createTimeEntrySchema,
  deriveShEligible,
  isBackdated,
  recomputeEligibilityForClassificationChange,
  taxYearOf,
  taxYearRange,
  updateTimeEntrySchema,
  type CapitalClassification,
  type CreateTimeEntryInput,
  type UpdateTimeEntryInput,
} from '@rental/domain';
import { getDb } from '@/db/client';
import { expenses, timeEntries, type TimeEntry } from '@/db/schema';
import { env } from '@/env';
import { NotFoundError, ValidationError } from '../errors';

/**
 * Time entry writes.
 *
 * `sh_eligible` is derived here by calling into @rental/domain and is never
 * read from the request body. A client - including the Android client at M4 -
 * cannot set it, correctly or otherwise. That is what keeps the two clients
 * agreeing on the year-end number.
 */

export interface TimeEntryFilter {
  taxYear?: number;
  enterpriseId?: string;
  propertyId?: string;
  actorId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export async function createTimeEntry(
  input: CreateTimeEntryInput,
  context: { linkedExpenseId?: string | null } = {},
): Promise<TimeEntry> {
  const data = createTimeEntrySchema.parse(input);
  const db = getDb();

  // When the entry is attached to an expense, the classification that governs
  // eligibility is read from that expense rather than trusted from the client.
  const classification = context.linkedExpenseId
    ? await classificationOf(context.linkedExpenseId)
    : (data.linkedCapitalClassification ?? null);

  // The year comes from the entry's own date, never from today. Work done on
  // 30 December and logged in January is judged under the rules of the year it
  // happened in, which is the whole reason rules are keyed by year.
  const eligibility = deriveShEligible(
    {
      category: data.category,
      linkedCapitalClassification: classification,
    },
    taxYearOf(data.date),
  );

  const now = new Date();
  const [row] = await db
    .insert(timeEntries)
    .values({
      date: data.date,
      actorId: data.actorId,
      enterpriseId: data.enterpriseId,
      propertyId: data.propertyId,
      turnId: data.turnId,
      minutes: data.minutes,
      category: data.category,
      description: data.description,
      shEligible: eligibility.shEligible,
      shEligibleReason: eligibility.reason,
      isProvisional: eligibility.isProvisional,
      linkedExpenseId: context.linkedExpenseId ?? null,
      source: data.source,
      // Recorded, not prevented. A reconstructed record and a contemporaneous
      // one are different evidence, and the difference has to survive (§6).
      isBackdated: isBackdated(data.date, now, env.timeZone),
    })
    .returning();

  if (!row) throw new Error('The time entry was not saved.');
  return row;
}

export async function updateTimeEntry(input: UpdateTimeEntryInput): Promise<TimeEntry> {
  const data = updateTimeEntrySchema.parse(input);
  const db = getDb();

  const existing = await getTimeEntry(data.id);

  const category = data.category ?? existing.category;
  const classification = existing.linkedExpenseId
    ? await classificationOf(existing.linkedExpenseId)
    : (data.linkedCapitalClassification ?? null);

  const date = data.date ?? existing.date;

  const eligibility = deriveShEligible(
    {
      category,
      linkedCapitalClassification: classification,
    },
    taxYearOf(date),
  );

  const [row] = await db
    .update(timeEntries)
    .set({
      date,
      actorId: data.actorId ?? existing.actorId,
      propertyId: data.propertyId === undefined ? existing.propertyId : data.propertyId,
      turnId: data.turnId === undefined ? existing.turnId : data.turnId,
      minutes: data.minutes ?? existing.minutes,
      category,
      description: data.description ?? existing.description,
      shEligible: eligibility.shEligible,
      shEligibleReason: eligibility.reason,
      isProvisional: eligibility.isProvisional,
      // isBackdated compares against the ORIGINAL creation instant, so editing
      // an old entry today does not relabel it as written on the day.
      isBackdated: isBackdated(date, existing.createdAt, env.timeZone),
      updatedAt: new Date(),
    })
    .where(eq(timeEntries.id, data.id))
    .returning();

  if (!row) throw new NotFoundError('That time entry no longer exists.');
  return row;
}

export async function deleteTimeEntry(id: string): Promise<void> {
  const db = getDb();
  const deleted = await db.delete(timeEntries).where(eq(timeEntries.id, id)).returning({
    id: timeEntries.id,
  });
  if (deleted.length === 0) {
    throw new NotFoundError('That time entry no longer exists.');
  }
}

export async function getTimeEntry(id: string): Promise<TimeEntry> {
  const db = getDb();
  const [row] = await db.select().from(timeEntries).where(eq(timeEntries.id, id)).limit(1);
  if (!row) throw new NotFoundError('That time entry no longer exists.');
  return row;
}

export async function listTimeEntries(filter: TimeEntryFilter = {}): Promise<TimeEntry[]> {
  const db = getDb();
  const conditions = buildConditions(filter);

  return db
    .select()
    .from(timeEntries)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(timeEntries.date), desc(timeEntries.createdAt))
    .limit(filter.limit ?? 500);
}

function buildConditions(filter: TimeEntryFilter) {
  const conditions = [];
  if (filter.taxYear) {
    const range = taxYearRange(filter.taxYear);
    conditions.push(gte(timeEntries.date, range.start), lte(timeEntries.date, range.end));
  }
  if (filter.from) conditions.push(gte(timeEntries.date, filter.from));
  if (filter.to) conditions.push(lte(timeEntries.date, filter.to));
  if (filter.enterpriseId) conditions.push(eq(timeEntries.enterpriseId, filter.enterpriseId));
  if (filter.propertyId) conditions.push(eq(timeEntries.propertyId, filter.propertyId));
  if (filter.actorId) conditions.push(eq(timeEntries.actorId, filter.actorId));
  return conditions;
}

/**
 * Re-derives eligibility for every entry attached to an expense whose
 * classification just changed (§5.2).
 *
 * Called by the expense service. Without it, reclassifying a job as a capital
 * improvement would leave the hours it generated still counting as eligible.
 */
export async function syncEligibilityForExpense(
  expenseId: string,
  classification: CapitalClassification | null,
): Promise<number> {
  const db = getDb();
  const linked = await db
    .select({
      id: timeEntries.id,
      date: timeEntries.date,
      category: timeEntries.category,
      shEligible: timeEntries.shEligible,
      isProvisional: timeEntries.isProvisional,
    })
    .from(timeEntries)
    .where(eq(timeEntries.linkedExpenseId, expenseId));

  if (linked.length === 0) return 0;

  // A single invoice can carry time entries from more than one year - an
  // improvement started in December and finished in January is ordinary. Each
  // entry is therefore recomputed under the rules of its own year rather than
  // under one year picked for the whole batch.
  const byYear = new Map<number, typeof linked>();
  for (const entry of linked) {
    const year = taxYearOf(entry.date);
    const bucket = byYear.get(year);
    if (bucket) bucket.push(entry);
    else byYear.set(year, [entry]);
  }

  const changes = [...byYear.entries()].flatMap(([year, entries]) =>
    recomputeEligibilityForClassificationChange(entries, classification, year),
  );
  if (changes.length === 0) return 0;

  // Grouped into one statement per outcome rather than one per row: at most
  // two round trips however many entries a job generated.
  const now = new Date();
  for (const shEligible of [true, false]) {
    for (const isProvisional of [true, false]) {
      const ids = changes
        .filter((c) => c.shEligible === shEligible && c.isProvisional === isProvisional)
        .map((c) => c.id);
      if (ids.length === 0) continue;

      const reason = changes.find((c) => ids.includes(c.id))?.reason ?? 'category_eligible';
      await db
        .update(timeEntries)
        .set({ shEligible, isProvisional, shEligibleReason: reason, updatedAt: now })
        .where(inArray(timeEntries.id, ids));
    }
  }

  return changes.length;
}

async function classificationOf(expenseId: string): Promise<CapitalClassification | null> {
  const db = getDb();
  const [row] = await db
    .select({ classification: expenses.capitalClassification })
    .from(expenses)
    .where(eq(expenses.id, expenseId))
    .limit(1);
  if (!row) {
    throw new ValidationError('That expense no longer exists, so the time cannot be linked to it.');
  }
  return row.classification;
}

/** Count of entries whose eligibility is waiting on an unresolved classification. */
export async function countProvisionalEntries(
  enterpriseId: string,
  taxYear: number,
): Promise<number> {
  const db = getDb();
  const range = taxYearRange(taxYear);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.enterpriseId, enterpriseId),
        eq(timeEntries.isProvisional, true),
        gte(timeEntries.date, range.start),
        lte(timeEntries.date, range.end),
      ),
    );
  return row?.count ?? 0;
}
