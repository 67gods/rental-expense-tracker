/**
 * Which side of the placed-in-service line a cost fell on.
 *
 * "Placed in service" means ready and available to rent. It is not the day the
 * property was bought and not the day a tenant moved in. On one of the
 * household's properties those are three separate dates - acquired 17 November,
 * listed 2 December, first occupied the following March - and spend either side
 * of the middle one is treated differently.
 *
 * THIS MODULE DECIDES NOTHING ABOUT TAX. It compares two dates and returns a
 * label. Whether an acquisition-side cost is capitalised, added to basis, or
 * treated some other way is the CPA's call; the app's job is to hand over the
 * spend already sorted so the question can be asked at all. Sorting 75 rows by
 * hand in April is how the question stops being asked.
 */

import { assertIsoDate } from '../dates';
import type { CostTreatment } from '../constants/captureLists';

export interface CostTreatmentResult {
  treatment: CostTreatment;
  /** True when the owner set it by hand rather than it being derived. */
  isOverridden: boolean;
  /** Plain sentence for the UI and the export. No tax advice. */
  explanation: string;
}

/**
 * Derives the treatment, unless the owner has overridden it.
 *
 * With no placed-in-service date on record the answer is `operating`: that is
 * the ordinary case, and a property with no date recorded is far more likely to
 * be one that has been rented for years than one still being made ready. The
 * integrity audit reports properties missing the date, so the gap is chased
 * rather than papered over here.
 */
export function costTreatmentFor(
  recordDate: string,
  placedInServiceDate: string | null | undefined,
  override?: CostTreatment | null,
): CostTreatmentResult {
  assertIsoDate(recordDate, 'recordDate');

  if (override) {
    return {
      treatment: override,
      isOverridden: true,
      explanation:
        override === 'acquisition'
          ? 'Marked by hand as acquisition-side spend.'
          : 'Marked by hand as operating spend.',
    };
  }

  if (!placedInServiceDate) {
    return {
      treatment: 'operating',
      isOverridden: false,
      explanation:
        'Treated as operating: no placed-in-service date is recorded for this property.',
    };
  }

  assertIsoDate(placedInServiceDate, 'placedInServiceDate');

  // String comparison is safe and correct for ISO dates, and keeps a 31
  // December cost out of the next year, which parsing to a Date would not.
  if (recordDate < placedInServiceDate) {
    return {
      treatment: 'acquisition',
      isOverridden: false,
      explanation: `Spent before the property was available to rent on ${placedInServiceDate}.`,
    };
  }

  return {
    treatment: 'operating',
    isOverridden: false,
    explanation: `Spent after the property became available to rent on ${placedInServiceDate}.`,
  };
}

/** Convenience for callers that only want the label. */
export function costTreatmentLabel(
  recordDate: string,
  placedInServiceDate: string | null | undefined,
  override?: CostTreatment | null,
): CostTreatment {
  return costTreatmentFor(recordDate, placedInServiceDate, override).treatment;
}

/**
 * Splits records into the two sides, keeping the whole record on each side.
 *
 * Used by the job rollup and the exports. Neither side is discarded: the point
 * is that both are visible and add back to the total.
 */
export function splitByCostTreatment<T extends { date: string }>(
  records: readonly T[],
  placedInServiceDate: string | null | undefined,
  overrideOf: (record: T) => CostTreatment | null | undefined = () => null,
): { operating: T[]; acquisition: T[] } {
  const operating: T[] = [];
  const acquisition: T[] = [];

  for (const record of records) {
    const { treatment } = costTreatmentFor(
      record.date,
      placedInServiceDate,
      overrideOf(record),
    );
    if (treatment === 'acquisition') acquisition.push(record);
    else operating.push(record);
  }

  return { operating, acquisition };
}
