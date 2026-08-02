import { describe, expect, it } from 'vitest';
import {
  formatCents,
  formatCentsPlain,
  MoneyError,
  parseAmountToCents,
  roundHalfUp,
  sumCents,
} from '../src/money';
import {
  addDays,
  currentTaxYear,
  DateError,
  daysBetween,
  formatDateLong,
  formatDateShort,
  isBackdated,
  isIsoDate,
  isWithin,
  monthOf,
  taxYearOf,
  taxYearRange,
  todayInZone,
  yearToDateRange,
} from '../src/dates';

describe('money parsing', () => {
  it('accepts the shapes a person actually types', () => {
    expect(parseAmountToCents('1234.56')).toBe(123_456);
    expect(parseAmountToCents('1,234.56')).toBe(123_456);
    expect(parseAmountToCents('$1,234.56')).toBe(123_456);
    expect(parseAmountToCents(' 1234 ')).toBe(123_400);
    expect(parseAmountToCents('.5')).toBe(50);
    expect(parseAmountToCents(89.99)).toBe(8_999);
  });

  it('rejects anything ambiguous instead of guessing', () => {
    // A silently misparsed amount is worse than a rejected one.
    for (const bad of ['', '   ', 'abc', '12.34.56', '1e5', '-', '.', '$']) {
      expect(() => parseAmountToCents(bad), `should reject "${bad}"`).toThrow(MoneyError);
    }
    expect(() => parseAmountToCents(Number.NaN)).toThrow(MoneyError);
    expect(() => parseAmountToCents(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });

  it('survives the floating point amounts that normally lose a cent', () => {
    expect(parseAmountToCents('0.1')).toBe(10);
    expect(parseAmountToCents('0.29')).toBe(29);
    expect(parseAmountToCents('1.005')).toBe(101);
    expect(parseAmountToCents(19.99)).toBe(1_999);
  });

  it('rounds half away from zero in both directions', () => {
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(-0.5)).toBe(-1);
    expect(roundHalfUp(2.4)).toBe(2);
    expect(roundHalfUp(-2.6)).toBe(-3);
  });

  it('formats for the screen and for CSV differently', () => {
    expect(formatCents(123_456)).toBe('$1,234.56');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCentsPlain(123_456)).toBe('1234.56');
    expect(formatCentsPlain(5)).toBe('0.05');
    expect(formatCentsPlain(-1_250)).toBe('-12.50');
  });

  it('refuses to sum a non-integer cent value', () => {
    expect(sumCents([100, 250, 5])).toBe(355);
    expect(sumCents([])).toBe(0);
    expect(() => sumCents([100, 12.5])).toThrow(MoneyError);
  });
});

describe('business dates stay anchored to the household timezone', () => {
  it('accepts real calendar dates only', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true); // leap year
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-1-1')).toBe(false);
    expect(isIsoDate('03/14/2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });

  it('keeps a late-evening 31 December entry in its own tax year', () => {
    // 8pm on 31 December in New York is already 1 January in UTC. Anchoring to
    // the household zone is what stops the entry moving tax years.
    const newYearsEve = new Date('2027-01-01T01:00:00Z');
    expect(todayInZone('America/New_York', newYearsEve)).toBe('2026-12-31');
    expect(currentTaxYear('America/New_York', newYearsEve)).toBe(2026);
    expect(todayInZone('UTC', newYearsEve)).toBe('2027-01-01');
  });

  it('reads the tax year off the date string', () => {
    expect(taxYearOf('2026-12-31')).toBe(2026);
    expect(() => taxYearOf('not-a-date')).toThrow(DateError);
  });

  it('builds an inclusive calendar-year range', () => {
    expect(taxYearRange(2026)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(() => taxYearRange(1800)).toThrow(DateError);
  });

  it('builds a year-to-date range ending today', () => {
    const range = yearToDateRange('America/New_York', new Date('2026-08-02T15:00:00Z'));
    expect(range).toEqual({ start: '2026-01-01', end: '2026-08-02' });
  });

  it('tests range membership on both boundaries', () => {
    const range = taxYearRange(2026);
    expect(isWithin('2026-01-01', range)).toBe(true);
    expect(isWithin('2026-12-31', range)).toBe(true);
    expect(isWithin('2025-12-31', range)).toBe(false);
    expect(isWithin('2027-01-01', range)).toBe(false);
  });

  it('detects a backdated entry so contemporaneity is recorded, not assumed', () => {
    const createdAt = new Date('2026-03-16T14:00:00Z');
    expect(isBackdated('2026-03-14', createdAt, 'America/New_York')).toBe(true);
    expect(isBackdated('2026-03-16', createdAt, 'America/New_York')).toBe(false);
  });

  it('measures the gap between the work and the record', () => {
    expect(daysBetween('2026-03-14', '2026-03-16')).toBe(2);
    expect(daysBetween('2026-03-14', '2026-03-14')).toBe(0);
    // Across a DST boundary, where a naive hour-based diff would be off by one.
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
  });

  it('adds days without leaving plain-date space', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('formats dates for lists and for report headers', () => {
    expect(formatDateShort('2026-03-14')).toBe('Sat, Mar 14');
    expect(formatDateLong('2026-03-14')).toBe('March 14, 2026');
    expect(() => formatDateShort('nope')).toThrow(DateError);
  });

  it('reads the month for the W-9 warning window', () => {
    expect(monthOf('2026-10-01')).toBe(10);
    expect(monthOf('2026-01-31')).toBe(1);
  });
});
