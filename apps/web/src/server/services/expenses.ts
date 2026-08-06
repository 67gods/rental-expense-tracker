import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import {
  allocateExpense,
  createExpenseSchema,
  formatCents,
  getScheduleECategory,
  isBackdated,
  needsPropertyOrSplit,
  taxYearRange,
  updateExpenseSchema,
  type AllocationLine,
  type AllocationRule,
  type CreateExpenseInput,
  type UpdateExpenseInput,
} from '@rental/domain';
import { getDb, withTransaction } from '@/db/client';
import { expensePayments, expenses, properties, type Expense } from '@/db/schema';
import { env } from '@/env';
import { NotFoundError, ValidationError } from '../errors';
import { syncEligibilityForExpense } from './timeEntries';
import { paidByExpenseInYear } from './payments';

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

/**
 * Creates an expense and, with it, the one payment row that says "paid in full
 * on the invoice date".
 *
 * THIS IS WHAT KEEPS THE SPLIT INVISIBLE. The expense form is unchanged - the
 * same five fields it has always had, with no mention of payments - and the
 * service writes the cash event itself. Only the two invoices a year that
 * genuinely straddle a year boundary ever need the instalment UI.
 *
 * Both writes happen in one transaction. A half-written pair would leave an
 * expense that reads as never paid, which drops it out of every report while
 * still appearing in the ledger.
 */
export async function createExpense(
  input: CreateExpenseInput,
  options: { jobId?: string | null; paidDate?: string } = {},
): Promise<Expense> {
  const data = createExpenseSchema.parse(input);

  // Validate the split before writing, so a rule that cannot be applied is
  // never persisted against the expense.
  if (data.allocationRule) {
    await assertAllocationApplies(data.amountCents, data.allocationRule as AllocationRule);
  }

  return withTransaction(async (tx) => {
    const [row] = await tx
      .insert(expenses)
      .values({
        date: data.date,
        actorId: data.actorId,
        propertyId: data.propertyId,
        turnId: data.turnId,
        jobId: options.jobId ?? null,
        amountCents: data.amountCents,
        vendor: data.vendor,
        scheduleECategory: data.scheduleECategory,
        capitalClassification: data.capitalClassification,
        classificationAnswers: data.classificationAnswers,
        contractorActorId: data.contractorActorId,
        receiptKey: data.receiptKey,
        receiptSha256: data.receiptSha256,
        notes: data.notes,
        allocationRule: data.allocationRule as Record<string, unknown> | null,
        isBackdated: isBackdated(data.date, new Date(), env.timeZone),
      })
      .returning();

    if (!row) throw new Error('The expense was not saved.');

    // A zero-amount expense gets no payment row: there was no cash event, and
    // inventing a zero one to satisfy a rule would be a lie in the ledger.
    // integrity.ts exempts it from the "every expense has a payment" check.
    if (data.amountCents > 0) {
      await tx.insert(expensePayments).values({
        expenseId: row.id,
        paidDate: options.paidDate ?? data.date,
        amountCents: data.amountCents,
        isScheduled: false,
        receiptKey: data.receiptKey,
      });
    }

    return row;
  });
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

  // Checked BEFORE the write, not after. This ran afterwards once, and an
  // invoice was persisted at $1,000 with $8,244 of payments already against it:
  // the caller saw an error while the database kept the contradiction. A
  // refusal has to leave the record as it was.
  const payments = await db
    .select()
    .from(expensePayments)
    .where(eq(expensePayments.expenseId, data.id));
  assertInvoiceCoversPayments(amountCents, payments, existing.amountCents);

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
      receiptSha256:
        data.receiptSha256 === undefined ? existing.receiptSha256 : data.receiptSha256,
      notes: data.notes === undefined ? existing.notes : data.notes,
      allocationRule: allocationRule as Record<string, unknown> | null,
      isBackdated: isBackdated(date, existing.createdAt, env.timeZone),
      updatedAt: new Date(),
    })
    .where(eq(expenses.id, data.id))
    .returning();

  if (!row) throw new NotFoundError('That expense no longer exists.');

  await reconcilePaymentsToInvoice(row.id, amountCents, date, existing.amountCents, payments);

  // §5.2: reclassifying the work changes whether the hours it generated count.
  // Doing this here means the two records can never disagree.
  if (classificationChanged) {
    await syncEligibilityForExpense(row.id, row.capitalClassification);
  }

  return row;
}

