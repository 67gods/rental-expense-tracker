import { describe, expect, it } from 'vitest';
import { jobTitleFrom, rollUpJob, type JobChildren } from '../src/rules/jobs';

/**
 * The laptop errand, which is the case jobs exist for.
 *
 *   Monday   40 min at the desk comparing models    (materials_purchase, eligible)
 *   Tuesday  35 min driving there and back          (travel, never eligible)
 *            25 min in the shop, negotiating and paying (materials_purchase)
 *            18.4 miles
 *            $1,284.00 paid on the day
 *
 * Five records, two dates, one job. Monday's desk time is the record a
 * trip-centred design could never reach, which is why the header is a job
 * rather than the trip.
 */
const laptopErrand: JobChildren = {
  timeEntries: [
    { date: '2026-04-06', minutes: 40, category: 'materials_purchase' },
    { date: '2026-04-07', minutes: 35, category: 'travel' },
    { date: '2026-04-07', minutes: 25, category: 'materials_purchase' },
  ],
  trips: [{ date: '2026-04-07', miles: 18.4 }],
  expenses: [
    {
      date: '2026-04-07',
      amountCents: 128_400,
      payments: [{ paidDate: '2026-04-07', amountCents: 128_400, isScheduled: false }],
    },
  ],
};

describe('rollUpJob - the laptop errand', () => {
  const rollup = rollUpJob(laptopErrand, 2026);

  it('counts every record in the job', () => {
    expect(rollup.recordCount).toBe(5);
  });

  it('totals all the time, driving included', () => {
    expect(rollup.totalMinutes).toBe(100);
    expect(rollup.totalHours).toBe(1.67);
  });

  it('excludes the drive from eligible time while still logging it', () => {
    // 40 + 25 at the desk and in the shop; the 35 minutes driving are logged
    // and do not count.
    expect(rollup.eligibleMinutes).toBe(65);
    expect(rollup.totalMinutes - rollup.eligibleMinutes).toBe(35);
  });

  it('totals the miles', () => {
    expect(rollup.totalMiles).toBe(18.4);
  });

  it('reports what was actually paid in the year', () => {
    expect(rollup.paidInYearCents).toBe(128_400);
    expect(rollup.invoicedCents).toBe(128_400);
    expect(rollup.outstandingCents).toBe(0);
  });

  it('reaches across two dates, which is the point of the header', () => {
    const dates = new Set([
      ...laptopErrand.timeEntries.map((t) => t.date),
      ...laptopErrand.trips.map((t) => t.date),
      ...laptopErrand.expenses.map((e) => e.date),
    ]);
    expect(dates.size).toBe(2);
    expect(rollup.recordCount).toBe(5);
  });
});

describe('rollUpJob - cost treatment', () => {
  const beforeListing: JobChildren = {
    timeEntries: [],
    trips: [
      { date: '2025-11-20', miles: 12.0 }, // before the property was lettable
      { date: '2025-12-10', miles: 6.2 },
    ],
    expenses: [
      {
        date: '2025-11-20',
        amountCents: 50_000,
        payments: [{ paidDate: '2025-11-20', amountCents: 50_000, isScheduled: false }],
      },
      {
        date: '2025-12-10',
        amountCents: 30_000,
        payments: [{ paidDate: '2025-12-10', amountCents: 30_000, isScheduled: false }],
      },
    ],
  };

  it('splits miles either side of the placed-in-service date', () => {
    const rollup = rollUpJob(beforeListing, 2025, '2025-12-02');
    expect(rollup.acquisitionMiles).toBe(12.0);
    expect(rollup.operatingMiles).toBe(6.2);
    expect(rollup.totalMiles).toBe(18.2);
  });

  it('splits spend the same way, and the two sides add back to the total', () => {
    const rollup = rollUpJob(beforeListing, 2025, '2025-12-02');
    expect(rollup.acquisitionSpendCents).toBe(50_000);
    expect(rollup.operatingSpendCents).toBe(30_000);
    expect(rollup.acquisitionSpendCents + rollup.operatingSpendCents).toBe(
      rollup.paidInYearCents,
    );
  });

  it('puts everything on the operating side when no in-service date is known', () => {
    const rollup = rollUpJob(beforeListing, 2025, null);
    expect(rollup.acquisitionMiles).toBe(0);
    expect(rollup.acquisitionSpendCents).toBe(0);
    expect(rollup.operatingMiles).toBe(18.2);
  });
});

