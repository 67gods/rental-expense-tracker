import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import {
  assertPaymentsWithinTotal,
  createExpensePaymentSchema,
  instalmentPlan,
  isFullyPaid,
  outstandingCents,
  paidInYear,
  paidToDate,
  planInstalmentsSchema,
  scheduledCents,
  scheduleRemainder,
  taxYearRange,
  updateExpensePaymentSchema,
  type CreateExpensePaymentInput,
  type PaymentLike,
  type PlanInstalmentsInput,
  type UpdateExpensePaymentInput,
} from '@rental/domain';
import { getDb, withTransaction } from '@/db/client';
import { expensePayments, expenses, type ExpensePayment } from '@/db/schema';
import { NotFoundError, ValidationError } from '../errors';

/**
 * Payments against an expense.
 *
 * Every invariant lives here rather than in the form, because the form is not
 * the only way rows arrive - the API surface and the 2025 import write here
 * too. Three rules hold:
 *
 * 1. An expense with a positive amount always has at least one payment row.
 *    The last one cannot be deleted; it is edited instead.
 * 2. Payments, settled and scheduled together, never exceed the invoice total.
 * 3. A scheduled payment is a plan. It reaches no report until confirmed, which
 *    is what lets the remainder of an invoice sit in next year without being
 *    deducted a year early.
 */

export async function listPaymentsFor(expenseId: string): Promise<ExpensePayment[]> {
  return getDb()
    .select()
    .from(expensePayments)
    .where(eq(expensePayments.expenseId, expenseId))
    .orderBy(asc(expensePayments.paidDate), asc(expensePayments.createdAt));
}

/** Payments across many expenses in one query, for lists and exports. */
export async function listPayments(
  filter: { taxYear?: number; includeScheduled?: boolean; limit?: number } = {},
): Promise<ExpensePayment[]> {
  const conditions = [];
  if (filter.taxYear) {
    const range = taxYearRange(filter.taxYear);
    conditions.push(
      gte(expensePayments.paidDate, range.start),
      lte(expensePayments.paidDate, range.end),
    );
  }
  if (!filter.includeScheduled) {
    conditions.push(eq(expensePayments.isScheduled, false));
  }

  return getDb()
    .select()
    .from(expensePayments)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(expensePayments.paidDate))
    .limit(filter.limit ?? 5000);
}

export interface PaymentSummary {
  payments: ExpensePayment[];
  invoiceTotalCents: number;
  paidToDateCents: number;
  scheduledCents: number;
  outstandingCents: number;
  isFullyPaid: boolean;
  /** True when there is more than one row, i.e. the invoice was actually split. */
  isSplit: boolean;
}

/** Everything the expense detail screen needs to decide what to show. */
export async function paymentSummary(expenseId: string): Promise<PaymentSummary> {
  const [expense, payments] = await Promise.all([
    getExpenseRow(expenseId),
    listPaymentsFor(expenseId),
  ]);

  return {
    payments,
    invoiceTotalCents: expense.amountCents,
    paidToDateCents: paidToDate(payments),
    scheduledCents: scheduledCents(payments),
    outstandingCents: outstandingCents(expense.amountCents, payments),
    isFullyPaid: isFullyPaid(expense.amountCents, payments),
    isSplit: payments.length > 1,
  };
}

/** What actually left the bank in a year, per expense. Used by every report. */
export async function paidByExpenseInYear(
  taxYear: number,
): Promise<Map<string, number>> {
  const range = taxYearRange(taxYear);
  const rows = await getDb()
    .select({
      expenseId: expensePayments.expenseId,
      total: sql<string>`sum(${expensePayments.amountCents})`,
    })
    .from(expensePayments)
    .where(
      and(
        eq(expensePayments.isScheduled, false),
        gte(expensePayments.paidDate, range.start),
        lte(expensePayments.paidDate, range.end),
      ),
    )
    .groupBy(expensePayments.expenseId);

  return new Map(rows.map((r) => [r.expenseId, Number(r.total)]));
}

export async function createPayment(
  input: CreateExpensePaymentInput,
): Promise<ExpensePayment> {
  const data = createExpensePaymentSchema.parse(input);

  return withTransaction(async (tx) => {
    const expense = await getExpenseRow(data.expenseId, tx);
    const existing = await tx
      .select()
      .from(expensePayments)
      .where(eq(expensePayments.expenseId, data.expenseId));

    assertWithinTotal(expense.amountCents, [...existing, toPaymentLike(data)]);

    const [row] = await tx
      .insert(expensePayments)
      .values({
        expenseId: data.expenseId,
        paidDate: data.paidDate,
        amountCents: data.amountCents,
        isScheduled: data.isScheduled,
        method: data.method,
        reference: data.reference,
        receiptKey: data.receiptKey,
        notes: data.notes,
      })
      .returning();

    if (!row) throw new Error('The payment was not saved.');
    return row;
  });
}

