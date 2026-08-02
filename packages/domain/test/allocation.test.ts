import { describe, expect, it } from 'vitest';
import {
  allocateExpense,
  AllocationError,
  describeAllocationRule,
  propertiesTouchedBy,
  type AllocationRule,
} from '../src/rules/allocation';
import { distributeCents, MoneyError } from '../src/money';

const properties = [
  { id: 'a', nickname: 'Maple St', unadjustedBasisCents: 20_000_000, ownershipPct: 100 },
  { id: 'b', nickname: 'Oak Ave', unadjustedBasisCents: 30_000_000, ownershipPct: 50 },
  { id: 'c', nickname: 'Pine Rd', unadjustedBasisCents: 50_000_000, ownershipPct: 100 },
];

const sum = (lines: { amountCents: number }[]) =>
  lines.reduce((t, l) => t + l.amountCents, 0);

describe('§6 shared expenses split without losing pennies', () => {
  it('splits evenly and reconciles to the parent amount exactly', () => {
    // $1,000 across three properties does not divide evenly.
    const lines = allocateExpense(100_000, { type: 'equal', propertyIds: ['a', 'b', 'c'] }, properties);
    expect(sum(lines)).toBe(100_000);
    expect(lines.map((l) => l.amountCents)).toEqual([33_334, 33_333, 33_333]);
  });

  it('splits in proportion to unadjusted basis', () => {
    const lines = allocateExpense(100_000, { type: 'basis', propertyIds: ['a', 'b', 'c'] }, properties);
    expect(sum(lines)).toBe(100_000);
    expect(lines.map((l) => l.amountCents)).toEqual([20_000, 30_000, 50_000]);
    expect(lines.map((l) => l.pct)).toEqual([20, 30, 50]);
  });

  it('splits in proportion to ownership share', () => {
    const lines = allocateExpense(
      100_000,
      { type: 'ownership', propertyIds: ['a', 'b'] },
      properties,
    );
    expect(sum(lines)).toBe(100_000);
    expect(lines.map((l) => l.amountCents)).toEqual([66_667, 33_333]);
  });

  it('honours an explicit custom split', () => {
    const rule: AllocationRule = {
      type: 'custom',
      shares: [
        { propertyId: 'a', pct: 50 },
        { propertyId: 'b', pct: 30 },
        { propertyId: 'c', pct: 20 },
      ],
    };
    const lines = allocateExpense(123_457, rule, properties);
    expect(sum(lines)).toBe(123_457);
    expect(lines[0]?.propertyId).toBe('a');
  });

  it('reconciles to the penny across many awkward amounts', () => {
    // The failure this guards against is a Schedule E total that is a cent off
    // the receipts with no explanation.
    for (let amount = 1; amount <= 2000; amount++) {
      const lines = allocateExpense(amount, { type: 'equal', propertyIds: ['a', 'b', 'c'] }, properties);
      expect(sum(lines)).toBe(amount);
    }
  });

  it('assigns the whole amount to one property when there is no rule', () => {
    const lines = allocateExpense(50_000, null, properties, 'a');
    expect(lines).toEqual([{ propertyId: 'a', amountCents: 50_000, pct: 100 }]);
  });

  it('leaves the parent amount untouched - it returns lines, it does not mutate', () => {
    const rule: AllocationRule = { type: 'equal', propertyIds: ['a', 'b'] };
    const frozen = Object.freeze({ ...rule });
    expect(() => allocateExpense(100_000, frozen as AllocationRule, properties)).not.toThrow();
    expect(frozen.propertyIds).toEqual(['a', 'b']);
  });
});

