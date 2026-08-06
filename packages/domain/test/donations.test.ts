import { describe, expect, it } from 'vitest';
import { donationFlags, isSubstantiated, unsubstantiatedCount } from '../src/rules/donations';
import { thresholdsFor } from '../src/constants/thresholds';

const thresholds = thresholdsFor(2025);

const gift = (over: Partial<Parameters<typeof donationFlags>[0]> = {}) => ({
  amountCents: 10_000,
  kind: 'cash' as const,
  acknowledgmentOnFile: false,
  ...over,
});

describe('donationFlags: the acknowledgment letter', () => {
  it('leaves a small gift alone', () => {
    expect(donationFlags(gift({ amountCents: 24_999 }), thresholds).needsAcknowledgment).toBe(
      false,
    );
  });

  it('flags a gift sitting exactly on the line', () => {
    // The statute says "$250 or more". At-or-above, the same convention as the
    // W-9 threshold: over-flagging costs a glance, under-flagging costs the
    // deduction outright.
    expect(donationFlags(gift({ amountCents: 25_000 }), thresholds).needsAcknowledgment).toBe(
      true,
    );
  });

  it('flags a large gift with no letter', () => {
    expect(donationFlags(gift({ amountCents: 500_000 }), thresholds).needsAcknowledgment).toBe(
      true,
    );
  });

  it('clears once the letter is recorded', () => {
    const flags = donationFlags(
      gift({ amountCents: 500_000, acknowledgmentOnFile: true }),
      thresholds,
    );
    expect(flags.needsAcknowledgment).toBe(false);
  });
});

describe('donationFlags: Form 8283', () => {
  it('ignores cash however large', () => {
    // Form 8283 is a non-cash form. A $50,000 cheque does not touch it.
    expect(donationFlags(gift({ amountCents: 5_000_000 }), thresholds).needsForm8283).toBe(false);
  });

  it('leaves a non-cash gift of exactly $500 alone', () => {
    // "Over $500", not "$500 or more" - the other direction from the letter
    // threshold, and deliberately so.
    expect(
      donationFlags(gift({ kind: 'non_cash', amountCents: 50_000 }), thresholds).needsForm8283,
    ).toBe(false);
  });

  it('flags a non-cash gift a cent over', () => {
    expect(
      donationFlags(gift({ kind: 'non_cash', amountCents: 50_001 }), thresholds).needsForm8283,
    ).toBe(true);
  });

  it('raises both flags on a large undocumented non-cash gift', () => {
    const flags = donationFlags(gift({ kind: 'non_cash', amountCents: 120_000 }), thresholds);
    expect(flags).toEqual({ needsAcknowledgment: true, needsForm8283: true });
  });

  it('still needs 8283 with the letter on file', () => {
    // Two separate pieces of paper. Having one is not having the other.
    const flags = donationFlags(
      gift({ kind: 'non_cash', amountCents: 120_000, acknowledgmentOnFile: true }),
      thresholds,
    );
    expect(flags).toEqual({ needsAcknowledgment: false, needsForm8283: true });
  });
});

describe('isSubstantiated', () => {
  it('is true for a small gift with no paperwork at all', () => {
    expect(isSubstantiated(gift({ amountCents: 2_000 }), thresholds)).toBe(true);
  });

  it('is false for a $250 gift with no letter', () => {
    expect(isSubstantiated(gift({ amountCents: 25_000 }), thresholds)).toBe(false);
  });

  it('does not fail a gift solely for needing Form 8283', () => {
    // 8283 is filed once with the return, and the return has not been filed yet.
    // A gift is unsubstantiated when a letter is missing, not when a form is
    // still to come.
    expect(
      isSubstantiated(
        gift({ kind: 'non_cash', amountCents: 120_000, acknowledgmentOnFile: true }),
        thresholds,
      ),
    ).toBe(true);
  });
});

describe('unsubstantiatedCount', () => {
  it('counts only the gifts missing a letter', () => {
    const gifts = [
      gift({ amountCents: 5_000 }), // under the line
      gift({ amountCents: 25_000 }), // on the line, no letter
      gift({ amountCents: 90_000, acknowledgmentOnFile: true }), // covered
      gift({ kind: 'non_cash', amountCents: 120_000 }), // no letter, and 8283
    ];
    expect(unsubstantiatedCount(gifts, thresholds)).toBe(2);
  });

  it('is zero for an empty year', () => {
    expect(unsubstantiatedCount([], thresholds)).toBe(0);
  });
});
