import { and, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import {
  allocateExpense,
  createExpenseSchema,
  getScheduleECategory,
  isBackdated,
  taxYearRange,
  updateExpenseSchema,
  type AllocationLine,
  type AllocationRule,
  type CreateExpenseInput,
  type UpdateExpenseInput,
} from '@rental/domain';
import { getDb } from '@/db/client';
import { expenses, properties, type Expense } from '@/db/schema';
import { env } from '@/env';
import { NotFoundError } from '../errors';
import { syncEligibilityForExpense } from './timeEntries';

export interface ExpenseFilter {
  taxYear?: number;
  propertyId?: string;
  actorId?: string;
  contractorActorId?: string;
  needsReviewOnly?: boolean;
  from?: string;
  to?: string;
  limit?: number;
}

export async function createExpense(input: CreateExpenseInput): Promise<Expense> {
  const data = createExpenseSchema.parse(input);
  const db = getDb();

  // Validate the split before writing, so a rule that cannot be applied is
  // never persisted against the expense.
  if (data.allocationRule) {
    await assertAllocationApplies(data.amountCents, data.allocationRule as AllocationRule);
  }

  const [row] = await db
    .insert(expenses)
    .values({
      date: data.date,
      actorId: data.actorId,
      propertyId: data.propertyId,
      turnId: data.turnId,
      amountCents: data.amountCents,
      vendor: data.vendor,
      scheduleECategory: data.scheduleECategory,
      capitalClassification: data.capitalClassification,
      classificationAnswers: data.classificationAnswers,
      contractorActorId: data.contractorActorId,
      receiptKey: data.receiptKey,
      notes: data.notes,
      allocationRule: data.allocationRule as Record<string, unknown> | null,
      isBackdated: isBackdated(data.date, new Date(), env.timeZone),
    })
    .returning();

  if (!row) throw new Error('The expense was not saved.');
  return row;
}

export async function updateExpense(input: UpdateExpenseInput): Promise<Expense> {
  const data = updateExpenseSchema.parse(input);
  const db = getDb();
  const existing = await getExpense(data.id);

  const amountCents = data.amountCents ?? existing.amountCents;
  const allocationRule =
    data.allocationRule === undefined
      ? (existing.allocationRule as AllocationRule | null)
      : (data.allocationRule as AllocationRule | null);

  if (allocationRule) await assertAllocationApplies(amountCents, allocationRule);

  const date = data.date ?? existing.date;
  const classificationChanged =
    data.capitalClassification !== undefined &&
    data.capitalClassification !== existing.capitalClassification;

  const [row] = await db
    .update(expenses)
    .set({
      date,
      actorId: data.actorId ?? existing.actorId,
      propertyId: data.propertyId === undefined ? existing.propertyId : data.propertyId,
      turnId: data.turnId === undefined ? existing.turnId : data.turnId,
      amountCents,
      vendor: data.vendor ?? existing.vendor,
      scheduleECategory: data.scheduleECategory ?? existing.scheduleECategory,
      capitalClassification:
        data.capitalClassification === undefined
          ? existing.capitalClassification
          : data.capitalClassification,
      classificationAnswers:
        data.classificationAnswers === undefined
          ? existing.classificationAnswers
          : data.classificationAnswers,
      contractorActorId:
        data.contractorActorId === undefined
          ? existing.contractorActorId
          : data.contractorActorId,
      receiptKey: data.receiptKey === undefined ? existing.receiptKey : data.receiptKey,
      notes: data.notes === undefined ? existing.notes : data.notes,
      allocationRule: allocationRule as Record<string, unknown> | null,
      isBackdated: isBackdated(date, existing.createdAt, env.timeZone),
      updatedAt: new Date(),
    })
    .where(eq(expenses.id, data.id))
    .returning();

  if (!row) throw new NotFoundError('That expense no longer exists.');

  // §5.2: reclassifying the work changes whether the hours it generated count.
  // Doing this here means the two records can never disagree.
  if (classificationChanged) {
    await syncEligibilityForExpense(row.id, row.capitalClassification);
  }

  return row;
}

export async function deleteExpense(id: string): Promise<void> {
  const db = getDb();
  const deleted = await db.delete(expenses).where(eq(expenses.id, id)).returning({
    id: expenses.id,
  });
  if (deleted.length === 0) throw new NotFoundError('That expense no longer exists.');
}

export async function getExpense(id: string): Promise<Expense> {
  const db = getDb();
  const [row] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  if (!row) throw new NotFoundError('That expense no longer exists.');
  return row;
}

export async function listExpenses(filter: ExpenseFilter = {}): Promise<Expense[]> {
  const db = getDb();
  const conditions = [];

  if (filter.taxYear) {
    const range = taxYearRange(filter.taxYear);
    conditions.push(gte(expenses.date, range.start), lte(expenses.date, range.end));
  }
  if (filter.from) conditions.push(gte(expenses.date, filter.from));
  if (filter.to) conditions.push(lte(expenses.date, filter.to));
  if (filter.propertyId) conditions.push(eq(expenses.propertyId, filter.propertyId));
  if (filter.actorId) conditions.push(eq(expenses.actorId, filter.actorId));
  if (filter.contractorActorId) {
    conditions.push(eq(expenses.contractorActorId, filter.contractorActorId));
  }
  if (filter.needsReviewOnly) {
    // §10: every expense tied to physical work has a classification or sits in
    // needs_review. Unclassified spend on a work category is the same problem.
    conditions.push(
      or(
        eq(expenses.capitalClassification, 'needs_review'),
        and(
          isNull(expenses.capitalClassification),
          sql`${expenses.scheduleECategory} IN ('repairs', 'cleaning_maintenance', 'supplies', 'other')`,
        ),
      ),
    );
  }

  return db
    .select()
    .from(expenses)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(expenses.date), desc(expenses.createdAt))
    .limit(filter.limit ?? 500);
}

/**
 * Expands an expense into its per-property lines (§6).
 * The stored record is untouched; these are derived for reports and display.
 */
export async function allocationLinesFor(expense: Expense): Promise<AllocationLine[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: properties.id,
      nickname: properties.nickname,
      unadjustedBasisCents: properties.unadjustedBasisCents,
      ownershipPct: properties.ownershipPct,
    })
    .from(properties);

  return allocateExpense(
    expense.amountCents,
    expense.allocationRule as AllocationRule | null,
    rows.map((r) => ({ ...r, ownershipPct: Number(r.ownershipPct) })),
    expense.propertyId,
  );
}

async function assertAllocationApplies(amountCents: number, rule: AllocationRule) {
  const db = getDb();
  const rows = await db
    .select({
      id: properties.id,
      nickname: properties.nickname,
      unadjustedBasisCents: properties.unadjustedBasisCents,
      ownershipPct: properties.ownershipPct,
    })
    .from(properties);

  // Throws an AllocationError with a message written for the user.
  allocateExpense(
    amountCents,
    rule,
    rows.map((r) => ({ ...r, ownershipPct: Number(r.ownershipPct) })),
  );
}

/** Whether this Schedule E line represents physical work needing classification (§5.3). */
export function requiresCapitalClassification(scheduleECategory: string): boolean {
  return getScheduleECategory(scheduleECategory).triggersCapitalPrompt;
}

export async function countNeedsReview(taxYear: number): Promise<number> {
  const rows = await listExpenses({ taxYear, needsReviewOnly: true, limit: 1000 });
  return rows.length;
}
