/**
 * What a charitable gift still needs before it is deductible.
 *
 * The amount is the easy half. A gift of $250 or more is disallowed OUTRIGHT
 * without a contemporaneous written acknowledgment from the charity - not
 * reduced, not questioned, disallowed - and a non-cash gift over $500 needs Form
 * 8283 filed with the return. Neither rule is about arithmetic; both are about
 * paperwork that has to exist before the return is signed and is impossible to
 * obtain afterwards, because "contemporaneous" means by the filing date.
 *
 * So this module answers one question - what is missing - and never decides
 * anything. A flagged gift is still a saved gift, exactly as an unflagged one
 * is; the flag is there so the letter gets chased in January rather than
 * discovered in an audit.
 *
 * Takes a `ThresholdSet` rather than a tax year, unlike `needsW9`. Callers pass
 * `thresholdsFor(taxYear)`, which lets a screen showing a year outside the
 * threshold table render without flags instead of throwing a page away over a
 * badge.
 */

import type { DonationKind } from '../constants/captureLists';
import type { ThresholdSet } from '../constants/thresholds';

export interface Donatable {
  amountCents: number;
  kind: DonationKind;
  acknowledgmentOnFile: boolean;
}

export interface DonationFlags {
  /** At or above the threshold with no letter recorded. The deduction is at risk. */
  needsAcknowledgment: boolean;
  /** A non-cash gift over the threshold. Form 8283 goes with the return. */
  needsForm8283: boolean;
}

/**
 * At or above, not over.
 *
 * The statute says "$250 or more", and the same at-or-above convention is used
 * for `w9ReportingThresholdCents` - a gift sitting exactly on the line is
 * flagged. Over-flagging costs a glance; under-flagging costs the deduction.
 *
 * Form 8283 is the other way round: the statute says "over $500", so $500 flat
 * is clear and $500.01 is not.
 */
export function donationFlags(gift: Donatable, thresholds: ThresholdSet): DonationFlags {
  return {
    needsAcknowledgment:
      !gift.acknowledgmentOnFile &&
      gift.amountCents >= thresholds.charitableAcknowledgmentCents,
    needsForm8283:
      gift.kind === 'non_cash' && gift.amountCents > thresholds.nonCashForm8283Cents,
  };
}

/** Whether anything at all is outstanding on a gift. */
export function isSubstantiated(gift: Donatable, thresholds: ThresholdSet): boolean {
  return !donationFlags(gift, thresholds).needsAcknowledgment;
}

/**
 * How many of a year's gifts are missing their letter.
 *
 * Form 8283 is deliberately not counted here: it is filed once with the return
 * and covers every non-cash gift together, so a count of gifts needing it would
 * overstate the work. A missing acknowledgment is per-gift and per-charity, and
 * each one is a separate letter somebody has to ask for.
 */
export function unsubstantiatedCount(
  gifts: readonly Donatable[],
  thresholds: ThresholdSet,
): number {
  return gifts.filter((gift) => donationFlags(gift, thresholds).needsAcknowledgment).length;
}
