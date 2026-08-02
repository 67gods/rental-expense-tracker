/**
 * Hours rollups (brief §5.1, §5.4, §10).
 *
 * Acceptance criterion: eligible and total hours never appear as a single
 * merged number anywhere in the UI. That is enforced here by never returning
 * one - every summary carries both figures, and there is no "hours" field for a
 * caller to grab by accident.
 */

import { getHourCategory, type HourCategoryId } from '../constants/hourCategories';
import { DEFAULT_THRESHOLDS, type ThresholdSet } from '../constants/thresholds';

/** The minimum a rollup needs to know about a time entry. */
export interface HoursRollupEntry {
  minutes: number;
  category: string;
  shEligible: boolean;
  isProvisional?: boolean;
  actorId: string;
  propertyId?: string | null;
  date?: string;
}

export interface HoursTotals {
  /** Every minute logged, eligible or not. Always shown alongside eligible. */
  totalMinutes: number;
  /** Minutes that count toward the safe-harbor target. */
  eligibleMinutes: number;
  /**
   * Of `eligibleMinutes`, how many hang on an unresolved classification.
   * Surfaced as a caveat, never silently deducted.
   */
  provisionalEligibleMinutes: number;
  /**
   * Minutes logged against properties currently outside the enterprise, e.g.
   * triple-net or personal-use (§5.4). Included in total, excluded from
   * eligible.
   */
  excludedPropertyMinutes: number;
  entryCount: number;
}

export const EMPTY_HOURS_TOTALS: HoursTotals = {
  totalMinutes: 0,
  eligibleMinutes: 0,
  provisionalEligibleMinutes: 0,
  excludedPropertyMinutes: 0,
  entryCount: 0,
};

export interface HoursRollupOptions {
  /**
   * Properties that have dropped out of the enterprise for the year. Their
   * minutes are logged but never counted as eligible.
   */
  excludedPropertyIds?: readonly string[];
}

/** Converts minutes to hours rounded to two decimals, for display only. */
export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/** Formats minutes as "12h 30m". Used in lists and exports. */
export function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(Math.round(minutes));
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  if (hours === 0) return `${sign}${mins}m`;
  if (mins === 0) return `${sign}${hours}h`;
  return `${sign}${hours}h ${mins}m`;
}

/** Formats minutes as decimal hours for CSV export, e.g. "12.50". */
export function formatHoursDecimal(minutes: number): string {
  return (Math.round((minutes / 60) * 100) / 100).toFixed(2);
}

/**
 * Rolls a set of time entries into total and eligible minutes.
 *
 * `shEligible` is read from the entry rather than recomputed, because it was
 * derived at write time against the classification in force then. Recomputing
 * here would silently rewrite history.
 */
export function rollUpHours(
  entries: readonly HoursRollupEntry[],
  options: HoursRollupOptions = {},
): HoursTotals {
  const excluded = new Set(options.excludedPropertyIds ?? []);

  let totalMinutes = 0;
  let eligibleMinutes = 0;
  let provisionalEligibleMinutes = 0;
  let excludedPropertyMinutes = 0;

  for (const entry of entries) {
    if (!Number.isFinite(entry.minutes)) {
      throw new TypeError(`Time entry has non-numeric minutes: ${entry.minutes}`);
    }
    totalMinutes += entry.minutes;

    const isOnExcludedProperty =
      entry.propertyId != null && excluded.has(entry.propertyId);

    if (isOnExcludedProperty) {
      excludedPropertyMinutes += entry.minutes;
      continue;
    }

    if (entry.shEligible) {
      eligibleMinutes += entry.minutes;
      if (entry.isProvisional) provisionalEligibleMinutes += entry.minutes;
    }
  }

  return {
    totalMinutes,
    eligibleMinutes,
    provisionalEligibleMinutes,
    excludedPropertyMinutes,
    entryCount: entries.length,
  };
}

export interface SafeHarborProgress extends HoursTotals {
  targetHours: number;
  totalHours: number;
  eligibleHours: number;
  provisionalEligibleHours: number;
  /** Eligible progress toward the target, capped at 100 for display. */
  pctOfTarget: number;
  /** Eligible hours still needed. Zero once the target is reached. */
  remainingHours: number;
  targetMet: boolean;
}

