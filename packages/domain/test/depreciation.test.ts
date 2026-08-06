import { describe, expect, it } from 'vitest';
import {
  DepreciationError,
  RESIDENTIAL_RECOVERY_YEARS,
  depreciationForYear,
  resolveDepreciationSchedule,
} from '../src/rules/depreciation';

/**
 * Arbordale Way's real facts: placed in service 28 January 2025 on a basis that
 * runs $8,981.82 a year over 27.5 years. January is the interesting start month
 * because the mid-month convention gives it 11.5 of the 12 months, which is the
 * single most common way a first year is got wrong.
 */
const ARBORDALE = { startMonth: 1, startYear: 2025, annualCents: 898_182 };

/** A December start, where the first year is a half-month and almost nothing. */
const CREEDMORE = { startMonth: 12, startYear: 2025, annualCents: 1_101_818 };

describe('depreciationForYear', () => {
  it('is zero before the schedule starts', () => {
    const result = depreciationForYear(ARBORDALE, 2024);
    expect(result.cents).toBe(0);
    expect(result.phase).toBe('before');
    expect(result.explanation).toContain('January 2025');
  });

  it('apportions the first year by the mid-month convention', () => {
    const result = depreciationForYear(ARBORDALE, 2025);
    expect(result.phase).toBe('first');
    expect(result.months).toBe(11.5);
    // 898182 * 11.5/12 = 860757.75, rounded
    expect(result.cents).toBe(860_758);
    expect(result.explanation).toContain('11.5 months');
  });

  it('gives a December start half a month in its first year', () => {
    const result = depreciationForYear(CREEDMORE, 2025);
    expect(result.phase).toBe('first');
    expect(result.months).toBe(0.5);
    expect(result.cents).toBe(Math.round(1_101_818 * (0.5 / 12)));
    expect(result.explanation).toContain('0.5 months');
  });

  it('is flat and identical for every middle year - the whole point', () => {
    const middles = [2026, 2030, 2040, 2051].map((year) =>
      depreciationForYear(ARBORDALE, year),
    );
    for (const year of middles) {
      expect(year.phase).toBe('full');
      expect(year.cents).toBe(898_182);
      expect(year.months).toBe(12);
    }
  });

  it('takes the stub in the final year and stops', () => {
    // January 2025 start: 11.5/12 in 2025, 26 full years 2026-2051, and the
    // 0.5417-year balance in 2052. 28 calendar years in all.
    const final = depreciationForYear(ARBORDALE, 2052);
    expect(final.phase).toBe('final');
    expect(final.cents).toBeGreaterThan(0);
    expect(final.cents).toBeLessThan(ARBORDALE.annualCents);
    expect(final.explanation).toContain('Last year');

    const after = depreciationForYear(ARBORDALE, 2053);
    expect(after.phase).toBe('after');
    expect(after.cents).toBe(0);
    expect(after.explanation).toContain('Fully depreciated');
  });

  it('spans 29 calendar years from a December start', () => {
    expect(depreciationForYear(CREEDMORE, 2053).phase).toBe('final');
    expect(depreciationForYear(CREEDMORE, 2054).phase).toBe('after');
  });

  /**
   * The property of the whole schedule that actually matters: the years add up
   * to the recovery period. If they did not, the owner would be deducting more
   * or less than the basis over the life of the property.
   */
  it('adds up to the full recovery period, to within a rounding cent', () => {
    let total = 0;
    for (let year = 2025; year <= 2060; year += 1) {
      total += depreciationForYear(ARBORDALE, year).cents;
    }
    expect(total).toBeCloseTo(ARBORDALE.annualCents * RESIDENTIAL_RECOVERY_YEARS, 0);
  });

  it('honours a recovery period that is not residential', () => {
    const commercial = { ...ARBORDALE, recoveryYears: 39 };
    expect(depreciationForYear(commercial, 2052).phase).toBe('full');
    expect(depreciationForYear(commercial, 2064).phase).toBe('final');
  });

  it('refuses a month that is not a month', () => {
    expect(() => depreciationForYear({ ...ARBORDALE, startMonth: 0 }, 2025)).toThrow(
      DepreciationError,
    );
    expect(() => depreciationForYear({ ...ARBORDALE, startMonth: 13 }, 2025)).toThrow(
      DepreciationError,
    );
  });

  it('refuses fractional cents and a nonsense recovery period', () => {
    expect(() => depreciationForYear({ ...ARBORDALE, annualCents: 1.5 }, 2025)).toThrow(
      DepreciationError,
    );
    expect(() => depreciationForYear({ ...ARBORDALE, recoveryYears: 0 }, 2025)).toThrow(
      DepreciationError,
    );
  });
});

describe('resolveDepreciationSchedule', () => {
  it('falls back to the placed-in-service date, which is where it starts', () => {
    const schedule = resolveDepreciationSchedule({
      depreciationStartMonth: null,
      depreciationStartYear: null,
      annualDepreciationCents: 898_182,
      placedInServiceDate: '2025-01-28',
    });
    expect(schedule).toEqual({ startMonth: 1, startYear: 2025, annualCents: 898_182 });
  });

  it('lets an explicit start override the in-service date', () => {
    const schedule = resolveDepreciationSchedule({
      depreciationStartMonth: 7,
      depreciationStartYear: 2019,
      annualDepreciationCents: 500_000,
      placedInServiceDate: '2025-01-28',
    });
    expect(schedule).toEqual({ startMonth: 7, startYear: 2019, annualCents: 500_000 });
  });

  it('is null with no amount, because a start alone produces nothing', () => {
    expect(
      resolveDepreciationSchedule({
        depreciationStartMonth: 3,
        depreciationStartYear: 2020,
        annualDepreciationCents: null,
        placedInServiceDate: '2020-03-01',
      }),
    ).toBeNull();
  });

  it('is null with no start anywhere, rather than guessing a January', () => {
    expect(
      resolveDepreciationSchedule({
        depreciationStartMonth: null,
        depreciationStartYear: null,
        annualDepreciationCents: 898_182,
        placedInServiceDate: null,
      }),
    ).toBeNull();
  });
});
