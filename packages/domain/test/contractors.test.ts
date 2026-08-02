import { describe, expect, it } from 'vitest';
import {
  contractorW9Warnings,
  contractorYearTotals,
  needsW9,
} from '../src/rules/contractors';

const contractors = [
  { id: 'c1', name: 'Ace Plumbing', w9OnFile: false, taxIdCollected: false },
  { id: 'c2', name: 'Bright Painters', w9OnFile: true, taxIdCollected: true },
  { id: 'c3', name: 'Handy Sam', w9OnFile: false, taxIdCollected: false },
];

const expenses = [
  { contractorActorId: 'c1', amountCents: 45_000, date: '2026-02-10' },
  { contractorActorId: 'c1', amountCents: 30_000, date: '2026-06-01' },
  { contractorActorId: 'c2', amountCents: 200_000, date: '2026-04-15' },
  { contractorActorId: 'c3', amountCents: 25_000, date: '2026-05-20' },
  // Prior year - must not bleed into this year's running total.
  { contractorActorId: 'c1', amountCents: 500_000, date: '2025-11-30' },
  // Not attributed to a contractor at all.
  { contractorActorId: null, amountCents: 90_000, date: '2026-03-01' },
];

describe('§5.6 running total paid per calendar year', () => {
  it('sums payments per contractor within the tax year only', () => {
    const totals = contractorYearTotals(expenses, contractors, 2026);
    const byId = new Map(totals.map((t) => [t.actorId, t]));

    expect(byId.get('c1')?.paidCents).toBe(75_000);
    expect(byId.get('c2')?.paidCents).toBe(200_000);
    expect(byId.get('c3')?.paidCents).toBe(25_000);
  });

  it('keeps a 31 December payment in its own tax year', () => {
    // Read off the date string, so no timezone can shift it into January.
    const totals = contractorYearTotals(
      [{ contractorActorId: 'c1', amountCents: 100_000, date: '2026-12-31' }],
      contractors,
      2026,
    );
    expect(totals.find((t) => t.actorId === 'c1')?.paidCents).toBe(100_000);
  });

  it('includes contractors paid nothing so they can still be managed', () => {
    const totals = contractorYearTotals([], contractors, 2026);
    expect(totals).toHaveLength(3);
    expect(totals.every((t) => t.paidCents === 0)).toBe(true);
  });

  it('sorts by amount paid, highest first', () => {
    const totals = contractorYearTotals(expenses, contractors, 2026);
    expect(totals.map((t) => t.actorId)).toEqual(['c2', 'c1', 'c3']);
  });
});

describe('§5.6 W-9 warnings', () => {
  const totals = () => contractorYearTotals(expenses, contractors, 2026);

  it('warns about a contractor over the threshold with no W-9', () => {
    const warnings = contractorW9Warnings(totals(), new Date('2026-10-01T09:00:00'));
    expect(warnings.map((w) => w.actorId)).toEqual(['c1']);
    expect(warnings[0]?.message).toContain('Ace Plumbing');
    expect(warnings[0]?.message).toContain('$750.00');
  });

  it('stays quiet about a contractor who already has a W-9 on file', () => {
    // Bright Painters was paid $2,000 - well over - but the paperwork is done.
    const warnings = contractorW9Warnings(totals(), new Date('2026-11-01T09:00:00'));
    expect(warnings.map((w) => w.actorId)).not.toContain('c2');
  });

  it('stays quiet about a contractor under the threshold', () => {
    const warnings = contractorW9Warnings(totals(), new Date('2026-11-01T09:00:00'));
    expect(warnings.map((w) => w.actorId)).not.toContain('c3');
  });

  it('becomes persistent from October onward', () => {
    for (const month of ['10', '11', '12']) {
      const warnings = contractorW9Warnings(totals(), new Date(`2026-${month}-05T09:00:00`));
      expect(warnings[0]?.isPersistent).toBe(true);
      expect(warnings[0]?.severity).toBe('warning');
    }
  });

  it('reports the same condition quietly before October', () => {
    for (const month of ['01', '05', '09']) {
      const warnings = contractorW9Warnings(totals(), new Date(`2026-${month}-15T09:00:00`));
      expect(warnings[0]?.isPersistent).toBe(false);
      expect(warnings[0]?.severity).toBe('info');
    }
  });

  it('flips to persistent exactly at the 1 October boundary', () => {
    const sep30 = contractorW9Warnings(totals(), new Date('2026-09-30T23:59:00'));
    const oct01 = contractorW9Warnings(totals(), new Date('2026-10-01T00:01:00'));
    expect(sep30[0]?.isPersistent).toBe(false);
    expect(oct01[0]?.isPersistent).toBe(true);
  });

  it('flags a contractor sitting exactly on the $600 line', () => {
    // Deliberately at-or-above rather than strictly above: under-flagging costs
    // a missing 1099, over-flagging costs a glance.
    expect(needsW9(60_000, false)).toBe(true);
    expect(needsW9(59_999, false)).toBe(false);
    expect(needsW9(1_000_000, true)).toBe(false);
  });

  it('sorts warnings by amount so the largest exposure is first', () => {
    const many = contractorYearTotals(
      [
        { contractorActorId: 'c1', amountCents: 70_000, date: '2026-01-01' },
        { contractorActorId: 'c3', amountCents: 900_000, date: '2026-01-01' },
      ],
      contractors,
      2026,
    );
    const warnings = contractorW9Warnings(many, new Date('2026-10-15T09:00:00'));
    expect(warnings.map((w) => w.actorId)).toEqual(['c3', 'c1']);
  });

  it('rejects a malformed date rather than silently misfiling the payment', () => {
    expect(() =>
      contractorYearTotals(
        [{ contractorActorId: 'c1', amountCents: 100, date: 'March 2026' }],
        contractors,
        2026,
      ),
    ).toThrow(TypeError);
  });
});
