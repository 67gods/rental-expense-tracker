/**
 * Statutory thresholds used by the flagging rules.
 *
 * These are the numbers the app compares against. It never decides what they
 * mean - a threshold being crossed produces a flag for the CPA, never an
 * automatic classification (brief §1, §5.3).
 *
 * They are exposed as an overridable set rather than hard-coded at the call
 * site so a future year's figures can be supplied without editing rule code.
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
}

export const DEFAULT_THRESHOLDS: ThresholdSet = {
  safeHarborHourTarget: 250,

  deMinimisInvoiceCents: 250_000, // $2,500

  smallTaxpayerBasisLimitCents: 100_000_000, // $1,000,000
  smallTaxpayerPctOfBasis: 0.02,
  smallTaxpayerCapCents: 1_000_000, // $10,000
  smallTaxpayerGrossReceiptsLimitCents: 1_000_000_000, // $10,000,000

  // The brief says "over $600". This uses at-or-above $600 instead, which flags
  // a contractor sitting exactly on the line. Over-flagging costs a glance;
  // under-flagging costs a missing 1099. Deliberate, and covered by a test.
  w9ReportingThresholdCents: 60_000, // $600

  w9WarningStartMonth: 10, // October
};

/** Convenience alias for the most-referenced figure in the app. */
export const SAFE_HARBOR_HOUR_TARGET = DEFAULT_THRESHOLDS.safeHarborHourTarget;
