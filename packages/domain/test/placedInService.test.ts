import { describe, expect, it } from 'vitest';
import {
  costTreatmentFor,
  costTreatmentLabel,
  propertyDateProblems,
  splitByCostTreatment,
} from '../src/rules/placedInService';

/**
 * The real dates from one of the household's properties, where all three are
 * different and only the middle one decides anything:
 *
 *   acquired        2025-11-17
 *   placed in service 2025-12-02   <- listed for rent
 *   first tenant    2026-03-16
 */
const PLACED_IN_SERVICE = '2025-12-02';

describe('costTreatmentFor', () => {
  it('calls spend before the in-service date acquisition-side', () => {
    const result = costTreatmentFor('2025-11-20', PLACED_IN_SERVICE);
    expect(result.treatment).toBe('acquisition');
    expect(result.isOverridden).toBe(false);
    expect(result.explanation).toContain('before the property was available');
  });

  it('calls spend on or after the in-service date operating', () => {
    expect(costTreatmentLabel('2025-12-02', PLACED_IN_SERVICE)).toBe('operating');
    expect(costTreatmentLabel('2025-12-03', PLACED_IN_SERVICE)).toBe('operating');
  });

  it('treats the in-service day itself as operating, not acquisition', () => {
    // The property is available to rent that day, so the day belongs to the
    // operating side. An off-by-one here moves real money.
    expect(costTreatmentLabel(PLACED_IN_SERVICE, PLACED_IN_SERVICE)).toBe('operating');
  });

  it('does not use the acquisition date - a cost after purchase but before listing is still acquisition-side', () => {
    expect(costTreatmentLabel('2025-11-18', PLACED_IN_SERVICE)).toBe('acquisition');
  });

  it('does not use the first-tenant date - a cost before occupancy but after listing is operating', () => {
    expect(costTreatmentLabel('2026-01-10', PLACED_IN_SERVICE)).toBe('operating');
  });

  it('defaults to operating when no in-service date is recorded', () => {
    const result = costTreatmentFor('2025-11-20', null);
    expect(result.treatment).toBe('operating');
    expect(result.explanation).toContain('no placed-in-service date');
  });

  it('lets an owner override the derivation, and says so', () => {
    const result = costTreatmentFor('2026-06-01', PLACED_IN_SERVICE, 'acquisition');
    expect(result.treatment).toBe('acquisition');
    expect(result.isOverridden).toBe(true);
    expect(result.explanation).toContain('by hand');
  });

  it('lets the override win even with no in-service date on record', () => {
    expect(costTreatmentFor('2026-06-01', null, 'acquisition').treatment).toBe('acquisition');
  });

  it('rejects a malformed record date', () => {
    expect(() => costTreatmentFor('June 2025', PLACED_IN_SERVICE)).toThrow();
  });

  it('rejects a malformed in-service date rather than silently treating it as absent', () => {
    expect(() => costTreatmentFor('2025-11-20', 'December 2025')).toThrow();
  });

  it('handles a year boundary without timezone drift', () => {
    expect(costTreatmentLabel('2024-12-31', '2025-01-01')).toBe('acquisition');
    expect(costTreatmentLabel('2025-01-01', '2025-01-01')).toBe('operating');
  });
});

describe('splitByCostTreatment', () => {
  const trips = [
    { date: '2025-11-18', miles: 12.0 },
    { date: '2025-11-25', miles: 9.4 },
    { date: '2025-12-10', miles: 6.2 },
    { date: '2026-02-01', miles: 20.1 },
  ];

  it('sorts records onto the two sides and keeps every one', () => {
    const { operating, acquisition } = splitByCostTreatment(trips, PLACED_IN_SERVICE);
    expect(acquisition.map((t) => t.date)).toEqual(['2025-11-18', '2025-11-25']);
    expect(operating.map((t) => t.date)).toEqual(['2025-12-10', '2026-02-01']);
    expect(operating.length + acquisition.length).toBe(trips.length);
  });

  it('honours a per-record override', () => {
    const withOverride = [{ date: '2026-02-01', miles: 20.1, override: 'acquisition' as const }];
    const { acquisition } = splitByCostTreatment(
      withOverride,
      PLACED_IN_SERVICE,
      (t) => t.override,
    );
    expect(acquisition).toHaveLength(1);
  });

  it('puts everything on the operating side when no date is known', () => {
    const { operating, acquisition } = splitByCostTreatment(trips, null);
    expect(operating).toHaveLength(4);
    expect(acquisition).toHaveLength(0);
  });

  it('handles an empty set', () => {
    const { operating, acquisition } = splitByCostTreatment([], PLACED_IN_SERVICE);
    expect(operating).toEqual([]);
    expect(acquisition).toEqual([]);
  });
});

describe('property dates that cannot all be true', () => {
  it('accepts the ordinary shape: bought, then made available', () => {
    expect(
      propertyDateProblems({
        acquiredDate: '2025-11-17',
        placedInServiceDate: '2025-12-02',
      }),
    ).toEqual([]);
  });

  it('refuses a property listed for rent before it was owned', () => {
    const problems = propertyDateProblems({
      acquiredDate: '2025-11-17',
      placedInServiceDate: '2025-10-01',
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]?.field).toBe('placedInServiceDate');
  });

  it('allows exactly that on a property that was a home first', () => {
    expect(
      propertyDateProblems({
        acquiredDate: '2025-11-17',
        placedInServiceDate: '2025-10-01',
        wasPersonalResidence: true,
      }),
    ).toEqual([]);
  });

  it('refuses a sale before the purchase', () => {
    const problems = propertyDateProblems({
      acquiredDate: '2025-11-17',
      soldDate: '2025-06-01',
    });
    expect(problems.map((p) => p.field)).toEqual(['soldDate']);
  });

  it('reports both at once rather than stopping at the first', () => {
    const problems = propertyDateProblems({
      acquiredDate: '2025-11-17',
      placedInServiceDate: '2025-10-01',
      soldDate: '2025-06-01',
    });
    expect(problems.map((p) => p.field).sort()).toEqual(['placedInServiceDate', 'soldDate']);
  });

  it('says nothing when the dates it compares are missing', () => {
    expect(propertyDateProblems({})).toEqual([]);
    expect(propertyDateProblems({ placedInServiceDate: '2025-12-02' })).toEqual([]);
    expect(propertyDateProblems({ acquiredDate: '2025-11-17' })).toEqual([]);
  });

  it('accepts the same day for both - available the day it was bought', () => {
    expect(
      propertyDateProblems({
        acquiredDate: '2025-11-17',
        placedInServiceDate: '2025-11-17',
      }),
    ).toEqual([]);
  });
});
