/**
 * Rent received against rent reported.
 *
 * Three figures describe one year of rent and they never agree:
 *
 *   what landed in the bank      $51,889.00
 *   what the 1099-MISC reported  $54,338.50
 *   what the leases called for   $54,130.00
 *
 * Every gap has its own cause. The manager reports gross rent and keeps their
 * fee out of it. A repair gets settled before the balance is sent on. A tenant
 * pays January early. A deposit is forfeited, which is income. Another deposit
 * is still held, which is not.
 *
 * The IRS matches the 1099 figure against the return automatically, so the
 * number that has to be explained is the reported one. This module does not
 * explain it - the owner does, one item at a time - it only holds them to
 * arithmetic: the receipts plus the items must equal what was reported, exactly.
 * A residual of a single cent means something is still unaccounted for.
 */

import { formatCents, sumCents } from '../money';
import type { ReconciliationKind } from '../constants/captureLists';

export interface ReconciliationItemLike {
  kind: ReconciliationKind | string;
  /**
   * Signed. Positive for money reported on the 1099 that never reached the
   * bank - a fee withheld, a repair paid out of rent, a forfeited deposit.
   * Negative for money that reached the bank but is not on the 1099, which in
   * practice means a refundable deposit being held.
   */
  amountCents: number;
}

export interface ReconciliationResult {
  receiptsCents: number;
  reportedGrossCents: number | null;
  itemsCents: number;
  /** reported - (receipts + items). Null until a 1099 figure is entered. */
  residualCents: number | null;
  isReconciled: boolean;
  /** Plain sentence for the screen. States the arithmetic, never a conclusion. */
  explanation: string;
}

/**
 * Reconciles a property-year.
 *
 *   reported === receipts + items   ⇔   reconciled
 *
 * With no reported figure yet the residual is null rather than zero. Zero would
 * read as "balanced" on a year whose 1099 has not arrived, which is the one
 * wrong answer this function must never give.
 */
export function reconcileRent(
  receiptsCents: number,
  reportedGrossCents: number | null | undefined,
  items: readonly ReconciliationItemLike[],
): ReconciliationResult {
  const itemsCents = sumCents(items.map((i) => i.amountCents));

  if (reportedGrossCents === null || reportedGrossCents === undefined) {
    return {
      receiptsCents,
      reportedGrossCents: null,
      itemsCents,
      residualCents: null,
      isReconciled: false,
      explanation:
        'No 1099 figure entered yet, so there is nothing to reconcile against. Received rent is recorded and will be compared once the form arrives.',
    };
  }

  const residualCents = reportedGrossCents - (receiptsCents + itemsCents);
  const isReconciled = residualCents === 0;

  return {
    receiptsCents,
    reportedGrossCents,
    itemsCents,
    residualCents,
    isReconciled,
    explanation: isReconciled
      ? 'Received rent plus the items above accounts for the reported figure exactly.'
      : residualCents > 0
        ? `${formatCents(residualCents)} of the reported figure is still unexplained - money reported but not yet accounted for.`
        : `${formatCents(-residualCents)} more has been accounted for than was reported. Check for an item entered twice, or with the wrong sign.`,
  };
}

/**
 * Whether an item's sign is the usual one for its kind.
 *
 * A warning for the UI, never a correction. A negative management fee is
 * unusual but not impossible, and the app is not in a position to tell an
 * unusual truth from a typo - only to ask.
 */
export function isUnusualSign(item: ReconciliationItemLike): boolean {
  if (item.amountCents === 0) return false;
  const positive = item.amountCents > 0;

  switch (item.kind) {
    // Reported but never banked, so normally positive.
    case 'management_fee_withheld':
    case 'repair_withheld':
    case 'deposit_forfeited':
    case 'advance_rent':
      return !positive;
    // Banked but not reported, so normally negative.
    case 'deposit_held':
      return positive;
    default:
      return false;
  }
}
