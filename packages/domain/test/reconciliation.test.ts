import { describe, expect, it } from 'vitest';
import { isUnusualSign, reconcileRent } from '../src/rules/reconciliation';

/**
 * The real 2025 figures for the two managed properties. Received rent and the
 * 1099 differ by $2,449.50, and every dollar of the gap has a different cause.
 */
const RECEIVED = 5_188_900; // $51,889.00 banked
const REPORTED = 5_433_850; // $54,338.50 on the 1099-MISC

describe('reconcileRent', () => {
  it('reports the residual when nothing has been explained yet', () => {
    const result = reconcileRent(RECEIVED, REPORTED, []);
    expect(result.residualCents).toBe(244_950);
    expect(result.isReconciled).toBe(false);
    expect(result.explanation).toContain('$2,449.50');
  });

  it('reconciles exactly once every item is accounted for', () => {
    const result = reconcileRent(RECEIVED, REPORTED, [
      { kind: 'management_fee_withheld', amountCents: 224_100 },
      { kind: 'advance_rent', amountCents: 20_850 },
    ]);
    expect(result.residualCents).toBe(0);
    expect(result.isReconciled).toBe(true);
    expect(result.explanation).toContain('exactly');
  });

  it('refuses to call a year reconciled while a single cent is unexplained', () => {
    const result = reconcileRent(RECEIVED, REPORTED, [
      { kind: 'management_fee_withheld', amountCents: 224_100 },
      { kind: 'advance_rent', amountCents: 20_849 },
    ]);
    expect(result.residualCents).toBe(1);
    expect(result.isReconciled).toBe(false);
  });

  it('says so when more has been explained than was reported', () => {
    const result = reconcileRent(RECEIVED, REPORTED, [
      { kind: 'management_fee_withheld', amountCents: 224_100 },
      { kind: 'advance_rent', amountCents: 20_850 },
      // The same fee entered twice - the mistake this message is for.
      { kind: 'management_fee_withheld', amountCents: 224_100 },
    ]);
    expect(result.residualCents).toBe(-224_100);
    expect(result.isReconciled).toBe(false);
    expect(result.explanation).toContain('entered twice');
  });

  it('handles a held deposit, which is banked but not reported', () => {
    // $1,860 of refundable deposit reached the bank and is not income, so it is
    // NOT on the 1099. It subtracts.
    const result = reconcileRent(RECEIVED + 186_000, REPORTED, [
      { kind: 'management_fee_withheld', amountCents: 224_100 },
      { kind: 'advance_rent', amountCents: 20_850 },
      { kind: 'deposit_held', amountCents: -186_000 },
    ]);
    expect(result.isReconciled).toBe(true);
  });

  it('handles a forfeited deposit, which IS income and normally adds', () => {
    const result = reconcileRent(RECEIVED, REPORTED + 225_000, [
      { kind: 'management_fee_withheld', amountCents: 224_100 },
      { kind: 'advance_rent', amountCents: 20_850 },
      { kind: 'deposit_forfeited', amountCents: 225_000 },
    ]);
    expect(result.isReconciled).toBe(true);
  });

  describe('before the 1099 arrives', () => {
    it('gives a null residual rather than zero', () => {
      // Zero would read as "balanced" on a year whose form has not arrived,
      // which is the one wrong answer this function must never give.
      const result = reconcileRent(RECEIVED, null, []);
      expect(result.residualCents).toBeNull();
      expect(result.isReconciled).toBe(false);
      expect(result.explanation).toContain('No 1099 figure entered yet');
    });

    it('treats undefined the same as null', () => {
      expect(reconcileRent(RECEIVED, undefined, []).residualCents).toBeNull();
    });

    it('still totals the items it has', () => {
      const result = reconcileRent(RECEIVED, null, [
        { kind: 'management_fee_withheld', amountCents: 224_100 },
      ]);
      expect(result.itemsCents).toBe(224_100);
      expect(result.receiptsCents).toBe(RECEIVED);
    });
  });

  it('reconciles a self-managed property where the figures already agree', () => {
    const result = reconcileRent(1_000_000, 1_000_000, []);
    expect(result.isReconciled).toBe(true);
    expect(result.residualCents).toBe(0);
  });

  it('handles a year with no rent at all', () => {
    expect(reconcileRent(0, 0, []).isReconciled).toBe(true);
  });
});

describe('isUnusualSign', () => {
  it('flags a negative fee, which is normally money kept back', () => {
    expect(isUnusualSign({ kind: 'management_fee_withheld', amountCents: -100 })).toBe(true);
    expect(isUnusualSign({ kind: 'management_fee_withheld', amountCents: 100 })).toBe(false);
  });

  it('flags a positive held deposit, which is normally banked but unreported', () => {
    expect(isUnusualSign({ kind: 'deposit_held', amountCents: 100 })).toBe(true);
    expect(isUnusualSign({ kind: 'deposit_held', amountCents: -100 })).toBe(false);
  });

  it('separates the two deposit kinds, which point opposite ways', () => {
    // A forfeited deposit is income; a held one is not. The app never picks
    // between them - it only notices when the sign looks the wrong way round.
    expect(isUnusualSign({ kind: 'deposit_forfeited', amountCents: 225_000 })).toBe(false);
    expect(isUnusualSign({ kind: 'deposit_held', amountCents: 225_000 })).toBe(true);
  });

  it('never flags "other", which has no usual direction', () => {
    expect(isUnusualSign({ kind: 'other', amountCents: -500 })).toBe(false);
    expect(isUnusualSign({ kind: 'other', amountCents: 500 })).toBe(false);
  });

  it('never flags a zero item', () => {
    expect(isUnusualSign({ kind: 'management_fee_withheld', amountCents: 0 })).toBe(false);
  });
});
