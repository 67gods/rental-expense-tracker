import { describe, expect, it } from 'vitest';
import {
  contractorW9Warnings,
  contractorYearTotals,
  needsW9,
} from '../src/rules/contractors';
import { UnknownTaxYearError } from '../src/constants/thresholds';

/**
 * The fixture year is 2025, where the reporting threshold is $600.
 *
 * It used to be 2026. That stopped being a neutral choice once thresholds
 * became year-keyed: OBBBA raised the threshold to $2,000 for payments made
 * after 31 December 2025, so a $750 contractor is reportable in 2025 and is
 * not in 2026. The mechanics below - the persistence window, the sort order,
 * the at-or-above boundary - are unchanged; only the year they are anchored to
 * had to become explicit. The final block asserts the difference directly.
 */

const contractors = [
  { id: 'c1', name: 'Ace Plumbing', w9OnFile: false, taxIdCollected: false },
  { id: 'c2', name: 'Bright Painters', w9OnFile: true, taxIdCollected: true },
  { id: 'c3', name: 'Handy Sam', w9OnFile: false, taxIdCollected: false },
];

const expenses = [
  { contractorActorId: 'c1', amountCents: 45_000, date: '2025-02-10' },
  { contractorActorId: 'c1', amountCents: 30_000, date: '2025-06-01' },
  { contractorActorId: 'c2', amountCents: 200_000, date: '2025-04-15' },
  { contractorActorId: 'c3', amountCents: 25_000, date: '2025-05-20' },
  // Prior year - must not bleed into this year's running total.
  { contractorActorId: 'c1', amountCents: 500_000, date: '2024-11-30' },
  // Not attributed to a contractor at all.
  { contractorActorId: null, amountCents: 90_000, date: '2025-03-01' },
];

describe('§5.6 running total paid per calendar year', () => {
  it('sums payments per contractor within the tax year only', () => {
    const totals = contractorYearTotals(expenses, contractors, 2025);
    const byId = new Map(totals.map((t) => [t.actorId, t]));

    expect(byId.get('c1')?.paidCents).toBe(75_000);
    expect(byId.get('c2')?.paidCents).toBe(200_000);
    expect(byId.get('c3')?.paidCents).toBe(25_000);
  });

  it('keeps a 31 December payment in its own tax year', () => {
    // Read off the date string, so no timezone can shift it into January.
    const totals = contractorYearTotals(
      [{ contractorActorId: 'c1', amountCents: 100_000, date: '2025-12-31' }],
      contractors,
      2025,
    );
    expect(totals.find((t) => t.actorId === 'c1')?.paidCents).toBe(100_000);
  });

  it('includes contractors paid nothing so they can still be managed', () => {
    const totals = contractorYearTotals([], contractors, 2025);
    expect(totals).toHaveLength(3);
    expect(totals.every((t) => t.paidCents === 0)).toBe(true);
  });

  it('sorts by amount paid, highest first', () => {
    const totals = contractorYearTotals(expenses, contractors, 2025);
    expect(totals.map((t) => t.actorId)).toEqual(['c2', 'c1', 'c3']);
  });
});

