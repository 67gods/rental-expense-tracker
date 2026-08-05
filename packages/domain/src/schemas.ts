/**
 * Validation schemas shared by the API routes and the client forms.
 *
 * One definition per payload, used on both sides. A rule enforced only in the
 * browser is not enforced, and a rule written twice drifts.
 */

import { z } from 'zod';
import { HOUR_CATEGORY_IDS, type HourCategoryId } from './constants/hourCategories';
import { SCHEDULE_E_CATEGORY_IDS, type ScheduleECategoryId } from './constants/scheduleE';
import {
  costTreatment,
  cpaFigureKind,
  documentSource,
  interestSource,
  paymentMethod,
  placedInServiceEvidence,
  reconciliationKind,
} from './constants/captureLists';
import { isIsoDate } from './dates';
import { propertyDateProblems } from './rules/placedInService';

const isoDate = z
  .string()
  .refine(isIsoDate, { message: 'Enter a real date as YYYY-MM-DD.' });

const uuid = z.string().uuid({ message: 'Expected a record id.' });

/** Free text that must actually contain something. */
const requiredText = (field: string, max = 500) =>
  z
    .string()
    .trim()
    .min(1, { message: `${field} is required.` })
    .max(max, { message: `${field} must be under ${max} characters.` });

const optionalText = (max = 2000) =>
  z.string().trim().max(max).optional().nullable().transform((v) => v || null);

/**
 * A SHA-256 digest as lowercase hex.
 *
 * Narrow on purpose: this value arrives from a hidden form field, and the only
 * thing that makes it safe to look up by is that it cannot be anything except
 * 64 hex characters.
 */
const receiptSha256 = z
  .string()
  .regex(/^[0-9a-f]{64}$/, { message: 'Expected a SHA-256 digest.' });

/** Money arrives from forms as a string and is stored as integer cents. */
const amountCents = z
  .number()
  .int({ message: 'Amounts are stored in whole cents.' })
  .min(0, { message: 'Amount cannot be negative.' })
  .max(1_000_000_000, { message: 'Amount looks wrong - over $10,000,000.' });

/**
 * The cast preserves the literal union rather than widening to `string`.
 * Without it a validated category would not satisfy `HourCategoryId`, and every
 * caller would need its own unchecked assertion - which is exactly how an
 * invalid category reaches the eligibility rule.
 */
export const hourCategorySchema = z.enum(
  HOUR_CATEGORY_IDS as unknown as [HourCategoryId, ...HourCategoryId[]],
);

export const scheduleECategorySchema = z.enum(
  SCHEDULE_E_CATEGORY_IDS as unknown as [ScheduleECategoryId, ...ScheduleECategoryId[]],
);

export const capitalClassificationSchema = z.enum([
  'repair',
  'improvement',
  'needs_review',
]);

export const destinationKindSchema = z.enum([
  'property',
  'hardware_store',
  'contractor',
  'bank',
  'other',
]);

export const actorTypeSchema = z.enum(['owner', 'spouse', 'pm', 'contractor', 'other']);
export const propertyTypeSchema = z.enum(['residential', 'commercial']);
export const rentSourceSchema = z.enum(['property_manager', 'direct_from_tenant', 'other']);

/**
 * The picker vocabularies, validated from their own lists rather than restated
 * as string unions. A second copy of a list is a list that drifts.
 */
const fromList = <T extends string>(
  list: { ids: readonly T[]; has: (id: string) => id is T },
  message: string,
) =>
  z.string().refine(list.has, { message }) as unknown as z.ZodType<T, z.ZodTypeDef, string>;

export const documentSourceSchema = fromList(
  documentSource,
  'Pick where that figure came from.',
);
export const interestSourceSchema = fromList(
  interestSource,
  'Pick where that interest figure came from.',
);
export const paymentMethodSchema = fromList(paymentMethod, 'Pick how it was paid.');
export const placedInServiceEvidenceSchema = fromList(
  placedInServiceEvidence,
  'Pick what shows the property was available to rent.',
);
export const cpaFigureKindSchema = fromList(cpaFigureKind, 'Pick what kind of figure this is.');
export const reconciliationKindSchema = fromList(
  reconciliationKind,
  'Pick why the two figures differ.',
);
export const costTreatmentSchema = fromList(costTreatment, 'Pick operating or acquisition.');

/** A tax year, used by every year-scoped record. */
const taxYear = z
  .number()
  .int()
  .min(1900, { message: 'That is not a usable tax year.' })
  .max(2999, { message: 'That is not a usable tax year.' });

