import { describe, expect, it } from 'vitest';
import {
  assignJobSchema,
  createBankAccountSchema,
  createCharitySchema,
  createDonationSchema,
  createExpensePaymentSchema,
  createExpenseSchema,
  createPropertySchema,
  createReconciliationItemSchema,
  planInstalmentsSchema,
  upsertCpaFigureSchema,
  upsertInterestYearSchema,
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

describe('createBankAccountSchema', () => {
  const account = (over: Record<string, unknown> = {}) => ({
    bankName: 'Ally Bank',
    holderActorId: UUID,
    ...over,
  });

  it("accepts an account in a person's name", () => {
    expect(createBankAccountSchema.safeParse(account()).success).toBe(true);
  });

  it("accepts an account in a business's name", () => {
    // An LLC has no actor to point at, and inventing one would put a company in
    // the People list.
    const parsed = createBankAccountSchema.parse(
      account({ holderActorId: null, holderName: 'Gandhi Holdings LLC' }),
    );
    expect(parsed.holderName).toBe('Gandhi Holdings LLC');
    expect(parsed.holderActorId).toBeNull();
  });

  it('rejects an account claiming both a person and a business', () => {
    const result = createBankAccountSchema.safeParse(
      account({ holderName: 'Gandhi Holdings LLC' }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects an account with no holder at all', () => {
    // "Whose name is it in" is the question this record exists to answer.
    expect(createBankAccountSchema.safeParse(account({ holderActorId: null })).success).toBe(
      false,
    );
  });

  it('rejects a bank name that is only whitespace', () => {
    expect(createBankAccountSchema.safeParse(account({ bankName: '   ' })).success).toBe(false);
  });

  it('keeps the label so two accounts at one bank stay apart', () => {
    const parsed = createBankAccountSchema.parse(account({ label: 'Joint savings' }));
    expect(parsed.label).toBe('Joint savings');
  });
});

describe('upsertInterestYearSchema', () => {
  const year = (over: Record<string, unknown> = {}) => ({
    bankAccountId: UUID,
    taxYear: 2025,
    actorId: OTHER_UUID,
    interestCents: 41_237,
    ...over,
  });

  it('accepts box 1 on its own, which is all most 1099-INTs carry', () => {
    const parsed = upsertInterestYearSchema.parse(year());
    expect(parsed.interestCents).toBe(41_237);
    expect(parsed.taxExemptInterestCents).toBeNull();
    expect(parsed.federalTaxWithheldCents).toBeNull();
    expect(parsed.documentSource).toBeNull();
  });

  it('accepts the boxes that are usually blank and occasionally are not', () => {
    const parsed = upsertInterestYearSchema.parse(
      year({
        earlyWithdrawalPenaltyCents: 2_500,
        savingsBondInterestCents: 18_000,
        federalTaxWithheldCents: 10_309,
        taxExemptInterestCents: 7_400,
        documentSource: 'bank_statement',
        documentNote: 'No 1099-INT issued; figure from the December statement.',
      }),
    );
    expect(parsed.federalTaxWithheldCents).toBe(10_309);
    expect(parsed.documentSource).toBe('bank_statement');
  });

  it('rejects a source the picker does not offer', () => {
    expect(upsertInterestYearSchema.safeParse(year({ documentSource: 'form_1098' })).success)
      .toBe(false);
  });

  it('rejects negative interest', () => {
    expect(upsertInterestYearSchema.safeParse(year({ interestCents: -100 })).success).toBe(
      false,
    );
  });

  it('rejects a missing box 1 - a year with no figure is not a transcription', () => {
    expect(upsertInterestYearSchema.safeParse(year({ interestCents: undefined })).success).toBe(
      false,
    );
  });

  it('rejects a tax year that is not one', () => {
    expect(upsertInterestYearSchema.safeParse(year({ taxYear: 25 })).success).toBe(false);
  });
});

describe('createCharitySchema', () => {
  const charity = (over: Record<string, unknown> = {}) => ({
    name: 'American Red Cross',
    ...over,
  });

  it('accepts a charity with an EIN already hyphenated', () => {
    expect(createCharitySchema.parse(charity({ taxId: '53-0196605' })).taxId).toBe('53-0196605');
  });

  it('hyphenates nine bare digits, because that is how they come off a letter', () => {
    expect(createCharitySchema.parse(charity({ taxId: '530196605' })).taxId).toBe('53-0196605');
  });

  it('treats a blank EIN as not recorded rather than as a value', () => {
    // A gift whose letter is not to hand is still a gift worth recording, and a
    // blank must not read as an EIN of nothing.
    expect(createCharitySchema.parse(charity({ taxId: '   ' })).taxId).toBeNull();
    expect(createCharitySchema.parse(charity()).taxId).toBeNull();
  });

  it('rejects an EIN that is the wrong shape', () => {
    for (const taxId of ['53-019660', '5-30196605', '53 0196605', 'EIN 53-0196605', '12345']) {
      expect(createCharitySchema.safeParse(charity({ taxId })).success).toBe(false);
    }
  });

  it('rejects a name that is only whitespace', () => {
    expect(createCharitySchema.safeParse(charity({ name: '  ' })).success).toBe(false);
  });
});

describe('createDonationSchema', () => {
  const gift = (over: Record<string, unknown> = {}) => ({
    charityId: UUID,
    date: '2025-03-14',
    actorId: OTHER_UUID,
    amountCents: 25_000,
    kind: 'cash',
    ...over,
  });

  it('accepts a cash gift with nothing but the five required fields', () => {
    const parsed = createDonationSchema.parse(gift());
    expect(parsed.amountCents).toBe(25_000);
    expect(parsed.acknowledgmentOnFile).toBe(false);
    expect(parsed.receiptKey).toBeNull();
    expect(parsed.nonCashDescription).toBeNull();
  });

  it('accepts a non-cash gift that says what was given', () => {
    const parsed = createDonationSchema.parse(
      gift({ kind: 'non_cash', amountCents: 60_000, nonCashDescription: '12 boxes of books' }),
    );
    expect(parsed.nonCashDescription).toBe('12 boxes of books');
  });

  it('rejects a non-cash gift with no description', () => {
    // "$600" says nothing an auditor can check and nothing the owner will
    // remember next January.
    expect(createDonationSchema.safeParse(gift({ kind: 'non_cash', amountCents: 60_000 })).success)
      .toBe(false);
  });

  it('rejects a gift of nothing', () => {
    expect(createDonationSchema.safeParse(gift({ amountCents: 0 })).success).toBe(false);
    expect(createDonationSchema.safeParse(gift({ amountCents: -500 })).success).toBe(false);
  });

  it('rejects a kind the picker does not offer', () => {
    expect(createDonationSchema.safeParse(gift({ kind: 'check' })).success).toBe(false);
  });

  it('rejects a date that is not a real one', () => {
    expect(createDonationSchema.safeParse(gift({ date: '2025-02-30' })).success).toBe(false);
  });

  it('rejects a receipt hash that is not a digest', () => {
    expect(createDonationSchema.safeParse(gift({ receiptSha256: 'not-a-hash' })).success).toBe(
      false,
    );
  });
});