describe('§5.6 W-9 warnings', () => {
  const totals = () => contractorYearTotals(expenses, contractors, 2025);

  it('warns about a contractor over the threshold with no W-9', () => {
    const warnings = contractorW9Warnings(totals(), new Date('2025-10-01T09:00:00'), 2025);
    expect(warnings.map((w) => w.actorId)).toEqual(['c1']);
    expect(warnings[0]?.message).toContain('Ace Plumbing');
    expect(warnings[0]?.message).toContain('$750.00');
  });

  it('stays quiet about a contractor who already has a W-9 on file', () => {
    // Bright Painters was paid $2,000 - well over - but the paperwork is done.
    const warnings = contractorW9Warnings(totals(), new Date('2025-11-01T09:00:00'), 2025);
    expect(warnings.map((w) => w.actorId)).not.toContain('c2');
  });

  it('stays quiet about a contractor under the threshold', () => {
    const warnings = contractorW9Warnings(totals(), new Date('2025-11-01T09:00:00'), 2025);
    expect(warnings.map((w) => w.actorId)).not.toContain('c3');
  });

  it('becomes persistent from October onward', () => {
    for (const month of ['10', '11', '12']) {
      const warnings = contractorW9Warnings(
        totals(),
        new Date(`2025-${month}-05T09:00:00`),
        2025,
      );
      expect(warnings[0]?.isPersistent).toBe(true);
      expect(warnings[0]?.severity).toBe('warning');
    }
  });

  it('reports the same condition quietly before October', () => {
    for (const month of ['01', '05', '09']) {
      const warnings = contractorW9Warnings(
        totals(),
        new Date(`2025-${month}-15T09:00:00`),
        2025,
      );
      expect(warnings[0]?.isPersistent).toBe(false);
      expect(warnings[0]?.severity).toBe('info');
    }
  });

  it('flips to persistent exactly at the 1 October boundary', () => {
    const sep30 = contractorW9Warnings(totals(), new Date('2025-09-30T23:59:00'), 2025);
    const oct01 = contractorW9Warnings(totals(), new Date('2025-10-01T00:01:00'), 2025);
    expect(sep30[0]?.isPersistent).toBe(false);
    expect(oct01[0]?.isPersistent).toBe(true);
  });

  it('flags a contractor sitting exactly on the $600 line in 2025', () => {
    // Deliberately at-or-above rather than strictly above: under-flagging costs
    // a missing 1099, over-flagging costs a glance.
    expect(needsW9(60_000, false, 2025)).toBe(true);
    expect(needsW9(59_999, false, 2025)).toBe(false);
    expect(needsW9(1_000_000, true, 2025)).toBe(false);
  });

  it('sorts warnings by amount so the largest exposure is first', () => {
    const many = contractorYearTotals(
      [
        { contractorActorId: 'c1', amountCents: 70_000, date: '2025-01-01' },
        { contractorActorId: 'c3', amountCents: 900_000, date: '2025-01-01' },
      ],
      contractors,
      2025,
    );
    const warnings = contractorW9Warnings(many, new Date('2025-10-15T09:00:00'), 2025);
    expect(warnings.map((w) => w.actorId)).toEqual(['c3', 'c1']);
  });

  it('rejects a malformed date rather than silently misfiling the payment', () => {
    expect(() =>
      contractorYearTotals(
        [{ contractorActorId: 'c1', amountCents: 100, date: 'March 2025' }],
        contractors,
        2025,
      ),
    ).toThrow(TypeError);
  });
});

describe('the year decides the answer, not a global constant', () => {
  /**
   * The acceptance test for the whole year-keyed architecture, at the rule
   * level rather than the table level. Identical payment data, two years, two
   * answers. If these ever agree, the year is not actually being threaded and
   * the app is quietly filing 1099s under the wrong rules.
   */
  const paidFourteenHundred = [
    { actorId: 'c1', name: 'Ace Plumbing', w9OnFile: false, taxIdCollected: false, paidCents: 140_000, taxYear: 2025 },
  ];

  it('flags a $1,400 contractor in 2025, when the threshold is $600', () => {
    const warnings = contractorW9Warnings(
      paidFourteenHundred,
      new Date('2026-01-15T09:00:00'),
      2025,
    );
    expect(warnings.map((w) => w.actorId)).toEqual(['c1']);
  });

  it('does not flag the same $1,400 in 2026, when the threshold is $2,000', () => {
    const warnings = contractorW9Warnings(
      paidFourteenHundred.map((t) => ({ ...t, taxYear: 2026 })),
      new Date('2027-01-15T09:00:00'),
      2026,
    );
    expect(warnings).toEqual([]);
  });

  it('gives needsW9 opposite answers for the same amount in the two years', () => {
    expect(needsW9(140_000, false, 2025)).toBe(true);
    expect(needsW9(140_000, false, 2026)).toBe(false);
  });

  it('refuses to answer at all for a year it has no figures for', () => {
    expect(() => needsW9(140_000, false, 2099)).toThrow(UnknownTaxYearError);
    expect(() =>
      contractorW9Warnings(paidFourteenHundred, new Date('2099-10-01T09:00:00'), 2099),
    ).toThrow(UnknownTaxYearError);
  });
});