/**
 * Refuses a new invoice total that the existing payments already exceed.
 *
 * Skipped for an unsplit expense whose single payment simply mirrors the
 * invoice: that one is about to be rewritten to match, so it can never be the
 * thing that blocks the edit.
 */
function assertInvoiceCoversPayments(
  amountCents: number,
  payments: readonly { amountCents: number }[],
  previousAmountCents: number,
): void {
  const isMirroringSingle =
    payments.length === 1 && payments[0]?.amountCents === previousAmountCents;
  if (isMirroringSingle || payments.length === 0) return;

  const committed = sumOf(payments);
  if (committed > amountCents) {
    throw new ValidationError(
      `This expense has ${payments.length} payment${payments.length === 1 ? '' : 's'} against it totalling ${formatCents(committed)}, which is more than the new invoice total of ${formatCents(amountCents)}. Adjust the payments first.`,
    );
  }
}

/**
 * Keeps the payment rows honest after the invoice total or date changed.
 *
 * An UNSPLIT expense - one payment, which is the ordinary case and the one the
 * owner never sees - has its single payment follow the invoice. Correcting a
 * typo in an amount should not also require finding a payments screen.
 *
 * A SPLIT expense is left alone. Those rows are real cash events with their own
 * dates, and silently rewriting them would destroy the record of what was
 * actually paid when. `assertInvoiceCoversPayments` has already refused the
 * case where the new total no longer covers them.
 */
async function reconcilePaymentsToInvoice(
  expenseId: string,
  amountCents: number,
  date: string,
  previousAmountCents: number,
  payments: readonly { id: string; amountCents: number }[],
): Promise<void> {
  const db = getDb();

  if (payments.length === 0) {
    // Either a zero-amount expense that has just been given a real amount, or a
    // row from before payments existed. Either way it needs its cash event.
    if (amountCents > 0) {
      await db.insert(expensePayments).values({
        expenseId,
        paidDate: date,
        amountCents,
        isScheduled: false,
      });
    }
    return;
  }

  if (payments.length === 1) {
    const [only] = payments;
    if (!only) return;
    if (amountCents === 0) {
      await db.delete(expensePayments).where(eq(expensePayments.id, only.id));
      return;
    }
    // Only follow the invoice while the two still agree. Once someone has
    // edited the payment to differ deliberately, it is a real cash event and
    // stops being a mirror of the invoice.
    const wasMirroring = only.amountCents === previousAmountCents;
    if (wasMirroring) {
      await db
        .update(expensePayments)
        .set({ amountCents, paidDate: date, updatedAt: new Date() })
        .where(eq(expensePayments.id, only.id));
    }
  }
}