describe('rollUpJob - payments across years', () => {
  const straddling: JobChildren = {
    timeEntries: [],
    trips: [],
    expenses: [
      {
        date: '2025-12-19',
        amountCents: 824_400,
        payments: [
          { paidDate: '2025-12-19', amountCents: 250_000, isScheduled: false },
          { paidDate: '2026-03-15', amountCents: 574_400, isScheduled: true },
        ],
      },
    ],
  };

  it('reports only the settled part in the year it settled', () => {
    expect(rollUpJob(straddling, 2025).paidInYearCents).toBe(250_000);
  });

  it('does not report a scheduled payment as paid in its year', () => {
    expect(rollUpJob(straddling, 2026).paidInYearCents).toBe(0);
  });

  it('keeps the full invoice visible alongside what was paid', () => {
    const rollup = rollUpJob(straddling, 2025);
    expect(rollup.invoicedCents).toBe(824_400);
    expect(rollup.outstandingCents).toBe(574_400);
  });
});

describe('rollUpJob - edges', () => {
  const empty: JobChildren = { timeEntries: [], trips: [], expenses: [] };

  it('handles a job with no children yet', () => {
    const rollup = rollUpJob(empty, 2026);
    expect(rollup.recordCount).toBe(0);
    expect(rollup.totalMinutes).toBe(0);
    expect(rollup.paidInYearCents).toBe(0);
    expect(rollup.totalMiles).toBe(0);
  });

  it('drops eligibility for time linked to a capital improvement', () => {
    const linked: JobChildren = {
      ...empty,
      timeEntries: [
        {
          date: '2026-04-06',
          minutes: 120,
          category: 'contractor_management',
          linkedCapitalClassification: 'improvement',
        },
      ],
    };
    const rollup = rollUpJob(linked, 2026);
    expect(rollup.totalMinutes).toBe(120);
    expect(rollup.eligibleMinutes).toBe(0);
  });

  it('rejects a year that is not a real one', () => {
    expect(() => rollUpJob(empty, 0)).toThrow();
  });

  it('rounds miles to one decimal without accumulating float error', () => {
    const many: JobChildren = {
      ...empty,
      trips: Array.from({ length: 10 }, () => ({ date: '2026-04-07', miles: 0.1 })),
    };
    expect(rollUpJob(many, 2026).totalMiles).toBe(1);
  });
});

describe('jobTitleFrom', () => {
  it('uses the first record description, so nobody is asked to name anything', () => {
    expect(jobTitleFrom('Compared laptops for rental bookkeeping')).toBe(
      'Compared laptops for rental bookkeeping',
    );
  });

  it('collapses stray whitespace', () => {
    expect(jobTitleFrom('  Compared   laptops  ')).toBe('Compared laptops');
  });

  it('truncates a long description at a word boundary', () => {
    const long =
      'Drove to the supplier to compare laptops for the rental bookkeeping and to ask about the trade-in';
    const title = jobTitleFrom(long);
    expect(title.length).toBeLessThanOrEqual(64);
    expect(title.endsWith('...')).toBe(true);
    expect(title).not.toMatch(/\s\.\.\.$/);
  });

  it('falls back when the description is empty', () => {
    expect(jobTitleFrom('   ')).toBe('Untitled job');
    expect(jobTitleFrom('', 'Laptop errand')).toBe('Laptop errand');
  });
});