/**
 * Money that may legitimately be negative.
 *
 * Only reconciliation items use this: a refundable deposit that reached the
 * bank and is not on the 1099 subtracts. Everywhere else negative money is a
 * data-entry error and `amountCents` rejects it.
 */
const signedAmountCents = z
  .number()
  .int({ message: 'Amounts are stored in whole cents.' })
  .min(-1_000_000_000, { message: 'Amount looks wrong - under -$10,000,000.' })
  .max(1_000_000_000, { message: 'Amount looks wrong - over $10,000,000.' });

/** An optional money field on a form that may simply be left blank. */
const optionalAmountCents = amountCents.nullable().optional().default(null);

// --- Time entries ----------------------------------------------------------

export const createTimeEntrySchema = z.object({
  date: isoDate,
  /**
   * §4: no record exists without an attributed actor, and §6: a category alone
   * is not a record. Both are enforced here, not just in the UI.
   */
  actorId: uuid,
  enterpriseId: uuid,
  propertyId: uuid.nullable().optional().default(null),
  turnId: uuid.nullable().optional().default(null),
  minutes: z
    .number()
    .int({ message: 'Log time in whole minutes.' })
    .min(1, { message: 'Log at least one minute.' })
    .max(1440, { message: 'A single entry cannot exceed 24 hours.' }),
  category: hourCategorySchema,
  description: requiredText('A description', 1000),
  /** Set only when this time is tied to classified physical work (§5.2). */
  linkedCapitalClassification: capitalClassificationSchema.nullable().optional().default(null),
  source: z.enum(['manual', 'timer', 'geofence', 'imported']).optional().default('manual'),
});
export type CreateTimeEntryInput = z.input<typeof createTimeEntrySchema>;

export const updateTimeEntrySchema = createTimeEntrySchema.partial().extend({
  id: uuid,
});
export type UpdateTimeEntryInput = z.input<typeof updateTimeEntrySchema>;

// --- Expenses --------------------------------------------------------------

export const allocationRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('equal'), propertyIds: z.array(uuid).min(1) }),
  z.object({ type: z.literal('basis'), propertyIds: z.array(uuid).min(1) }),
  z.object({ type: z.literal('ownership'), propertyIds: z.array(uuid).min(1) }),
  z.object({
    type: z.literal('custom'),
    shares: z
      .array(z.object({ propertyId: uuid, pct: z.number().min(0).max(100) }))
      .min(1),
  }),
]);

export const createExpenseSchema = z.object({
  date: isoDate,
  actorId: uuid,
  // Null with no allocationRule is a real state, not an omission: a
  // portfolio-wide expense with no split yet (§6). It stays off Schedule E -
  // see needsPropertyOrSplit - until a property or a split is set.
  propertyId: uuid.nullable().optional().default(null),
  turnId: uuid.nullable().optional().default(null),
  amountCents,
  vendor: requiredText('A vendor', 200),
  scheduleECategory: scheduleECategorySchema,
  capitalClassification: capitalClassificationSchema.nullable().optional().default(null),
  classificationAnswers: z.record(z.unknown()).nullable().optional().default(null),
  contractorActorId: uuid.nullable().optional().default(null),
  receiptKey: z.string().max(500).nullable().optional().default(null),
  /** Lowercase hex SHA-256 of the receipt bytes. Fixed width by construction. */
  receiptSha256: receiptSha256.nullable().optional().default(null),
  notes: optionalText(),
  allocationRule: allocationRuleSchema.nullable().optional().default(null),
});
export type CreateExpenseInput = z.input<typeof createExpenseSchema>;

export const updateExpenseSchema = z.object({
  id: uuid,
  date: isoDate.optional(),
  actorId: uuid.optional(),
  propertyId: uuid.nullable().optional(),
  turnId: uuid.nullable().optional(),
  amountCents: amountCents.optional(),
  vendor: requiredText('A vendor', 200).optional(),
  scheduleECategory: scheduleECategorySchema.optional(),
  capitalClassification: capitalClassificationSchema.nullable().optional(),
  classificationAnswers: z.record(z.unknown()).nullable().optional(),
  contractorActorId: uuid.nullable().optional(),
  receiptKey: z.string().max(500).nullable().optional(),
  receiptSha256: receiptSha256.nullable().optional(),
  notes: optionalText(),
  allocationRule: allocationRuleSchema.nullable().optional(),
});
export type UpdateExpenseInput = z.input<typeof updateExpenseSchema>;