/**
 * Progress toward the documented-hours target for an enterprise (§5.4).
 * Returns both hour figures; the caller must render both (§10).
 */
export function safeHarborProgress(
  entries: readonly HoursRollupEntry[],
  options: HoursRollupOptions & { thresholds?: ThresholdSet } = {},
): SafeHarborProgress {
  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
  const totals = rollUpHours(entries, options);
  const targetHours = thresholds.safeHarborHourTarget;
  const eligibleHours = minutesToHours(totals.eligibleMinutes);

  return {
    ...totals,
    targetHours,
    totalHours: minutesToHours(totals.totalMinutes),
    eligibleHours,
    provisionalEligibleHours: minutesToHours(totals.provisionalEligibleMinutes),
    pctOfTarget:
      targetHours <= 0
        ? 0
        : Math.min(100, Math.round((eligibleHours / targetHours) * 1000) / 10),
    remainingHours: Math.max(0, Math.round((targetHours - eligibleHours) * 100) / 100),
    targetMet: eligibleHours >= targetHours,
  };
}

export interface GroupedHours<K extends string = string> {
  key: K;
  label: string;
  totals: HoursTotals;
}

/**
 * Groups hours by actor. Spouses cannot pool hours for some tests, so a merged
 * log is unrecoverable after the fact (§4) - the year-end time log is always
 * produced per person.
 */
export function groupHoursByActor(
  entries: readonly HoursRollupEntry[],
  actorNames: ReadonlyMap<string, string>,
  options: HoursRollupOptions = {},
): GroupedHours[] {
  return groupBy(
    entries,
    (e) => e.actorId,
    (key) => actorNames.get(key) ?? 'Unattributed',
    options,
  );
}

/** Groups hours by category, using the canonical label from the §5.1 table. */
export function groupHoursByCategory(
  entries: readonly HoursRollupEntry[],
  options: HoursRollupOptions = {},
): GroupedHours[] {
  return groupBy(
    entries,
    (e) => e.category,
    (key) => {
      try {
        return getHourCategory(key).label;
      } catch {
        return key;
      }
    },
    options,
  );
}

/** Groups hours by property. Entries with no property land under "Portfolio-wide". */
export function groupHoursByProperty(
  entries: readonly HoursRollupEntry[],
  propertyNames: ReadonlyMap<string, string>,
  options: HoursRollupOptions = {},
): GroupedHours[] {
  return groupBy(
    entries,
    (e) => e.propertyId ?? '__none__',
    (key) =>
      key === '__none__' ? 'Portfolio-wide' : (propertyNames.get(key) ?? 'Unknown property'),
    options,
  );
}

function groupBy(
  entries: readonly HoursRollupEntry[],
  keyOf: (entry: HoursRollupEntry) => string,
  labelOf: (key: string) => string,
  options: HoursRollupOptions,
): GroupedHours[] {
  const buckets = new Map<string, HoursRollupEntry[]>();
  for (const entry of entries) {
    const key = keyOf(entry);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(entry);
    else buckets.set(key, [entry]);
  }

  return [...buckets.entries()]
    .map(([key, bucketEntries]) => ({
      key,
      label: labelOf(key),
      totals: rollUpHours(bucketEntries, options),
    }))
    .sort((a, b) => b.totals.totalMinutes - a.totals.totalMinutes || a.label.localeCompare(b.label));
}

/**
 * Type guard used by the UI layer to keep the two figures paired. Any component
 * rendering hours takes a `HoursTotals`, not a number, so there is no shape in
 * which a single merged hours value can reach the screen.
 */
export function assertHoursTotals(value: unknown): asserts value is HoursTotals {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as HoursTotals).totalMinutes !== 'number' ||
    typeof (value as HoursTotals).eligibleMinutes !== 'number'
  ) {
    throw new TypeError(
      'Hours must be rendered from a HoursTotals carrying both total and eligible minutes.',
    );
  }
}

export type { HourCategoryId };
