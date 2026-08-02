import { describe, expect, it } from 'vitest';
import {
  hasThresholdsFor,
  knownTaxYears,
  RULES_VERSION,
  THRESHOLDS_BY_YEAR,
  thresholdsFor,
  UnknownTaxYearError,
  type ThresholdSet,
} from '../src/constants/thresholds';

/**
 * These tests are the year-keyed architecture. If they pass but the rest of the
 * app never threads a year through, the architecture is decoration - which is
 * why `contractors.test.ts` also asserts the same figure differs by year at the
 * rule level, not just in this table.
 */

describe('thresholdsFor', () => {
  it('returns the figures recorded for a year', () => {
    const t = thresholdsFor(2025);
    expect(t.safeHarborHourTarget).toBe(250);
    expect(t.w9ReportingThresholdCents).toBe(60_000);
  });

  it('throws on a year it has no figures for, rather than guessing', () => {
    expect(() => thresholdsFor(1999)).toThrow(UnknownTaxYearError);
    expect(() => thresholdsFor(2099)).toThrow(/No thresholds recorded for tax year 2099/);
  });

  it('names the file to edit in the error, so the fix is obvious', () => {
    expect(() => thresholdsFor(2099)).toThrow(/constants\/thresholds\.ts/);
  });

  it('never falls back to an adjacent year', () => {
    // 2028 sits directly after a year that IS in the table. A nearest-neighbour
    // fallback would silently answer here, which is the failure being prevented.
    expect(hasThresholdsFor(2027)).toBe(true);
    expect(() => thresholdsFor(2028)).toThrow(UnknownTaxYearError);
  });
});

describe('the 1099 reporting threshold moves between 2025 and 2026', () => {
  // The One Big Beautiful Bill Act raised the 1099-NEC / 1099-MISC reporting
  // threshold from $600 to $2,000 for payments made after 31 December 2025.
  // This is the concrete case the whole year dimension exists for.
  it('is $600 in 2025', () => {
    expect(thresholdsFor(2025).w9ReportingThresholdCents).toBe(60_000);
  });

  it('is $2,000 in 2026', () => {
    expect(thresholdsFor(2026).w9ReportingThresholdCents).toBe(200_000);
  });

  it('differs between the two years', () => {
    expect(thresholdsFor(2025).w9ReportingThresholdCents).not.toBe(
      thresholdsFor(2026).w9ReportingThresholdCents,
    );
  });
});

describe('year coverage', () => {
  /**
   * The guard that makes throwing safe.
   *
   * Because `thresholdsFor` refuses to guess, a year missing from the table
   * would break reporting for whoever hits it first. This test fails in CI a
   * year before that can happen, turning a user-facing outage into a chore.
   */
  it('covers this year and next', () => {
    const thisYear = new Date().getFullYear();
    expect(
      hasThresholdsFor(thisYear),
      `THRESHOLDS_BY_YEAR has no entry for ${thisYear}. Add it before this year's reports are run.`,
    ).toBe(true);
    expect(
      hasThresholdsFor(thisYear + 1),
      `THRESHOLDS_BY_YEAR has no entry for ${thisYear + 1}. Add it now - reports are run in January for the year just ended, and the app should never be the thing that is out of date.`,
    ).toBe(true);
  });

  it('lists its years in ascending order with no gaps', () => {
    const years = knownTaxYears();
    expect(years.length).toBeGreaterThan(0);
    for (let i = 1; i < years.length; i += 1) {
      expect(years[i]).toBe((years[i - 1] as number) + 1);
    }
  });

  it('gives every year a complete set of figures', () => {
    const required = Object.keys(thresholdsFor(2025)) as (keyof ThresholdSet)[];
    for (const year of knownTaxYears()) {
      const set = THRESHOLDS_BY_YEAR[year];
      expect(set, `no set for ${year}`).toBeDefined();
      for (const key of required) {
        expect(set?.[key], `${year} is missing ${key}`).toBeDefined();
      }
    }
  });
});

describe('RULES_VERSION', () => {
  it('is a non-empty stamp that can be stored alongside a cached derivation', () => {
    expect(RULES_VERSION).toMatch(/^\d{4}\.\d+$/);
  });
});
