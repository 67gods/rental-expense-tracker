/**
 * Contractor W-9 tracking (brief §5.6).
 *
 * A contractor paid at or above the reporting threshold in a calendar year
 * without a W-9 on file becomes a persistent dashboard warning from October
 * onward - late enough not to nag in the spring, early enough to still chase
 * the paperwork before year end.
 *
 * The threshold is read per tax year, never from a global default. It was $600
 * through 2025 and is $2,000 for payments made after 31 December 2025 under
 * OBBBA. Applying one year's figure to another year's payments is exactly how
 * a household files a 1099 it did not owe, or misses one it did.
 */

import { formatCents } from '../money';
import { thresholdsFor } from '../constants/thresholds';

export type ContractorWarningSeverity = 'info' | 'warning';

export interface ContractorYearTotal {
  actorId: string;
  name: string;
  w9OnFile: boolean;
  taxIdCollected: boolean;
  paidCents: number;
  taxYear: number;
}

export interface ContractorWarning {
  actorId: string;
  name: string;
  paidCents: number;
  taxYear: number;
  severity: ContractorWarningSeverity;
  message: string;
  /** True once the persistent October-onward window has started. */
  isPersistent: boolean;
}

/**
 * Running total paid to each contractor in a calendar year, from expense rows
 * attributed to a contractor actor.
 */
export function contractorYearTotals(
  expenses: readonly {
    contractorActorId: string | null;
    amountCents: number;
    date: string;
  }[],
  contractors: readonly {
    id: string;
    name: string;
    w9OnFile: boolean;
    taxIdCollected: boolean;
  }[],
  taxYear: number,
): ContractorYearTotal[] {
  const totals = new Map<string, number>();

  for (const expense of expenses) {
    if (!expense.contractorActorId) continue;
    if (yearOf(expense.date) !== taxYear) continue;
    totals.set(
      expense.contractorActorId,
      (totals.get(expense.contractorActorId) ?? 0) + expense.amountCents,
    );
  }

  return contractors
    .map((c) => ({
      actorId: c.id,
      name: c.name,
      w9OnFile: c.w9OnFile,
      taxIdCollected: c.taxIdCollected,
      paidCents: totals.get(c.id) ?? 0,
      taxYear,
    }))
    .sort((a, b) => b.paidCents - a.paidCents || a.name.localeCompare(b.name));
}

/**
 * Raises a warning per contractor over the threshold without a W-9.
 *
 * Before the persistent window opens the same condition is reported as `info`,
 * so it is visible on the contractor record year-round without taking over the
 * dashboard.
 */
export function contractorW9Warnings(
  totals: readonly ContractorYearTotal[],
  asOf: Date,
  taxYear: number,
): ContractorWarning[] {
  // No default argument. The reporting threshold moved from $600 to $2,000
  // between 2025 and 2026, so a caller that does not say which year it means
  // is a bug, and it should be a compile error rather than a quiet answer.
  const thresholds = thresholdsFor(taxYear);
  const month = asOf.getMonth() + 1; // getMonth is zero-based
  const isPersistent = month >= thresholds.w9WarningStartMonth;

  return totals
    .filter(
      (t) => !t.w9OnFile && t.paidCents >= thresholds.w9ReportingThresholdCents,
    )
    .map((t) => ({
      actorId: t.actorId,
      name: t.name,
      paidCents: t.paidCents,
      taxYear: t.taxYear,
      severity: isPersistent ? ('warning' as const) : ('info' as const),
      isPersistent,
      message: `${t.name} has been paid ${formatCents(t.paidCents)} in ${t.taxYear} with no W-9 on file.`,
    }))
    .sort((a, b) => b.paidCents - a.paidCents);
}

/** Whether a contractor's paid total has reached that year's reporting threshold. */
export function needsW9(
  paidCents: number,
  w9OnFile: boolean,
  taxYear: number,
): boolean {
  return !w9OnFile && paidCents >= thresholdsFor(taxYear).w9ReportingThresholdCents;
}

function yearOf(isoDate: string): number {
  // Dates are stored as plain YYYY-MM-DD in the household timezone, so the year
  // is read off the string. Parsing to a Date would reintroduce UTC drift and
  // move a 31 December payment into the following tax year.
  const year = Number(isoDate.slice(0, 4));
  if (!Number.isInteger(year)) {
    throw new TypeError(`Expected a YYYY-MM-DD date, received: "${isoDate}"`);
  }
  return year;
}
