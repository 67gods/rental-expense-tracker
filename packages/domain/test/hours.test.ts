import { describe, expect, it } from 'vitest';
import {
  assertHoursTotals,
  formatHoursDecimal,
  formatMinutes,
  groupHoursByActor,
  groupHoursByCategory,
  groupHoursByProperty,
  minutesToHours,
  rollUpHours,
  safeHarborProgress,
} from '../src/totals/hours';

const entry = (over: Partial<Parameters<typeof rollUpHours>[0][number]> = {}) => ({
  minutes: 60,
  category: 'repairs_maintenance',
  shEligible: true,
  actorId: 'actor-1',
  propertyId: 'prop-1',
  ...over,
});

describe('§5.1 / §10 total and eligible hours are never merged', () => {
  it('reports both figures from a mixed set of entries', () => {
    const totals = rollUpHours([
      entry({ minutes: 120, shEligible: true }),
      entry({ minutes: 90, category: 'travel', shEligible: false }),
      entry({ minutes: 30, category: 'financing', shEligible: false }),
    ]);

    expect(totals.totalMinutes).toBe(240);
    expect(totals.eligibleMinutes).toBe(120);
    expect(totals.entryCount).toBe(3);
  });

  it('exposes no single merged hours field a caller could grab by mistake', () => {
    const totals = rollUpHours([entry()]);
    expect(Object.keys(totals)).not.toContain('hours');
    expect(Object.keys(totals)).not.toContain('minutes');
  });

  it('rejects a bare number where a paired total is required', () => {
    expect(() => assertHoursTotals(42)).toThrow(TypeError);
    expect(() => assertHoursTotals({ totalMinutes: 1, eligibleMinutes: 1 })).not.toThrow();
  });

  it('handles an empty set without producing NaN', () => {
    const totals = rollUpHours([]);
    expect(totals.totalMinutes).toBe(0);
    expect(totals.eligibleMinutes).toBe(0);
  });

  it('refuses a non-numeric minutes value rather than spreading NaN', () => {
    expect(() =>
      rollUpHours([entry({ minutes: Number.NaN })]),
    ).toThrow(TypeError);
  });

  it('tracks provisional eligible minutes separately from the eligible total', () => {
    const totals = rollUpHours([
      entry({ minutes: 60, shEligible: true }),
      entry({ minutes: 45, shEligible: true, isProvisional: true }),
    ]);
    expect(totals.eligibleMinutes).toBe(105);
    // Surfaced as a caveat, not silently deducted.
    expect(totals.provisionalEligibleMinutes).toBe(45);
  });
});

describe('§5.4 hours on excluded properties', () => {
  it('logs them in the total but keeps them out of eligible', () => {
    const totals = rollUpHours(
      [
        entry({ minutes: 60, propertyId: 'prop-1' }),
        entry({ minutes: 120, propertyId: 'prop-tnl' }),
      ],
      { excludedPropertyIds: ['prop-tnl'] },
    );

    expect(totals.totalMinutes).toBe(180);
    expect(totals.eligibleMinutes).toBe(60);
    expect(totals.excludedPropertyMinutes).toBe(120);
  });

  it('leaves portfolio-wide entries alone - they belong to no single property', () => {
    const totals = rollUpHours([entry({ minutes: 60, propertyId: null })], {
      excludedPropertyIds: ['prop-tnl'],
    });
    expect(totals.eligibleMinutes).toBe(60);
  });
});

describe('§5.4 progress toward the documented-hours target', () => {
  it('measures eligible hours against the target, not total hours', () => {
    const progress = safeHarborProgress(
      [
        entry({ minutes: 200 * 60, shEligible: true }),
        entry({ minutes: 100 * 60, category: 'travel', shEligible: false }),
      ],
      2025,
    );

    expect(progress.totalHours).toBe(300);
    expect(progress.eligibleHours).toBe(200);
    expect(progress.targetHours).toBe(250);
    expect(progress.pctOfTarget).toBe(80);
    expect(progress.remainingHours).toBe(50);
    expect(progress.targetMet).toBe(false);
  });

  it('marks the target met and stops counting past 100 percent', () => {
    const progress = safeHarborProgress([entry({ minutes: 300 * 60 })], 2025);
    expect(progress.targetMet).toBe(true);
    expect(progress.pctOfTarget).toBe(100);
    expect(progress.remainingHours).toBe(0);
    // The real figure is still available; only the bar is capped.
    expect(progress.eligibleHours).toBe(300);
  });

  it('does not reach the target on ineligible hours alone', () => {
    const progress = safeHarborProgress(
      [entry({ minutes: 400 * 60, category: 'capital_improvement', shEligible: false })],
      2025,
    );
    expect(progress.totalHours).toBe(400);
    expect(progress.eligibleHours).toBe(0);
    expect(progress.targetMet).toBe(false);
  });
});

describe('§4 grouping keeps each person separate', () => {
  const entries = [
    entry({ actorId: 'owner', minutes: 120 }),
    entry({ actorId: 'spouse', minutes: 60 }),
    entry({ actorId: 'spouse', minutes: 30, category: 'travel', shEligible: false }),
  ];

  it('never pools hours across actors', () => {
    const groups = groupHoursByActor(
      entries,
      new Map([
        ['owner', 'Amit'],
        ['spouse', 'Priya'],
      ]),
    );

    expect(groups).toHaveLength(2);
    const owner = groups.find((g) => g.key === 'owner');
    const spouse = groups.find((g) => g.key === 'spouse');
    expect(owner?.totals.eligibleMinutes).toBe(120);
    expect(spouse?.totals.totalMinutes).toBe(90);
    expect(spouse?.totals.eligibleMinutes).toBe(60);
  });

  it('labels an unknown actor rather than dropping the hours', () => {
    const groups = groupHoursByActor([entry({ actorId: 'ghost' })], new Map());
    expect(groups[0]?.label).toBe('Unattributed');
    expect(groups[0]?.totals.totalMinutes).toBe(60);
  });

  it('groups by category using the canonical label', () => {
    const groups = groupHoursByCategory(entries);
    expect(groups.find((g) => g.key === 'repairs_maintenance')?.label).toBe(
      'Repairs & maintenance',
    );
    expect(groups.find((g) => g.key === 'travel')?.totals.eligibleMinutes).toBe(0);
  });

  it('groups portfolio-wide entries under their own heading', () => {
    const groups = groupHoursByProperty(
      [entry({ propertyId: null }), entry({ propertyId: 'prop-1' })],
      new Map([['prop-1', 'Maple St']]),
    );
    expect(groups.map((g) => g.label).sort()).toEqual(['Maple St', 'Portfolio-wide']);
  });
});

describe('hour formatting', () => {
  it('formats minutes for dense list rows', () => {
    expect(formatMinutes(0)).toBe('0m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(750)).toBe('12h 30m');
    expect(formatMinutes(-90)).toBe('-1h 30m');
  });

  it('formats decimal hours for CSV export', () => {
    expect(formatHoursDecimal(750)).toBe('12.50');
    expect(formatHoursDecimal(20)).toBe('0.33');
  });

  it('rounds hours to two decimals', () => {
    expect(minutesToHours(90)).toBe(1.5);
    expect(minutesToHours(100)).toBe(1.67);
  });
});
