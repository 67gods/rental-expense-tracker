/**
 * Job rollups.
 *
 * A job is one real-world task - "buy a laptop for rental management" - and
 * time, miles, and money are its line items. The header holds no category, no
 * amount, and no tax field; everything tax-shaped lives on the children.
 *
 * That is what makes this file possible. Because nothing is stored on the job,
 * every figure below is derived at read time under the given year's rules, and
 * the same job can be summarised differently in two years without a single row
 * changing. A job that cached its own totals would be a stored answer to a
 * question whose rules move.
 *
 * The worked example, end to end:
 *
 *   Monday   40 min at the desk comparing models      (materials_purchase)
 *   Tuesday  35 min driving there and back            (travel, never eligible)
 *            25 min in the shop deciding and paying   (materials_purchase)
 *            18.4 miles
 *            $1,284.00 paid
 *
 * One job, five records, two dates, three entry actions.
 */

import { assertTaxYear } from '../dates';
import { sumCents } from '../money';
import { minutesToHours } from '../totals/hours';
import { deriveShEligible } from './eligibility';
import { paidInYear, type PaymentLike } from './payments';
import { costTreatmentFor } from './placedInService';
import type { CostTreatment } from '../constants/captureLists';
import type { CapitalClassification } from '../types';

export interface JobTimeEntry {
  date: string;
  minutes: number;
  category: string;
  linkedCapitalClassification?: CapitalClassification | null;
}

export interface JobTrip {
  date: string;
  miles: number;
  costTreatmentOverride?: CostTreatment | null;
}

export interface JobExpense {
  date: string;
  amountCents: number;
  payments: readonly PaymentLike[];
  costTreatmentOverride?: CostTreatment | null;
}

export interface JobChildren {
  timeEntries: readonly JobTimeEntry[];
  trips: readonly JobTrip[];
  expenses: readonly JobExpense[];
}

export interface JobRollup {
  taxYear: number;
  totalMinutes: number;
  eligibleMinutes: number;
  totalHours: number;
  eligibleHours: number;
  totalMiles: number;
  /** Miles driven before the property was available to rent. */
  acquisitionMiles: number;
  operatingMiles: number;
  /** Invoice totals of the job's expenses, whether paid or not. */
  invoicedCents: number;
  /** What actually left the bank in this tax year. The figure a report uses. */
  paidInYearCents: number;
  /** Committed but not yet paid. */
  outstandingCents: number;
  operatingSpendCents: number;
  acquisitionSpendCents: number;
  recordCount: number;
}

/**
 * Summarises a job's children under one year's rules.
 *
 * `placedInServiceDate` is the job's property's date, or null for a
 * portfolio-level job. Every cost-treatment split below flows from it.
 */
export function rollUpJob(
  children: JobChildren,
  taxYear: number,
  placedInServiceDate: string | null = null,
): JobRollup {
  assertTaxYear(taxYear);

  let totalMinutes = 0;
  let eligibleMinutes = 0;
  for (const entry of children.timeEntries) {
    totalMinutes += entry.minutes;
    // Recomputed, never read from a stored column. The stored value is a cache
    // and may have been written under an older rule set.
    const eligibility = deriveShEligible(
      {
        category: entry.category,
        linkedCapitalClassification: entry.linkedCapitalClassification ?? null,
      },
      taxYear,
    );
    if (eligibility.shEligible) eligibleMinutes += entry.minutes;
  }

  let acquisitionMiles = 0;
  let operatingMiles = 0;
  for (const trip of children.trips) {
    const { treatment } = costTreatmentFor(
      trip.date,
      placedInServiceDate,
      trip.costTreatmentOverride ?? null,
    );
    if (treatment === 'acquisition') acquisitionMiles += trip.miles;
    else operatingMiles += trip.miles;
  }

  let operatingSpendCents = 0;
  let acquisitionSpendCents = 0;
  let paidInYearCents = 0;
  let paidToDateCents = 0;
  for (const expense of children.expenses) {
    const paidThisYear = paidInYear(expense.payments, taxYear);
    paidInYearCents += paidThisYear;
    paidToDateCents += sumCents(
      expense.payments.filter((p) => !p.isScheduled).map((p) => p.amountCents),
    );

    const { treatment } = costTreatmentFor(
      expense.date,
      placedInServiceDate,
      expense.costTreatmentOverride ?? null,
    );
    if (treatment === 'acquisition') acquisitionSpendCents += paidThisYear;
    else operatingSpendCents += paidThisYear;
  }

  const invoicedCents = sumCents(children.expenses.map((e) => e.amountCents));

  return {
    taxYear,
    totalMinutes,
    eligibleMinutes,
    totalHours: minutesToHours(totalMinutes),
    eligibleHours: minutesToHours(eligibleMinutes),
    totalMiles: roundMiles(acquisitionMiles + operatingMiles),
    acquisitionMiles: roundMiles(acquisitionMiles),
    operatingMiles: roundMiles(operatingMiles),
    invoicedCents,
    paidInYearCents,
    outstandingCents: Math.max(0, invoicedCents - paidToDateCents),
    operatingSpendCents,
    acquisitionSpendCents,
    recordCount:
      children.timeEntries.length + children.trips.length + children.expenses.length,
  };
}

/**
 * A title for a job created implicitly from the record that started it.
 *
 * The owner never gets asked to name a job up front - a naming prompt at the
 * moment of saving is exactly the friction that stops people logging - so the
 * first record's own description becomes the title, trimmed to something that
 * fits a list row.
 */
export function jobTitleFrom(description: string, fallback = 'Untitled job'): string {
  const clean = description.trim().replace(/\s+/g, ' ');
  if (!clean) return fallback;
  if (clean.length <= 60) return clean;
  // Cut at a word boundary so the title does not end mid-word.
  const cut = clean.slice(0, 60);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 30 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
}

function roundMiles(miles: number): number {
  return Math.round(miles * 10) / 10;
}