// --- Rent income -----------------------------------------------------------

export const createRentReceiptSchema = z.object({
  date: isoDate,
  actorId: uuid,
  propertyId: uuid,
  amountCents,
  source: rentSourceSchema.optional().default('property_manager'),
  notes: optionalText(),
});
export type CreateRentReceiptInput = z.input<typeof createRentReceiptSchema>;

export const updateRentReceiptSchema = createRentReceiptSchema.partial().extend({
  id: uuid,
});

// --- Interest income --------------------------------------------------------
// Not rental income and not on Schedule E. A household savings account, or one
// in a business's name, earns interest that belongs on Schedule B - it is kept
// here so the January hand-off to the CPA is one hand-off.

/**
 * Exactly one holder, either a person or a business.
 *
 * An account belonging to an LLC or a trust has no actor to point at, and
 * inventing one would put a company in the People list. An account in a
 * person's name must not be a loose string that drifts from how they are
 * spelled everywhere else. So both are offered and neither is optional -
 * the same rule the database enforces with a check constraint.
 */
const holderIsOneOf = <T extends { holderActorId?: unknown; holderName?: unknown }>(
  value: T,
) => (value.holderActorId != null) !== (value.holderName != null);

const HOLDER_MESSAGE = 'Say whose name the account is in - a person or a business, not both.';

export const createBankAccountSchema = z
  .object({
    /** Name only. No account numbers and no TINs, masked or otherwise. */
    bankName: requiredText('The bank name', 200),
    holderActorId: uuid.nullable().optional().default(null),
    holderName: optionalText(200),
    /** "Joint savings", "Operating" - tells two accounts at one bank apart. */
    label: optionalText(200),
  })
  .refine(holderIsOneOf, { message: HOLDER_MESSAGE, path: ['holderActorId'] });
export type CreateBankAccountInput = z.input<typeof createBankAccountSchema>;

export const updateBankAccountSchema = z
  .object({
    id: uuid,
    bankName: requiredText('The bank name', 200),
    holderActorId: uuid.nullable().optional().default(null),
    holderName: optionalText(200),
    label: optionalText(200),
    isArchived: z.boolean().optional(),
  })
  .refine(holderIsOneOf, { message: HOLDER_MESSAGE, path: ['holderActorId'] });
export type UpdateBankAccountInput = z.input<typeof updateBankAccountSchema>;

/**
 * One 1099-INT, transcribed. Box 1 is the figure; the rest are the boxes that
 * are usually blank and occasionally are not.
 */
export const upsertInterestYearSchema = z.object({
  id: uuid.optional(),
  bankAccountId: uuid,
  taxYear,
  actorId: uuid,
  interestCents: amountCents, // box 1
  earlyWithdrawalPenaltyCents: optionalAmountCents, // box 2
  savingsBondInterestCents: optionalAmountCents, // box 3
  federalTaxWithheldCents: optionalAmountCents, // box 4
  taxExemptInterestCents: optionalAmountCents, // box 8
  documentSource: interestSourceSchema.nullable().optional().default(null),
  documentNote: optionalText(),
});
export type UpsertInterestYearInput = z.input<typeof upsertInterestYearSchema>;

// --- Trips -----------------------------------------------------------------

export const createTripSchema = z.object({
  date: isoDate,
  actorId: uuid,
  enterpriseId: uuid,
  propertyId: uuid.nullable().optional().default(null),
  origin: requiredText('A starting point', 200),
  destination: requiredText('A destination', 200),
  destinationKind: destinationKindSchema.optional().default('property'),
  miles: z
    .number()
    .positive({ message: 'Miles must be more than zero.' })
    .max(2000, { message: 'That is more than 2,000 miles - check the number.' }),
  purpose: requiredText('A business purpose', 500),
  driveMinutes: z.number().int().min(0).max(1440).nullable().optional().default(null),
  onsiteMinutes: z.number().int().min(0).max(1440).nullable().optional().default(null),
  onsiteCategory: hourCategorySchema.nullable().optional().default(null),
  onsiteDescription: z.string().trim().max(1000).nullable().optional().default(null),
  linkedCapitalClassification: capitalClassificationSchema.nullable().optional().default(null),
  source: z.enum(['manual', 'timer', 'geofence', 'imported']).optional().default('manual'),
});
export type CreateTripInput = z.input<typeof createTripSchema>;

