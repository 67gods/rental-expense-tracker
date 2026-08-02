import { describe, expect, it } from 'vitest';
import {
  instalmentPlan,
  isFullyPaid,
  outstandingCents,
  paidInYear,
  paidToDate,
  PaymentError,
  scheduledCents,
  scheduleRemainder,
  assertPaymentsWithinTotal,
  type PaymentLike,
} from '../src/rules/payments';

/**
 * The fixture is a real invoice: $8,244.00 of work, $2,500.00 paid in December
 * 2025 and the balance settled across 2026. Recording it as one 2025 expense
 * would overstate that year by $5,744.00.
 */
const INVOICE_TOTAL = 824_400;

const paid = (paidDate: string, amountCents: number): PaymentLike => ({
  paidDate,
  amountCents,
  isScheduled: false,
});
const planned = (paidDate: string, amountCents: number): PaymentLike => ({
  paidDate,
  amountCents,
  isScheduled: true,
});

describe('paidInYear', () => {
  const payments = [paid('2025-12-19', 250_000), planned('2026-03-15', 574_400)];

  it('counts only what actually left the bank in the year', () => {
    expect(paidInYear(payments, 2025)).toBe(250_000);
  });

  it('does not count a scheduled payment as paid', () => {
    // The 2026 money is planned, not spent. It reaches no report until confirmed.
    expect(paidInYear(payments, 2026)).toBe(0);
  });

  it('counts it once it is confirmed', () => {
    const confirmed = [paid('2025-12-19', 250_000), paid('2026-03-15', 574_400)];
    expect(paidInYear(confirmed, 2026)).toBe(574_400);
  });

  it('keeps a 31 December payment out of the following year', () => {
    const newYearsEve = [paid('2025-12-31', 100_000)];
    expect(paidInYear(newYearsEve, 2025)).toBe(100_000);
    expect(paidInYear(newYearsEve, 2026)).toBe(0);
  });

  it('keeps a 1 January payment out of the preceding year', () => {
    const newYearsDay = [paid('2026-01-01', 100_000)];
    expect(paidInYear(newYearsDay, 2025)).toBe(0);
    expect(paidInYear(newYearsDay, 2026)).toBe(100_000);
  });

  it('returns zero for a year with no payments rather than throwing', () => {
    expect(paidInYear(payments, 2024)).toBe(0);
  });

  it('rejects a malformed date rather than misfiling the payment', () => {
    expect(() => paidInYear([paid('Dec 2025', 100)], 2025)).toThrow();
  });

  it('handles an expense with no payments at all', () => {
    expect(paidInYear([], 2025)).toBe(0);
  });
});

describe('outstanding and paid totals', () => {
  it('treats a scheduled payment as still owed, because the money has not moved', () => {
    const payments = [paid('2025-12-19', 250_000), planned('2026-03-15', 574_400)];
    expect(paidToDate(payments)).toBe(250_000);
    expect(scheduledCents(payments)).toBe(574_400);
    expect(outstandingCents(INVOICE_TOTAL, payments)).toBe(574_400);
    expect(isFullyPaid(INVOICE_TOTAL, payments)).toBe(false);
  });

  it('is fully paid once the settled payments cover the invoice', () => {
    const payments = [paid('2025-12-19', 250_000), paid('2026-03-15', 574_400)];
    expect(outstandingCents(INVOICE_TOTAL, payments)).toBe(0);
    expect(isFullyPaid(INVOICE_TOTAL, payments)).toBe(true);
  });

  it('never reports a negative outstanding balance', () => {
    // A tip or an overpayment leaves nothing owed, not minus something owed.
    const overpaid = [paid('2025-12-19', INVOICE_TOTAL + 600)];
    expect(outstandingCents(INVOICE_TOTAL, overpaid)).toBe(0);
  });
});