export async function updatePayment(
  input: UpdateExpensePaymentInput,
): Promise<ExpensePayment> {
  const data = updateExpensePaymentSchema.parse(input);

  return withTransaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(expensePayments)
      .where(eq(expensePayments.id, data.id))
      .limit(1);
    if (!current) throw new NotFoundError('That payment no longer exists.');

    const expense = await getExpenseRow(current.expenseId, tx);
    const siblings = (
      await tx
        .select()
        .from(expensePayments)
        .where(eq(expensePayments.expenseId, current.expenseId))
    ).filter((p) => p.id !== data.id);

    const next = {
      paidDate: data.paidDate ?? current.paidDate,
      amountCents: data.amountCents ?? current.amountCents,
      isScheduled: data.isScheduled ?? current.isScheduled,
    };
    assertWithinTotal(expense.amountCents, [...siblings, next]);

    const [row] = await tx
      .update(expensePayments)
      .set({
        ...next,
        method: data.method === undefined ? current.method : data.method,
        reference: data.reference === undefined ? current.reference : data.reference,
        receiptKey: data.receiptKey === undefined ? current.receiptKey : data.receiptKey,
        notes: data.notes === undefined ? current.notes : data.notes,
        updatedAt: new Date(),
      })
      .where(eq(expensePayments.id, data.id))
      .returning();

    if (!row) throw new NotFoundError('That payment no longer exists.');
    return row;
  });
}

/**
 * Deletes a payment, refusing to remove the last one.
 *
 * An expense with no payment reads as never paid, which would silently drop it
 * out of every report. Editing the remaining row is what the owner means when
 * they try to delete it.
 */
export async function deletePayment(id: string): Promise<void> {
  await withTransaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(expensePayments)
      .where(eq(expensePayments.id, id))
      .limit(1);
    if (!current) throw new NotFoundError('That payment no longer exists.');

    const siblings = await tx
      .select({ id: expensePayments.id })
      .from(expensePayments)
      .where(eq(expensePayments.expenseId, current.expenseId));

    if (siblings.length <= 1) {
      throw new ValidationError(
        'This is the only payment on the expense, and an expense with no payment reads as never paid. Edit the amount or the date instead, or delete the whole expense.',
      );
    }

    await tx.delete(expensePayments).where(eq(expensePayments.id, id));
  });
}

/**
 * Spreads the unpaid remainder over equal monthly instalments.
 *
 * This is the "push the rest to next year" action. Every row it writes is
 * scheduled, so none of it is deductible until the owner confirms it.
 */
export async function planInstalments(
  input: PlanInstalmentsInput,
): Promise<ExpensePayment[]> {
  const data = planInstalmentsSchema.parse(input);

  return withTransaction(async (tx) => {
    const expense = await getExpenseRow(data.expenseId, tx);
    const existing = await tx
      .select()
      .from(expensePayments)
      .where(eq(expensePayments.expenseId, data.expenseId));

    const committed = paidToDate(existing) + scheduledCents(existing);
    const remainder = expense.amountCents - committed;
    if (remainder <= 0) {
      throw new ValidationError(
        'This invoice is already fully accounted for, so there is nothing left to spread.',
      );
    }

    const plan = instalmentPlan(remainder, data.count, data.firstDate);
    return tx
      .insert(expensePayments)
      .values(
        plan.map((p) => ({
          expenseId: data.expenseId,
          paidDate: p.paidDate,
          amountCents: p.amountCents,
          isScheduled: true,
        })),
      )
      .returning();
  });
}

/** Marks a scheduled payment as actually made. */
export async function confirmPayment(
  id: string,
  paidDate?: string,
): Promise<ExpensePayment> {
  return updatePayment({ id, isScheduled: false, ...(paidDate ? { paidDate } : {}) });
}

/** The remainder as a single scheduled row, for the one-click case. */
export async function suggestRemainder(expenseId: string, taxYear: number) {
  const [expense, payments] = await Promise.all([
    getExpenseRow(expenseId),
    listPaymentsFor(expenseId),
  ]);
  return scheduleRemainder(expense.amountCents, payments, taxYear);
}

/** Scheduled payments falling in a year, for the year-end screen. */
export async function outstandingScheduled(taxYear: number): Promise<ExpensePayment[]> {
  const range = taxYearRange(taxYear);
  return getDb()
    .select()
    .from(expensePayments)
    .where(
      and(
        eq(expensePayments.isScheduled, true),
        gte(expensePayments.paidDate, range.start),
        lte(expensePayments.paidDate, range.end),
      ),
    )
    .orderBy(asc(expensePayments.paidDate));
}

/** Re-exported so callers do not need the domain package for one figure. */
export { paidInYear };

// --- internals --------------------------------------------------------------

type Queryable = Pick<ReturnType<typeof getDb>, 'select'>;

async function getExpenseRow(id: string, tx?: Queryable) {
  const [row] = await (tx ?? getDb())
    .select({ id: expenses.id, amountCents: expenses.amountCents })
    .from(expenses)
    .where(eq(expenses.id, id))
    .limit(1);
  if (!row) throw new NotFoundError('That expense no longer exists.');
  return row;
}

function toPaymentLike(data: {
  paidDate: string;
  amountCents: number;
  isScheduled: boolean;
}): PaymentLike {
  return data;
}

/** Turns the domain's PaymentError into the app's user-facing ValidationError. */
function assertWithinTotal(invoiceTotalCents: number, payments: readonly PaymentLike[]) {
  try {
    assertPaymentsWithinTotal(invoiceTotalCents, payments);
  } catch (error) {
    throw new ValidationError(
      error instanceof Error ? error.message : 'Those payments do not add up.',
    );
  }
}