// --- Properties, enterprises, actors ---------------------------------------

export const createEnterpriseSchema = z.object({
  name: requiredText('A name', 120),
  propertyType: propertyTypeSchema.optional().default('residential'),
  taxYearActive: z.number().int().min(1900).max(2999),
});

/**
 * Every field below the first four is optional and none of them blocks a save.
 * They are facts collected once from a closing package, and a property record
 * that refuses to save because the county tax card is in another room is a
 * property record that never gets created.
 */
export const createPropertySchema = z
  .object({
    enterpriseId: uuid,
    nickname: requiredText('A nickname', 80),
    address: requiredText('An address', 300),
    acquiredDate: isoDate.nullable().optional().default(null),
    unadjustedBasisCents: amountCents.optional().default(0),
    ownershipPct: z.number().min(0).max(100).optional().default(100),
    isSelfManaged: z.boolean().optional().default(false),
    isTripleNet: z.boolean().optional().default(false),
    hadPersonalUse: z.boolean().optional().default(false),

    // --- Placed in service: ready and available to rent ------------------
    placedInServiceDate: isoDate.nullable().optional().default(null),
    placedInServiceEvidence: placedInServiceEvidenceSchema.nullable().optional().default(null),
    firstTenantDate: isoDate.nullable().optional().default(null),

    // --- Purchase facts, off the closing statement ------------------------
    purchasePriceCents: optionalAmountCents,
    closingCostsCents: optionalAmountCents,
    /** Land does not depreciate. The CPA needs the split; the app just holds it. */
    landValueCents: optionalAmountCents,

    // --- Conversion from a home, where basis is the LESSER of two figures --
    wasPersonalResidence: z.boolean().optional().default(false),
    convertedToRentalDate: isoDate.nullable().optional().default(null),
    fmvAtConversionCents: optionalAmountCents,

    // --- Disposal ---------------------------------------------------------
    soldDate: isoDate.nullable().optional().default(null),
    salePriceCents: optionalAmountCents,

    /** An election the owner made, recorded as a fact. Blank means ungrouped. */
    section469Activity: optionalText(120),

    /**
     * Who manages it now. Consumed by the service to close the open management
     * period and open a new one; never stored on the property row itself.
     * The literal 'self' is how the form says "no manager" without a uuid.
     */
    managedByActorId: z
      .union([uuid, z.literal('self')])
      .nullable()
      .optional()
      .default(null),
  })
  // Delegated to `propertyDateProblems` rather than restated here, because the
  // update path has to ask the same question after merging a patch over the
  // stored row - something a partial schema cannot do, since it never sees the
  // fields the patch left out. Two copies of the rule would eventually be two
  // different rules.
  .superRefine((v, ctx) => {
    for (const problem of propertyDateProblems(v)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: problem.message,
        path: [problem.field],
      });
    }
  });
export type CreatePropertyInput = z.input<typeof createPropertySchema>;

/**
 * Rebuilt rather than `.partial()`: the refinements above wrap the object, and
 * a ZodEffects has no `.partial()`. Restating the shape keeps every field
 * optional for a patch while leaving the create-time rules intact.
 */
export const updatePropertySchema = z.object({
  id: uuid,
  enterpriseId: uuid.optional(),
  nickname: requiredText('A nickname', 80).optional(),
  address: requiredText('An address', 300).optional(),
  acquiredDate: isoDate.nullable().optional(),
  unadjustedBasisCents: amountCents.optional(),
  ownershipPct: z.number().min(0).max(100).optional(),
  isSelfManaged: z.boolean().optional(),
  isTripleNet: z.boolean().optional(),
  hadPersonalUse: z.boolean().optional(),
  placedInServiceDate: isoDate.nullable().optional(),
  placedInServiceEvidence: placedInServiceEvidenceSchema.nullable().optional(),
  firstTenantDate: isoDate.nullable().optional(),
  purchasePriceCents: amountCents.nullable().optional(),
  closingCostsCents: amountCents.nullable().optional(),
  landValueCents: amountCents.nullable().optional(),
  wasPersonalResidence: z.boolean().optional(),
  convertedToRentalDate: isoDate.nullable().optional(),
  fmvAtConversionCents: amountCents.nullable().optional(),
  soldDate: isoDate.nullable().optional(),
  salePriceCents: amountCents.nullable().optional(),
  section469Activity: optionalText(120),
  managedByActorId: z.union([uuid, z.literal('self')]).nullable().optional(),
});
export type UpdatePropertyInput = z.input<typeof updatePropertySchema>;

