/**
 * Statutory thresholds, keyed by tax year.
 *
 * These are the numbers the flagging rules compare against. The app never
 * decides what they mean - a threshold being crossed produces a flag for the
 * CPA, never an automatic classification (brief §1, §5.3).
 *
 * WHY A YEAR DIMENSION
 *
 * A stored row holds a fact; a threshold is a rule, and a rule is only true for
 * a year. The 1099-NEC / 1099-MISC reporting threshold was $600 through 2025
 * and is $2,000 for payments made after 31 December 2025 under the One Big
 * Beautiful Bill Act, indexed for inflation after that. A single global
 * constant would have applied 2025's answer to 2026 silently and produced a
 * wrong 1099 with nothing to indicate it.
 *
 * So every figure lives under a year, and `thresholdsFor` refuses to guess.
 */

export interface ThresholdSet {
  /** Documented eligible hours the enterprise is measured against (§5.4). */
  safeHarborHourTarget: number;

  /** De minimis safe harbor ceiling, per invoice or per item (§5.3). */
  deMinimisInvoiceCents: number;

  /** Small-taxpayer safe harbor: building unadjusted basis ceiling (§5.3). */
  smallTaxpayerBasisLimitCents: number;
  /** Small-taxpayer safe harbor: percentage-of-basis test. */
  smallTaxpayerPctOfBasis: number;
  /** Small-taxpayer safe harbor: absolute dollar cap. */
  smallTaxpayerCapCents: number;
  /** Small-taxpayer safe harbor: average annual gross receipts ceiling. */
  smallTaxpayerGrossReceiptsLimitCents: number;

  /** Payments to a contractor at or above this in a year need a W-9 (§5.6). */
  w9ReportingThresholdCents: number;
  /** Month (1-12) from which unresolved W-9 warnings become persistent (§5.6). */
  w9WarningStartMonth: number;

  /**
   * A charitable gift at or above this is disallowed outright without a
   * contemporaneous written acknowledgment from the charity.
   *
   * Unlike most thresholds here, this one does not merely flag - it decides
   * whether the deduction survives an audit at all. Which is why the donations
   * screen treats a missing letter as a warning rather than a detail.
   */
  charitableAcknowledgmentCents: number;
  /** A non-cash gift above this needs Form 8283 filed with the return. */
  nonCashForm8283Cents: number;
}

/**
 * Bumped whenever any figure below changes or a rule's shape changes.
 *
 * Stamped onto derived values that are cached in the database, so a cache
 * computed under an older rule set is detectable rather than believed. See
 * `time_entries.rules_version`.
 */
export const RULES_VERSION = '2026.1';

/** Figures shared by every year so far. Split out when one of them moves. */
const COMMON = {
  safeHarborHourTarget: 250,

  deMinimisInvoiceCents: 250_000, // $2,500

  smallTaxpayerBasisLimitCents: 100_000_000, // $1,000,000
  smallTaxpayerPctOfBasis: 0.02,
  smallTaxpayerCapCents: 1_000_000, // $10,000
  smallTaxpayerGrossReceiptsLimitCents: 1_000_000_000, // $10,000,000

  // The brief says "over $600". This uses at-or-above instead, which flags a
  // contractor sitting exactly on the line. Over-flagging costs a glance;
  // under-flagging costs a missing 1099. Deliberate, and covered by a test.
  w9WarningStartMonth: 10, // October

  // Both unmoved since 1993 and 1984 respectively, and neither is indexed. They
  // still live under the year dimension rather than as globals, because the
  // reason for that dimension is that a figure which has not moved yet is not a
  // figure that cannot move.
  charitableAcknowledgmentCents: 25_000, // $250
  nonCashForm8283Cents: 50_000, // $500
} as const;

export const THRESHOLDS_BY_YEAR: Readonly<Record<number, ThresholdSet>> = {
  2024: { ...COMMON, w9ReportingThresholdCents: 60_000 },
  2025: { ...COMMON, w9ReportingThresholdCents: 60_000 }, // $600
  2026: { ...COMMON, w9ReportingThresholdCents: 200_000 }, // $2,000 - OBBBA
  2027: { ...COMMON, w9ReportingThresholdCents: 200_000 }, // pending indexation
};

export class UnknownTaxYearError extends Error {
  override readonly name = 'UnknownTaxYearError';
  constructor(public readonly taxYear: number) {
    super(
      `No thresholds recorded for tax year ${taxYear}. Add it to THRESHOLDS_BY_YEAR ` +
        `in packages/domain/src/constants/thresholds.ts. This throws rather than ` +
        `reusing an adjacent year, because silently applying the wrong year's ` +
        `figure is the failure this table exists to prevent.`,
    );
  }
}

/**
 * The thresholds in force for a tax year.
 *
 * Never falls back to the nearest year. A missing year is a gap in the app's
 * knowledge, and guessing would produce a confident wrong number - which is
 * worse than an error, because nobody checks a number that looks fine.
 */
export function thresholdsFor(taxYear: number): ThresholdSet {
  const set = THRESHOLDS_BY_YEAR[taxYear];
  if (!set) throw new UnknownTaxYearError(taxYear);
  return set;
}

/** Whether figures have been recorded for a year, without throwing. */
export function hasThresholdsFor(taxYear: number): boolean {
  return Object.hasOwn(THRESHOLDS_BY_YEAR, taxYear);
}

/** Years covered, ascending. A test asserts this reaches at least next year. */
export function knownTaxYears(): number[] {
  return Object.keys(THRESHOLDS_BY_YEAR)
    .map(Number)
    .sort((a, b) => a - b);
}
