/**
 * Validation schemas shared by the API routes and the client forms.
 *
 * One definition per payload, used on both sides. A rule enforced only in the
 * browser is not enforced, and a rule written twice drifts.
 */

import { z } from 'zod';
import { HOUR_CATEGORY_IDS, type HourCategoryId } from './constants/hourCategories';
import { SCHEDULE_E_CATEGORY_IDS, type ScheduleECategoryId } from './constants/scheduleE';
import { isIsoDate } from './dates';

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

export const createExpenseSchema = z
  .object({
    date: isoDate,
    actorId: uuid,
    propertyId: uuid.nullable().optional().default(null),
    turnId: uuid.nullable().optional().default(null),
    amountCents,
    vendor: requiredText('A vendor', 200),
    scheduleECategory: scheduleECategorySchema,
    capitalClassification: capitalClassificationSchema.nullable().optional().default(null),
    classificationAnswers: z.record(z.unknown()).nullable().optional().default(null),
    contractorActorId: uuid.nullable().optional().default(null),
    receiptKey: z.string().max(500).nullable().optional().default(null),
    notes: optionalText(),
    allocationRule: allocationRuleSchema.nullable().optional().default(null),
  })
  .refine((v) => v.propertyId != null || v.allocationRule != null, {
    message: 'Pick a property, or set up a split across several.',
    path: ['propertyId'],
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

export const createPropertySchema = z.object({
  enterpriseId: uuid,
  nickname: requiredText('A nickname', 80),
  address: requiredText('An address', 300),
  acquiredDate: isoDate.nullable().optional().default(null),
  unadjustedBasisCents: amountCents.optional().default(0),
  ownershipPct: z.number().min(0).max(100).optional().default(100),
  isSelfManaged: z.boolean().optional().default(false),
  isTripleNet: z.boolean().optional().default(false),
  hadPersonalUse: z.boolean().optional().default(false),
});
export type CreatePropertyInput = z.input<typeof createPropertySchema>;

export const updatePropertySchema = createPropertySchema.partial().extend({ id: uuid });

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

// --- Reports ---------------------------------------------------------------

export const reportQuerySchema = z.object({
  taxYear: z.coerce.number().int().min(1900).max(2999),
  enterpriseId: uuid.optional(),
  propertyId: uuid.optional(),
  actorId: uuid.optional(),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;