export const createActorSchema = z.object({
  name: requiredText('A name', 120),
  type: actorTypeSchema,
  email: z.string().email().nullable().optional().default(null),
  w9OnFile: z.boolean().optional().default(false),
  taxIdCollected: z.boolean().optional().default(false),
  notes: optionalText(),
});
export type CreateActorInput = z.input<typeof createActorSchema>;

export const updateActorSchema = createActorSchema.partial().extend({ id: uuid });

// --- Timer -----------------------------------------------------------------

export const startTimerSchema = z.object({
  actorId: uuid,
  enterpriseId: uuid,
  propertyId: uuid.nullable().optional().default(null),
  category: hourCategorySchema,
  description: z.string().trim().max(1000).optional().default(''),
});
export type StartTimerInput = z.input<typeof startTimerSchema>;

export const stopTimerSchema = z.object({
  id: uuid,
  description: requiredText('A description', 1000),
  /**
   * Lets the user correct a timer they forgot to stop. The recorded elapsed
   * time changes; `created_at` on the resulting entry does not (§8.2).
   */
  minutesOverride: z.number().int().min(1).max(1440).nullable().optional().default(null),
  category: hourCategorySchema.optional(),
  propertyId: uuid.nullable().optional(),
});
export type StopTimerInput = z.input<typeof stopTimerSchema>;

// --- Expense payments (cash basis) -----------------------------------------

export const createExpensePaymentSchema = z.object({
  expenseId: uuid,
  paidDate: isoDate,
  // Strictly positive. A zero payment is not an event, and a negative one is a
  // refund - which is its own expense line, not a payment that runs backwards.
  amountCents: amountCents.refine((v) => v > 0, {
    message: 'A payment has to be more than zero.',
  }),
  /** Planned, not yet made. Deductible nowhere until this is false. */
  isScheduled: z.boolean().optional().default(false),
  method: paymentMethodSchema.nullable().optional().default(null),
  reference: optionalText(120),
  receiptKey: z.string().max(500).nullable().optional().default(null),
  notes: optionalText(),
});
export type CreateExpensePaymentInput = z.input<typeof createExpensePaymentSchema>;

export const updateExpensePaymentSchema = z.object({
  id: uuid,
  paidDate: isoDate.optional(),
  amountCents: amountCents
    .refine((v) => v > 0, { message: 'A payment has to be more than zero.' })
    .optional(),
  isScheduled: z.boolean().optional(),
  method: paymentMethodSchema.nullable().optional(),
  reference: optionalText(120),
  receiptKey: z.string().max(500).nullable().optional(),
  notes: optionalText(),
});
export type UpdateExpensePaymentInput = z.input<typeof updateExpensePaymentSchema>;

/** Spreading a remainder over instalments from the expense detail screen. */
export const planInstalmentsSchema = z.object({
  expenseId: uuid,
  count: z
    .number()
    .int()
    .min(1, { message: 'At least one instalment.' })
    .max(60, { message: 'More than 60 instalments is almost certainly a mistake.' }),
  firstDate: isoDate,
});
export type PlanInstalmentsInput = z.input<typeof planInstalmentsSchema>;

// --- Loan and escrow facts per property per year ---------------------------

/**
 * Transcribed from the Form 1098, or from wherever the figure actually was when
 * the 1098 was silent. Box 10 was blank on all four of the household's 2025
 * forms, with the tax and insurance figures in a supplemental escrow block, so
 * every money field carries a companion source.
 */
export const upsertLoanYearSchema = z.object({
  id: uuid.optional(),
  propertyId: uuid,
  taxYear,
  /** Name only. No account numbers and no TINs, masked or otherwise. */
  lenderName: requiredText('The lender name', 200),
  interestCents: optionalAmountCents,
  pointsCents: optionalAmountCents,
  mortgageInsuranceCents: optionalAmountCents,
  propertyTaxCents: optionalAmountCents,
  propertyTaxSource: documentSourceSchema.nullable().optional().default(null),
  insurancePaidFromEscrowCents: optionalAmountCents,
  insuranceSource: documentSourceSchema.nullable().optional().default(null),
  escrowBalanceCents: optionalAmountCents,
  originationDate: isoDate.nullable().optional().default(null),
  originalPrincipalCents: optionalAmountCents,
  interestRatePct: z.number().min(0).max(100).nullable().optional().default(null),
  documentNote: optionalText(),
});
export type UpsertLoanYearInput = z.input<typeof upsertLoanYearSchema>;