describe('§6 allocation refuses states that would produce a wrong total', () => {
  it('rejects custom percentages that do not add to 100', () => {
    const rule: AllocationRule = {
      type: 'custom',
      shares: [
        { propertyId: 'a', pct: 50 },
        { propertyId: 'b', pct: 30 },
      ],
    };
    expect(() => allocateExpense(100_000, rule, properties)).toThrow(AllocationError);
    expect(() => allocateExpense(100_000, rule, properties)).toThrow(/80.00%/);
  });

  it('rejects a negative percentage', () => {
    const rule: AllocationRule = {
      type: 'custom',
      shares: [
        { propertyId: 'a', pct: 120 },
        { propertyId: 'b', pct: -20 },
      ],
    };
    expect(() => allocateExpense(100_000, rule, properties)).toThrow(/negative/i);
  });

  it('rejects a split referring to a property that does not exist', () => {
    expect(() =>
      allocateExpense(100_000, { type: 'equal', propertyIds: ['a', 'ghost'] }, properties),
    ).toThrow(/does not exist/);
  });

  it('rejects an empty split', () => {
    expect(() =>
      allocateExpense(100_000, { type: 'equal', propertyIds: [] }, properties),
    ).toThrow(/at least one property/);
    expect(() =>
      allocateExpense(100_000, { type: 'custom', shares: [] }, properties),
    ).toThrow(/at least one property/);
  });

  it('explains a basis split when every basis is still zero', () => {
    const unfilled = [
      { id: 'x', nickname: 'X', unadjustedBasisCents: 0, ownershipPct: 100 },
      { id: 'y', nickname: 'Y', unadjustedBasisCents: 0, ownershipPct: 100 },
    ];
    expect(() =>
      allocateExpense(100_000, { type: 'basis', propertyIds: ['x', 'y'] }, unfilled),
    ).toThrow(/unadjusted basis/);
  });

  it('requires a property when there is no rule to split by', () => {
    expect(() => allocateExpense(100_000, null, properties, null)).toThrow(
      /must belong to a property/,
    );
  });

  it('rejects a fractional cent amount', () => {
    expect(() =>
      allocateExpense(100.5, { type: 'equal', propertyIds: ['a'] }, properties),
    ).toThrow(/integer cents/);
  });
});

describe('distributeCents', () => {
  it('gives leftover pennies to the largest remainders', () => {
    expect(distributeCents(10, [1, 1, 1])).toEqual([4, 3, 3]);
  });

  it('preserves sign on a refund', () => {
    const parts = distributeCents(-10, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(-10);
  });

  it('handles a zero-weight bucket without inventing money', () => {
    expect(distributeCents(100, [1, 0])).toEqual([100, 0]);
  });

  it('rejects weights that are all zero', () => {
    expect(() => distributeCents(100, [0, 0])).toThrow(MoneyError);
  });

  it('rejects a negative weight', () => {
    expect(() => distributeCents(100, [1, -1])).toThrow(MoneyError);
  });

  it('rejects zero buckets', () => {
    expect(() => distributeCents(100, [])).toThrow(MoneyError);
  });
});

describe('allocation descriptions', () => {
  const names = new Map([
    ['a', 'Maple St'],
    ['b', 'Oak Ave'],
  ]);

  it('describes each rule type in one line', () => {
    expect(describeAllocationRule(null, names)).toBe('Single property');
    expect(describeAllocationRule({ type: 'equal', propertyIds: ['a', 'b'] }, names)).toMatch(
      /evenly across 2 properties: Maple St, Oak Ave/,
    );
    expect(describeAllocationRule({ type: 'basis', propertyIds: ['a', 'b'] }, names)).toMatch(
      /unadjusted basis/,
    );
    expect(describeAllocationRule({ type: 'ownership', propertyIds: ['a'] }, names)).toMatch(
      /ownership share/,
    );
    expect(
      describeAllocationRule(
        { type: 'custom', shares: [{ propertyId: 'a', pct: 60 }, { propertyId: 'b', pct: 40 }] },
        names,
      ),
    ).toBe('Custom split: Maple St 60%, Oak Ave 40%');
  });

  it('lists every property an expense touches', () => {
    expect(propertiesTouchedBy(null, 'a')).toEqual(['a']);
    expect(propertiesTouchedBy(null, null)).toEqual([]);
    expect(propertiesTouchedBy({ type: 'equal', propertyIds: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(
      propertiesTouchedBy({ type: 'custom', shares: [{ propertyId: 'b', pct: 100 }] }),
    ).toEqual(['b']);
  });
});