describe('assertPaymentsWithinTotal', () => {
  it('accepts payments that exactly settle the invoice', () => {
    expect(() =>
      assertPaymentsWithinTotal(INVOICE_TOTAL, [
        paid('2025-12-19', 250_000),
        planned('2026-03-15', 574_400),
      ]),
    ).not.toThrow();
  });

  it('rejects payments that come to more than the invoice', () => {
    expect(() =>
      assertPaymentsWithinTotal(INVOICE_TOTAL, [paid('2025-12-19', INVOICE_TOTAL + 1)]),
    ).toThrow(PaymentError);
  });

  it('counts scheduled rows toward the ceiling, since planning to overpay is a typo', () => {
    expect(() =>
      assertPaymentsWithinTotal(INVOICE_TOTAL, [
        paid('2025-12-19', 250_000),
        planned('2026-03-15', 600_000),
      ]),
    ).toThrow(/more than the invoice total/);
  });
});

describe('scheduleRemainder - "push the rest to next year"', () => {
  it('proposes the unpaid balance dated in the following year', () => {
    const remainder = scheduleRemainder(INVOICE_TOTAL, [paid('2025-12-19', 250_000)], 2025);
    expect(remainder).toEqual({
      paidDate: '2026-01-15',
      amountCents: 574_400,
      isScheduled: true,
    });
  });

  it('returns null when the invoice is already settled', () => {
    expect(scheduleRemainder(INVOICE_TOTAL, [paid('2025-12-19', INVOICE_TOTAL)], 2025)).toBeNull();
  });

  it('returns null when the remainder is already scheduled', () => {
    const payments = [paid('2025-12-19', 250_000), planned('2026-03-15', 574_400)];
    expect(scheduleRemainder(INVOICE_TOTAL, payments, 2025)).toBeNull();
  });

  it('proposes the whole invoice when nothing has been paid', () => {
    expect(scheduleRemainder(INVOICE_TOTAL, [], 2025)?.amountCents).toBe(INVOICE_TOTAL);
  });
});

describe('instalmentPlan', () => {
  it('splits a remainder into equal payments that sum back exactly', () => {
    const plan = instalmentPlan(574_400, 4, '2026-01-15');
    expect(plan).toHaveLength(4);
    expect(plan.reduce((t, p) => t + p.amountCents, 0)).toBe(574_400);
    expect(plan.map((p) => p.paidDate)).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
      '2026-04-15',
    ]);
  });

  it('puts an indivisible remainder on the first payment, not the last', () => {
    const plan = instalmentPlan(1_000, 3, '2026-01-15');
    expect(plan.map((p) => p.amountCents)).toEqual([334, 333, 333]);
    expect(plan.reduce((t, p) => t + p.amountCents, 0)).toBe(1_000);
  });

  it('clamps to the end of a short month rather than rolling into the next', () => {
    // 31 January + 1 month is 28 February. Rolling to 3 March would drift the
    // plan, and on a December instalment it would drift the tax year.
    const plan = instalmentPlan(300, 3, '2026-01-31');
    expect(plan.map((p) => p.paidDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('crosses a year boundary correctly', () => {
    const plan = instalmentPlan(300, 3, '2025-11-30');
    expect(plan.map((p) => p.paidDate)).toEqual(['2025-11-30', '2025-12-30', '2026-01-30']);
  });

  it('marks every instalment as scheduled, so none of them is deductible yet', () => {
    expect(instalmentPlan(574_400, 4, '2026-01-15').every((p) => p.isScheduled)).toBe(true);
  });

  it('rejects a plan with no payments or nothing to spread', () => {
    expect(() => instalmentPlan(1_000, 0, '2026-01-15')).toThrow(PaymentError);
    expect(() => instalmentPlan(0, 3, '2026-01-15')).toThrow(PaymentError);
  });
});

describe('the whole invoice, end to end', () => {
  it('reports $2,500.00 in 2025 and $5,750.00 in 2026 - not $8,244.00 in either', () => {
    const payments = [paid('2025-12-19', 250_000), ...instalmentPlan(574_400, 1, '2026-03-15')];

    expect(paidInYear(payments, 2025)).toBe(250_000);
    expect(paidInYear(payments, 2026)).toBe(0); // still only planned

    const confirmed = payments.map((p) => ({ ...p, isScheduled: false }));
    expect(paidInYear(confirmed, 2026)).toBe(574_400);
    expect(paidInYear(confirmed, 2025) + paidInYear(confirmed, 2026)).toBe(INVOICE_TOTAL);
  });
});
