/**
 * Payments against an expense.
 *
 * An expense is an OBLIGATION - one invoice, one vendor, one total. A payment
 * is a CASH EVENT. On the cash basis a cost is deducted in the year the money
 * left, so a single date on the expense cannot represent an invoice settled
 * across two years.
 *
 * The case this exists for: an $8,244.00 invoice with $2,500.00 paid in
 * December and $5,750.00 paid the following year. Recording it as one 2025
 * expense overstates that year by $5,744.00; recording only the $2,500.00 loses
 * the obligation entirely. Both figures have to be kept, and only the paid part
 * reaches a report.
 *
 * A SCHEDULED payment is one the owner intends to make and has not made. It is
 * a plan, not a cash event, so it is excluded from every total here. It becomes
 * deductible when it is confirmed paid and not a day earlier.
 */

import { assertIsoDate, addDays, isWithin, taxYearRange } from '../dates';
import { sumCents } from '../money';

export class PaymentError extends Error {
  override readonly name = 'PaymentError';
}

/** The minimum a payment rule needs to know. */
export interface PaymentLike {
  paidDate: string;
  amountCents: number;
  /** Planned but not yet made. Never counted as paid. */
  isScheduled: boolean;
}

/** A payment that has actually happened. */
function isSettled(payment: PaymentLike): boolean {
  return !payment.isScheduled;
}

/**
 * What was actually paid in a tax year.
 *
 * This is the figure every expense-derived report uses, in place of the
 * expense's own amount.
 */
export function paidInYear(
  payments: readonly PaymentLike[],
  taxYear: number,
): number {
  const range = taxYearRange(taxYear);
  return sumCents(
    payments
      .filter((p) => isSettled(p) && isWithin(assertIsoDate(p.paidDate, 'paidDate'), range))
      .map((p) => p.amountCents),
  );
}

/** Everything settled to date, in any year. */
export function paidToDate(payments: readonly PaymentLike[]): number {
  return sumCents(payments.filter(isSettled).map((p) => p.amountCents));
}

/** Payments planned but not yet made, in any year. */
export function scheduledCents(payments: readonly PaymentLike[]): number {
  return sumCents(payments.filter((p) => !isSettled(p)).map((p) => p.amountCents));
}

/**
 * What is still owed on the invoice.
 *
 * Scheduled payments do not reduce this: money that has not moved is still
 * owed. They are reported separately by `scheduledCents` so a screen can show
 * "outstanding, of which planned".
 */
export function outstandingCents(
  invoiceTotalCents: number,
  payments: readonly PaymentLike[],
): number {
  return Math.max(0, invoiceTotalCents - paidToDate(payments));
}

/** True when the settled payments account for the whole invoice. */
export function isFullyPaid(
  invoiceTotalCents: number,
  payments: readonly PaymentLike[],
): boolean {
  return paidToDate(payments) >= invoiceTotalCents;
}

/**
 * Rejects a payment set that claims more than the invoice.
 *
 * Scheduled rows count here even though they count nowhere else: planning to
 * pay $6,000 against a $5,000 invoice is a data-entry mistake worth catching at
 * the point it is made, not a legitimate future state.
 */
export function assertPaymentsWithinTotal(
  invoiceTotalCents: number,
  payments: readonly PaymentLike[],
): void {
  const committed = paidToDate(payments) + scheduledCents(payments);
  if (committed > invoiceTotalCents) {
    throw new PaymentError(
      `These payments come to ${(committed / 100).toFixed(2)}, which is more than the ` +
        `invoice total of ${(invoiceTotalCents / 100).toFixed(2)}. Change the invoice ` +
        `total if it was wrong, or correct the payment.`,
    );
  }
}

/**
 * The remainder of an invoice as a scheduled payment, which is the owner's
 * "push the rest to next year automatically".
 *
 * Returns null when nothing is left to schedule. The date is a starting point
 * the owner is expected to change - it deliberately lands in the middle of
 * January rather than on the 1st, because the 1st reads like a computed
 * deadline and the 15th reads like a suggestion.
 */
export function scheduleRemainder(
  invoiceTotalCents: number,
  payments: readonly PaymentLike[],
  taxYear: number,
): { paidDate: string; amountCents: number; isScheduled: true } | null {
  const committed = paidToDate(payments) + scheduledCents(payments);
  const remainder = invoiceTotalCents - committed;
  if (remainder <= 0) return null;

  return {
    paidDate: `${taxYear + 1}-01-15`,
    amountCents: remainder,
    isScheduled: true,
  };
}

/**
 * Splits a remainder into equal monthly instalments that sum back exactly.
 *
 * Used by the instalment UI when the owner says "six payments" rather than
 * entering each by hand. Any rounding remainder lands on the first payment, so
 * the total is exact and the odd cent is paid soonest rather than last.
 */
export function instalmentPlan(
  remainderCents: number,
  count: number,
  firstDate: string,
): { paidDate: string; amountCents: number; isScheduled: true }[] {
  assertIsoDate(firstDate, 'firstDate');
  if (!Number.isInteger(count) || count < 1) {
    throw new PaymentError('An instalment plan needs at least one payment.');
  }
  if (!Number.isInteger(remainderCents) || remainderCents <= 0) {
    throw new PaymentError('There is nothing left to spread over instalments.');
  }

  const base = Math.floor(remainderCents / count);
  const leftover = remainderCents - base * count;

  return Array.from({ length: count }, (_, i) => ({
    paidDate: addMonths(firstDate, i),
    amountCents: i === 0 ? base + leftover : base,
    isScheduled: true as const,
  }));
}

/**
 * Adds whole months to a business date, clamping to the end of a short month.
 *
 * 31 January plus one month is 28 February, not 3 March. Rolling into the next
 * month would drift a plan a day at a time and, on a December instalment, into
 * the wrong tax year.
 */
function addMonths(isoDate: string, months: number): string {
  if (months === 0) return isoDate;
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const target = m - 1 + months;
  const year = y + Math.floor(target / 12);
  const month = ((target % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Re-exported so callers building a plan need only this module. */
export { addDays };
