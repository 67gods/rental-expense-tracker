/**
 * Straight-line depreciation on a schedule the owner supplies.
 *
 * READ THIS BEFORE ASSUMING THE APP HAS STARTED DOING TAX.
 *
 * It has not. The owner enters two facts that only they can know - the month
 * the property started depreciating, and the full-year amount their CPA is
 * running - and this module does the one piece of arithmetic that follows from
 * them: which slice of that full-year amount belongs to a given tax year.
 *
 * The middle years are the easy part and they are the reason this exists. Under
 * straight-line recovery every year between the first and the last gets exactly
 * the same figure, so the owner should not have to re-enter it annually or wait
 * on the CPA to see a number that has not changed since 2019. The first and last
 * years are the ones that are not flat, and those follow the mid-month
 * convention: property is treated as placed in service in the middle of its
 * first month, so a January start earns 11.5 months, a December start 0.5.
 *
 * What is NOT decided here, ever:
 *
 *   - the depreciable basis. Land does not depreciate and the split is the
 *     CPA's; the app holds `land_value_cents` and stops.
 *   - the recovery period. 27.5 years is the residential default and is passed
 *     in, not assumed silently - a cost-segregation study or a commercial
 *     property has different ones.
 *   - the answer, when the CPA has sent one. A transcribed figure always wins
 *     over anything computed here; see `buildScheduleE`.
 *
 * So this is the owner's own working, shown so it can be checked against the
 * return - not a substitute for the return.
 */

/** Residential rental real property under MACRS. */
export const RESIDENTIAL_RECOVERY_YEARS = 27.5;

export interface DepreciationSchedule {
  /** 1-12. The month the property was placed in service. */
  startMonth: number;
  startYear: number;
  /** The flat full-year figure. Every middle year gets exactly this. */
  annualCents: number;
  /** Defaults to 27.5. Passed in so a different class is possible later. */
  recoveryYears?: number;
}

/**
 * Which part of the recovery a year falls in.
 *
 * `before` and `after` are both zero and are kept apart because they read
 * differently to a person: one is a property that has not started depreciating,
 * the other is one that has finished.
 */
export type DepreciationPhase = 'before' | 'first' | 'full' | 'final' | 'after';

export interface DepreciationYear {
  cents: number;
  phase: DepreciationPhase;
  /** Months of the full-year amount this year earns. 12 in a middle year. */
  months: number;
  /** One sentence saying how `cents` was arrived at, for a tooltip. */
  explanation: string;
}

export class DepreciationError extends Error {
  override readonly name = 'DepreciationError';
}

/**
 * The depreciation a single tax year earns under `schedule`.
 *
 * Rounded to whole cents per year rather than distributed across the whole
 * recovery, because each year is filed on its own and a year has to agree with
 * the return it appears on. The half-cent that convention can leave against the
 * total over 28 years is not a figure anybody reports.
 */
export function depreciationForYear(
  schedule: DepreciationSchedule,
  taxYear: number,
): DepreciationYear {
  const { startMonth, startYear, annualCents } = schedule;
  const recoveryYears = schedule.recoveryYears ?? RESIDENTIAL_RECOVERY_YEARS;

  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
    throw new DepreciationError(`Start month must be 1-12, received: ${startMonth}`);
  }
  if (!Number.isInteger(annualCents)) {
    throw new DepreciationError(`Expected integer cents, received: ${annualCents}`);
  }
  if (recoveryYears <= 0) {
    throw new DepreciationError(`Recovery period must be positive, received: ${recoveryYears}`);
  }

  const monthLabel = MONTHS[startMonth - 1];

  if (taxYear < startYear) {
    return {
      cents: 0,
      phase: 'before',
      months: 0,
      explanation: `Depreciation starts ${monthLabel} ${startYear}, which is after ${taxYear}.`,
    };
  }

  // Mid-month convention: the first month counts as a half.
  const firstYearMonths = 12 - startMonth + 0.5;
  const firstYearFraction = firstYearMonths / 12;

  if (taxYear === startYear) {
    return {
      cents: Math.round(annualCents * firstYearFraction),
      phase: 'first',
      months: firstYearMonths,
      explanation: `First year. Placed in service ${monthLabel} ${startYear}, so the mid-month convention gives ${formatMonths(firstYearMonths)} of the ${centsPerYear(annualCents)} full-year figure.`,
    };
  }

  // What is left after the stub first year, and how it lands: whole years until
  // the remainder is under one, then a final stub that uses up the balance.
  const remainingAfterFirst = recoveryYears - firstYearFraction;
  const fullYears = Math.floor(remainingAfterFirst);
  const finalFraction = remainingAfterFirst - fullYears;
  const finalYear = startYear + fullYears + (finalFraction > 0 ? 1 : 0);

  if (taxYear <= startYear + fullYears) {
    return {
      cents: annualCents,
      phase: 'full',
      months: 12,
      explanation: `A full year of the ${recoveryYears}-year schedule that started ${monthLabel} ${startYear}. Flat until ${finalYear}.`,
    };
  }

  if (taxYear === finalYear) {
    return {
      cents: Math.round(annualCents * finalFraction),
      phase: 'final',
      months: Math.round(finalFraction * 12 * 100) / 100,
      explanation: `Last year of the ${recoveryYears}-year schedule. ${formatMonths(finalFraction * 12)} of the full-year figure remains.`,
    };
  }

  return {
    cents: 0,
    phase: 'after',
    months: 0,
    explanation: `Fully depreciated. The ${recoveryYears}-year schedule that started ${monthLabel} ${startYear} ran out in ${finalYear}.`,
  };
}

/**
 * The schedule for a property, or null when there is not enough to build one.
 *
 * The start defaults to the placed-in-service date, because that IS the date
 * depreciation starts - the explicit month and year exist only so a schedule
 * that began somewhere else (a conversion from a home, a basis restated after
 * an amended return) can say so without moving the in-service date, which
 * decides other things.
 */
export function resolveDepreciationSchedule(property: {
  depreciationStartMonth: number | null;
  depreciationStartYear: number | null;
  annualDepreciationCents: number | null;
  placedInServiceDate: string | null;
}): DepreciationSchedule | null {
  if (!property.annualDepreciationCents) return null;

  const fromDate = property.placedInServiceDate;
  const startYear =
    property.depreciationStartYear ?? (fromDate ? Number(fromDate.slice(0, 4)) : null);
  const startMonth =
    property.depreciationStartMonth ?? (fromDate ? Number(fromDate.slice(5, 7)) : null);

  if (!startYear || !startMonth) return null;
  return { startMonth, startYear, annualCents: property.annualDepreciationCents };
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const DEPRECIATION_MONTHS: readonly { value: number; label: string }[] = MONTHS.map(
  (label, index) => ({ value: index + 1, label }),
);

function formatMonths(months: number): string {
  const rounded = Math.round(months * 100) / 100;
  return `${rounded} ${rounded === 1 ? 'month' : 'months'}`;
}

/** Local, because @rental/domain's money formatter is a sibling and this is a
    fragment of a sentence rather than a column of figures. */
function centsPerYear(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