function sumOf(payments: readonly { amountCents: number }[]): number {
  return payments.reduce((total, p) => total + p.amountCents, 0);
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
 * Expenses by id, whatever year they are dated in.
 *
 * The reports need this because cash basis breaks the usual assumption. A
 * payment made in 2026 against an invoice dated December 2025 belongs in the
 * 2026 report, so the report starts from the payments and then has to fetch
 * invoices that `listExpenses({ taxYear })` would never return.
 */
export async function expensesByIds(ids: readonly string[]): Promise<Map<string, Expense>> {
  if (ids.length === 0) return new Map();
  const db = getDb();
  const rows = await db.select().from(expenses).where(inArray(expenses.id, [...ids]));
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Every expense a year has to account for, with what it was paid in that year.
 *
 * Two sets, unioned. The invoices DATED in the year, which is what the review
 * screen has always shown; and the invoices dated earlier that were still being
 * paid off during it, which it never showed at all.
 *
 * The second set is the whole reason the payments table exists. An $8,244
 * invoice raised in December 2025 with $2,500 settled then and the rest spread
 * across 2026 is deducted in 2026 for all but the first payment - the Schedule E
 * ledger has always got this right, because it starts from the payments. The
 * entries screen started from the invoice date, so the year that actually
 * deducted the money was the one year you could not see it in. The figures
 * reconciled and the screen backing them did not.
 *
 * `paidByExpense` counts settled rows only, so a scheduled instalment pulls
 * nothing into a year before it is confirmed.
 */
export async function expensesTouchingYear(
  taxYear: number,
  options: { limit?: number } = {},
): Promise<{ expenses: Expense[]; paidByExpense: Map<string, number> }> {
  const limit = options.limit ?? 5000;
  const [invoicedThisYear, paidByExpense] = await Promise.all([
    listExpenses({ taxYear, limit }),
    paidByExpenseInYear(taxYear),
  ]);

  const seen = new Set(invoicedThisYear.map((e) => e.id));
  const carriedIds = [...paidByExpense.keys()].filter((id) => !seen.has(id));
  const carried = await expensesByIds(carriedIds);

  const rows = [...invoicedThisYear, ...carried.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.getTime() - a.createdAt.getTime(),
  );

  return { expenses: rows, paidByExpense };
}

/**
 * Expands an expense into its per-property lines (§6).
 * The stored record is untouched; these are derived for reports and display.
 */
export async function allocationLinesFor(expense: Expense): Promise<AllocationLine[]> {
  // No property and no split yet - nothing to allocate until it is resolved (§6).
  if (needsPropertyOrSplit(expense.propertyId, expense.allocationRule as AllocationRule | null)) {
    return [];
  }

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

/**
 * What the capture form knows only by looking backwards.
 *
 * Both of these exist to remove typing from the fifteen-second case, and both
 * are hints rather than defaults - nothing here is selected or filled on the
 * owner's behalf. A property that was used this morning is almost certainly the
 * property being used again now, and saying so beside its name is enough; the
 * tap is still the owner's. Same for the vendor list, which is four buttons
 * that fill a field, not an autocomplete that guesses at it.
 *
 * One query for both. They are read together on every capture page and the row
 * set is the same one, so a second round trip would buy nothing.
 */
export interface CaptureHints {
  /** Property id, to the date of the most recent expense recorded against it. */
  lastUsedByProperty: Record<string, string>;
  /** Vendor names, most recently used first, deduplicated case-insensitively. */
  recentVendors: string[];
}

export async function captureHints(
  options: { vendorLimit?: number } = {},
): Promise<CaptureHints> {
  const db = getDb();

  // Recent rather than all: a vendor last used three years ago is not a
  // shortcut, and the property dates only need the newest row per property.
  const rows = await db
    .select({
      date: expenses.date,
      propertyId: expenses.propertyId,
      vendor: expenses.vendor,
    })
    .from(expenses)
    .orderBy(desc(expenses.date), desc(expenses.createdAt))
    .limit(300);

  const lastUsedByProperty: Record<string, string> = {};
  const vendors: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (row.propertyId && !lastUsedByProperty[row.propertyId]) {
      lastUsedByProperty[row.propertyId] = row.date;
    }

    const vendor = row.vendor.trim();
    const key = vendor.toLowerCase();
    if (vendor && !seen.has(key)) {
      seen.add(key);
      vendors.push(vendor);
    }
  }

  return {
    lastUsedByProperty,
    recentVendors: vendors.slice(0, options.vendorLimit ?? 4),
  };
}

/** Whether this Schedule E line represents physical work needing classification (§5.3). */
export function requiresCapitalClassification(scheduleECategory: string): boolean {
  return getScheduleECategory(scheduleECategory).triggersCapitalPrompt;
}

export async function countNeedsReview(taxYear: number): Promise<number> {
  const rows = await listExpenses({ taxYear, needsReviewOnly: true, limit: 1000 });
  return rows.length;
}

/**
 * Paid expenses that cannot reach Schedule E because nothing says which
 * property they belong to (§6).
 *
 * STARTS FROM THE PAYMENTS, exactly as the ledger does, and not from
 * `listExpenses({ taxYear })`. That filter reads the invoice date, so an
 * invoice dated 2024 and settled in 2025 is absent from it - and that is
 * precisely the expense the 2025 ledger silently dropped. Counting the
 * invoices of the year would have left the cross-year case unwarned, which is
 * the case this app exists to get right.
 */
export async function countMissingProperty(taxYear: number): Promise<number> {
  const paidByExpense = await paidByExpenseInYear(taxYear);
  const rows = await expensesByIds([...paidByExpense.keys()]);

  let count = 0;
  for (const [expenseId, paidCents] of paidByExpense) {
    const expense = rows.get(expenseId);
    if (!expense || paidCents === 0) continue;
    if (needsPropertyOrSplit(expense.propertyId, expense.allocationRule as AllocationRule | null)) {
      count += 1;
    }
  }
  return count;
}
