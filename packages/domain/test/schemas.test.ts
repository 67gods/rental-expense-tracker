import { describe, expect, it } from 'vitest';
import {
  assignJobSchema,
  createExpensePaymentSchema,
  createExpenseSchema,
  createPropertySchema,
  createReconciliationItemSchema,
  planInstalmentsSchema,
  upsertCpaFigureSchema,
  upsertLoanYearSchema,
  upsertRentReconciliationSchema,
} from '../src/schemas';

const UUID = '11111111-1111-4111-8111-111111111111';
const OTHER_UUID = '22222222-2222-4222-8222-222222222222';

const property = (over: Record<string, unknown> = {}) => ({
  enterpriseId: UUID,
  nickname: 'Creedmore',
  address: '1 Example St',
  ...over,
});

describe('createPropertySchema', () => {
  it('accepts a property with nothing but the four required fields', () => {
    // A record that refuses to save because the county tax card is in another
    // room is a record that never gets created.
    expect(createPropertySchema.safeParse(property()).success).toBe(true);
  });

  it('accepts the full set of purchase facts', () => {
    const parsed = createPropertySchema.parse(
      property({
        acquiredDate: '2025-11-17',
        placedInServiceDate: '2025-12-02',
        placedInServiceEvidence: 'listing',
        firstTenantDate: '2026-03-16',
        purchasePriceCents: 28_500_000,
        closingCostsCents: 850_000,
        landValueCents: 4_500_000,
        section469Activity: 'Creedmore',
      }),
    );
    expect(parsed.placedInServiceDate).toBe('2025-12-02');
    expect(parsed.landValueCents).toBe(4_500_000);
  });

  it('rejects a sale dated before the acquisition', () => {
    const result = createPropertySchema.safeParse(
      property({ acquiredDate: '2025-11-17', soldDate: '2024-01-01' }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects an in-service date before acquisition on an ordinary purchase', () => {
    const result = createPropertySchema.safeParse(
      property({ acquiredDate: '2025-11-17', placedInServiceDate: '2025-10-01' }),
    );
    expect(result.success).toBe(false);
  });

  it('allows an in-service date before acquisition when it was a home first', () => {
    // A converted residence was genuinely available to rent on a date that has
    // nothing to do with when it was bought.
    const result = createPropertySchema.safeParse(
      property({
        acquiredDate: '2020-06-01',
        wasPersonalResidence: true,
        convertedToRentalDate: '2025-01-15',
        placedInServiceDate: '2019-01-01',
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts 'self' as the manager, which is how the form says no manager", () => {
    expect(createPropertySchema.parse(property({ managedByActorId: 'self' })).managedByActorId)
      .toBe('self');
  });

  it('rejects an unknown placed-in-service evidence value', () => {
    expect(
      createPropertySchema.safeParse(property({ placedInServiceEvidence: 'vibes' })).success,
    ).toBe(false);
  });

  it('defaults every optional fact to null rather than zero', () => {
    const parsed = createPropertySchema.parse(property());
    expect(parsed.purchasePriceCents).toBeNull();
    expect(parsed.landValueCents).toBeNull();
    expect(parsed.placedInServiceDate).toBeNull();
  });
});

describe('createExpensePaymentSchema', () => {
  const payment = (over: Record<string, unknown> = {}) => ({
    expenseId: UUID,
    paidDate: '2025-12-19',
    amountCents: 250_000,
    ...over,
  });

  it('accepts a settled payment', () => {
    expect(createExpensePaymentSchema.parse(payment()).isScheduled).toBe(false);
  });

  it('accepts a scheduled payment', () => {
    expect(
      createExpensePaymentSchema.parse(payment({ isScheduled: true })).isScheduled,
    ).toBe(true);
  });

  it('rejects a zero payment, which is not an event', () => {
    expect(createExpensePaymentSchema.safeParse(payment({ amountCents: 0 })).success).toBe(
      false,
    );
  });

  it('rejects a negative payment - a refund is its own line, not a backwards payment', () => {
    expect(
      createExpensePaymentSchema.safeParse(payment({ amountCents: -100 })).success,
    ).toBe(false);
  });

  it('rejects a malformed date', () => {
    expect(createExpensePaymentSchema.safeParse(payment({ paidDate: '19/12/2025' })).success)
      .toBe(false);
  });
});

describe('createExpenseSchema', () => {
  const expense = (over: Record<string, unknown> = {}) => ({
    date: '2025-12-19',
    actorId: UUID,
    amountCents: 25_000,
    vendor: 'Home Depot',
    scheduleECategory: 'supplies',
    ...over,
  });

  it('accepts a property-owned expense', () => {
    expect(createExpenseSchema.safeParse(expense({ propertyId: OTHER_UUID })).success).toBe(true);
  });

  it('accepts a split across properties', () => {
    expect(
      createExpenseSchema.safeParse(
        expense({ allocationRule: { type: 'equal', propertyIds: [OTHER_UUID] } }),
      ).success,
    ).toBe(true);
  });

  it('accepts a portfolio-wide expense with neither a property nor a split (§6) - unresolved, not invalid', () => {
    expect(createExpenseSchema.safeParse(expense()).success).toBe(true);
  });
});

describe('planInstalmentsSchema', () => {
  it('accepts an ordinary plan', () => {
    expect(
      planInstalmentsSchema.safeParse({ expenseId: UUID, count: 6, firstDate: '2026-01-15' })
        .success,
    ).toBe(true);
  });

  it('rejects zero instalments and an implausible number of them', () => {
    expect(
      planInstalmentsSchema.safeParse({ expenseId: UUID, count: 0, firstDate: '2026-01-15' })
        .success,
    ).toBe(false);
    expect(
      planInstalmentsSchema.safeParse({ expenseId: UUID, count: 61, firstDate: '2026-01-15' })
        .success,
    ).toBe(false);
  });
});

describe('upsertLoanYearSchema', () => {
  it('accepts a 1098 whose box 10 was blank, with the source recorded', () => {
    const parsed = upsertLoanYearSchema.parse({
      propertyId: UUID,
      taxYear: 2025,
      lenderName: 'Example Bank',
      interestCents: 1_284_500,
      propertyTaxCents: 342_100,
      propertyTaxSource: 'escrow_statement',
      documentNote: 'Box 10 blank. Taxes in the supplemental block below the boxes.',
    });
    expect(parsed.propertyTaxSource).toBe('escrow_statement');
  });

  it('accepts a figure recorded as not found, so it is chased rather than assumed zero', () => {
    const parsed = upsertLoanYearSchema.parse({
      propertyId: UUID,
      taxYear: 2025,
      lenderName: 'Example Bank',
      propertyTaxCents: null,
      propertyTaxSource: 'not_found',
    });
    expect(parsed.propertyTaxCents).toBeNull();
    expect(parsed.propertyTaxSource).toBe('not_found');
  });

  it('requires a lender name', () => {
    expect(
      upsertLoanYearSchema.safeParse({ propertyId: UUID, taxYear: 2025, lenderName: '  ' })
        .success,
    ).toBe(false);
  });

  it('rejects an unknown source', () => {
    expect(
      upsertLoanYearSchema.safeParse({
        propertyId: UUID,
        taxYear: 2025,
        lenderName: 'Example Bank',
        propertyTaxSource: 'somewhere',
      }).success,
    ).toBe(false);
  });
});

describe('rent reconciliation', () => {
  it('accepts a header with no 1099 figure yet', () => {
    const parsed = upsertRentReconciliationSchema.parse({ propertyId: UUID, taxYear: 2025 });
    expect(parsed.reportedGrossCents).toBeNull();
  });

  it('accepts a positive item - money reported but never banked', () => {
    const parsed = createReconciliationItemSchema.parse({
      reconciliationId: UUID,
      kind: 'management_fee_withheld',
      amountCents: 224_100,
    });
    expect(parsed.amountCents).toBe(224_100);
  });

  it('accepts a NEGATIVE item, which is the one place negative money is legal', () => {
    // A refundable deposit reached the bank and is not income, so it is not on
    // the 1099 and it subtracts.
    const parsed = createReconciliationItemSchema.parse({
      reconciliationId: UUID,
      kind: 'deposit_held',
      amountCents: -186_000,
    });
    expect(parsed.amountCents).toBe(-186_000);
  });

  it('rejects a zero item, which explains nothing', () => {
    expect(
      createReconciliationItemSchema.safeParse({
        reconciliationId: UUID,
        kind: 'other',
        amountCents: 0,
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown reason', () => {
    expect(
      createReconciliationItemSchema.safeParse({
        reconciliationId: UUID,
        kind: 'shrinkage',
        amountCents: 100,
      }).success,
    ).toBe(false);
  });
});

describe('upsertCpaFigureSchema', () => {
  const figure = (over: Record<string, unknown> = {}) => ({
    propertyId: UUID,
    taxYear: 2025,
    kind: 'schedule_e_line',
    categoryId: 'depreciation',
    label: '27.5-year building',
    amountCents: 1_055_200,
    sourceNote: '2025 Form 4562, received 12 Apr 2026',
    enteredByActorId: OTHER_UUID,
    ...over,
  });

  it('accepts a depreciation figure with its provenance', () => {
    expect(upsertCpaFigureSchema.parse(figure()).sourceNote).toContain('Form 4562');
  });

  it('requires provenance - a figure nobody can trace cannot be checked next year', () => {
    expect(upsertCpaFigureSchema.safeParse(figure({ sourceNote: '  ' })).success).toBe(false);
  });

  it('requires a Schedule E figure to name its line', () => {
    expect(upsertCpaFigureSchema.safeParse(figure({ categoryId: null })).success).toBe(false);
  });

  it('does not require a line for a carryforward, which belongs to no line', () => {
    const parsed = upsertCpaFigureSchema.parse(
      figure({
        kind: 'suspended_loss_carryforward',
        categoryId: null,
        label: 'Suspended PAL carried forward',
        amountCents: -3_078_500,
      }),
    );
    expect(parsed.amountCents).toBe(-3_078_500);
  });

  it('accepts a portfolio-level figure with no property', () => {
    expect(upsertCpaFigureSchema.safeParse(figure({ propertyId: null })).success).toBe(true);
  });

  it('accepts a cost-seg component with its recovery period', () => {
    const parsed = upsertCpaFigureSchema.parse(
      figure({
        kind: 'depreciation_component',
        categoryId: null,
        label: '5-year personal property',
        recoveryYears: 5,
      }),
    );
    expect(parsed.recoveryYears).toBe(5);
  });
});

describe('assignJobSchema', () => {
  it('accepts adding records to an existing job', () => {
    expect(
      assignJobSchema.safeParse({ jobId: UUID, expenseIds: [OTHER_UUID] }).success,
    ).toBe(true);
  });

  it('accepts naming a new job, so grouping is not a two-step chore', () => {
    expect(
      assignJobSchema.safeParse({ newJobTitle: 'Laptop errand', timeEntryIds: [UUID] })
        .success,
    ).toBe(true);
  });

  it('rejects an assignment that names no job at all', () => {
    expect(assignJobSchema.safeParse({ expenseIds: [UUID] }).success).toBe(false);
  });

  it('rejects an assignment with nothing selected', () => {
    expect(assignJobSchema.safeParse({ jobId: UUID }).success).toBe(false);
  });

  it('accepts records of mixed kinds in one call', () => {
    const parsed = assignJobSchema.parse({
      jobId: UUID,
      timeEntryIds: [OTHER_UUID],
      tripIds: [OTHER_UUID],
      expenseIds: [OTHER_UUID],
    });
    expect(parsed.timeEntryIds.length + parsed.tripIds.length + parsed.expenseIds.length).toBe(3);
  });
});