// --- Rent reconciliation ----------------------------------------------------

export const upsertRentReconciliationSchema = z.object({
  id: uuid.optional(),
  propertyId: uuid,
  taxYear,
  payerActorId: uuid.nullable().optional().default(null),
  /**
   * Box 1 of the 1099-MISC exactly as issued. Null until the form arrives -
   * which is different from zero, and the reconciliation rule treats it so.
   */
  reportedGrossCents: optionalAmountCents,
  documentNote: optionalText(),
});
export type UpsertRentReconciliationInput = z.input<typeof upsertRentReconciliationSchema>;

export const createReconciliationItemSchema = z.object({
  reconciliationId: uuid,
  kind: reconciliationKindSchema,
  /**
   * The only signed money in the app. Positive for money reported but never
   * banked - a fee withheld, a forfeited deposit. Negative for money banked but
   * not reported, which in practice means a deposit being held.
   */
  amountCents: signedAmountCents.refine((v) => v !== 0, {
    message: 'An item of zero explains nothing. Remove it instead.',
  }),
  note: optionalText(),
});
export type CreateReconciliationItemInput = z.input<typeof createReconciliationItemSchema>;

// --- Figures returned by the CPA -------------------------------------------

export const upsertCpaFigureSchema = z
  .object({
    id: uuid.optional(),
    /** Null for a portfolio-level figure. */
    propertyId: uuid.nullable().optional().default(null),
    taxYear,
    kind: cpaFigureKindSchema,
    categoryId: scheduleECategorySchema.nullable().optional().default(null),
    scheduleELine: z.number().int().min(1).max(99).nullable().optional().default(null),
    label: requiredText('A label', 200),
    recoveryYears: z.number().min(0).max(99).nullable().optional().default(null),
    /** Signed: a carryforward and an adjustment can both run negative. */
    amountCents: signedAmountCents,
    /** Required. A figure with no provenance cannot be checked next year. */
    sourceNote: requiredText('Where this figure came from', 500),
    enteredByActorId: uuid,
  })
  .refine((v) => v.kind !== 'schedule_e_line' || v.categoryId != null, {
    message: 'A Schedule E figure needs to say which line it belongs on.',
    path: ['categoryId'],
  });
export type UpsertCpaFigureInput = z.input<typeof upsertCpaFigureSchema>;

// --- Jobs -------------------------------------------------------------------

export const createJobSchema = z.object({
  title: requiredText('A title', 200),
  propertyId: uuid.nullable().optional().default(null),
  notes: optionalText(),
});
export type CreateJobInput = z.input<typeof createJobSchema>;

export const updateJobSchema = z.object({
  id: uuid,
  title: requiredText('A title', 200).optional(),
  propertyId: uuid.nullable().optional(),
  notes: optionalText(),
});

/**
 * Attaching existing records to a job, which is the "group these" action.
 * A job may be named instead of identified, so the first grouping does not
 * require creating the job as a separate step.
 */
export const assignJobSchema = z
  .object({
    jobId: uuid.optional(),
    newJobTitle: requiredText('A title', 200).optional(),
    timeEntryIds: z.array(uuid).optional().default([]),
    tripIds: z.array(uuid).optional().default([]),
    expenseIds: z.array(uuid).optional().default([]),
  })
  .refine((v) => v.jobId != null || v.newJobTitle != null, {
    message: 'Pick a job to add these to, or name a new one.',
    path: ['jobId'],
  })
  .refine(
    (v) =>
      v.timeEntryIds.length + v.tripIds.length + v.expenseIds.length > 0,
    {
      message: 'Select at least one record to group.',
      path: ['timeEntryIds'],
    },
  );
export type AssignJobInput = z.input<typeof assignJobSchema>;

/** Detaching a record leaves it intact; only the membership goes. */
export const unassignJobSchema = z.object({
  timeEntryIds: z.array(uuid).optional().default([]),
  tripIds: z.array(uuid).optional().default([]),
  expenseIds: z.array(uuid).optional().default([]),
});
export type UnassignJobInput = z.input<typeof unassignJobSchema>;

// --- Reports ---------------------------------------------------------------

export const reportQuerySchema = z.object({
  taxYear: z.coerce.number().int().min(1900).max(2999),
  enterpriseId: uuid.optional(),
  propertyId: uuid.optional(),
  actorId: uuid.optional(),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;
