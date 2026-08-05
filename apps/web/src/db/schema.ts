/**
 * Database schema (brief §6).
 *
 * Two rules shape this file:
 *
 * 1. Nothing exists without an attributed actor (§4, §10). Attribution columns
 *    are NOT NULL with a foreign key, so an unattributed record cannot be
 *    written even by a buggy service or a manual SQL fix.
 * 2. `created_at` is the contemporaneity evidence (§6). It is set by the
 *    database, never by the client, and never updated. `date` is what the user
 *    says happened; `created_at` is when they said it. Backdating is allowed
 *    and recorded, never hidden.
 *
 * Category lists that live in @rental/domain (hour categories, Schedule E
 * lines) are stored as text rather than Postgres enums. Duplicating those
 * tables into SQL would give them a second source of truth that drifts from the
 * one the tests cover.
 */

import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// --- Enums: small, stable sets that will not drift from the domain package ---

export const propertyTypeEnum = pgEnum('property_type', ['residential', 'commercial']);
export const actorTypeEnum = pgEnum('actor_type', [
  'owner',
  'spouse',
  'pm',
  'contractor',
  'other',
]);
export const entrySourceEnum = pgEnum('entry_source', [
  'manual',
  'timer',
  'geofence',
  'imported',
]);
export const capitalClassificationEnum = pgEnum('capital_classification', [
  'repair',
  'improvement',
  'needs_review',
]);
export const turnStatusEnum = pgEnum('turn_status', ['open', 'in_progress', 'complete']);
export const rentSourceEnum = pgEnum('rent_source', [
  'property_manager',
  'direct_from_tenant',
  'other',
]);
export const destinationKindEnum = pgEnum('destination_kind', [
  'property',
  'hardware_store',
  'contractor',
  'bank',
  'other',
]);
export const documentTypeEnum = pgEnum('document_type', [
  'lease',
  'insurance',
  'tax',
  'inspection',
  'w9',
  'invoice',
  // The two that carry the figures the year-end screen transcribes. Named
  // separately from 'tax' because "where did this number come from" is only a
  // useful question if the answer distinguishes them.
  'form_1098',
  'closing_disclosure',
  'other',
]);

const createdAt = timestamp('created_at', { withTimezone: true, mode: 'date' })
  .notNull()
  .defaultNow();
const updatedAt = timestamp('updated_at', { withTimezone: true, mode: 'date' })
  .notNull()
  .defaultNow();

// --- Enterprises (§5.4) -----------------------------------------------------

export const enterprises = pgTable('enterprises', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** Residential and commercial cannot be mixed in one enterprise (§5.4). */
  propertyType: propertyTypeEnum('property_type').notNull().default('residential'),
  taxYearActive: bigint('tax_year_active', { mode: 'number' }).notNull(),
  createdAt,
  updatedAt,
});

// --- Properties -------------------------------------------------------------

export const properties = pgTable(
  'properties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    enterpriseId: uuid('enterprise_id')
      .notNull()
      .references(() => enterprises.id, { onDelete: 'restrict' }),
    nickname: text('nickname').notNull(),
    address: text('address').notNull(),
    acquiredDate: date('acquired_date', { mode: 'string' }),
    /** Feeds the small-taxpayer threshold check (§5.3). */
    unadjustedBasisCents: bigint('unadjusted_basis_cents', { mode: 'number' })
      .notNull()
      .default(0),
    ownershipPct: numeric('ownership_pct', { precision: 5, scale: 2 })
      .notNull()
      .default('100'),
    /**
     * Display default only, kept for the property list badge. When management
     * periods exist they are the authority - see propertyManagementPeriods.
     */
    isSelfManaged: boolean('is_self_managed').notNull().default(false),
    /** Removes the property from its enterprise for the year (§5.4). */
    isTripleNet: boolean('is_triple_net').notNull().default(false),
    /** Removes the property from its enterprise for the year (§5.4). */
    hadPersonalUse: boolean('had_personal_use').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
    notes: text('notes'),

    // --- Placed in service ------------------------------------------------
    // Ready and available to rent. NOT the purchase date and NOT first
    // occupancy: on one of these properties those are 17 Nov, 2 Dec and the
    // following 16 Mar, and it is the middle one that sorts a year of spend
    // into operating and acquisition sides.
    placedInServiceDate: date('placed_in_service_date', { mode: 'string' }),
    /** Validated against PLACED_IN_SERVICE_EVIDENCE in @rental/domain. */
    placedInServiceEvidence: text('placed_in_service_evidence'),
    /** Kept separate from the above, because it is usually a later date. */
    firstTenantDate: date('first_tenant_date', { mode: 'string' }),

    // --- Purchase facts, transcribed from the closing statement -----------
    purchasePriceCents: bigint('purchase_price_cents', { mode: 'number' }),
    closingCostsCents: bigint('closing_costs_cents', { mode: 'number' }),
    /** Land does not depreciate. The app holds the split; the CPA uses it. */
    landValueCents: bigint('land_value_cents', { mode: 'number' }),

    // --- Conversion from a home -------------------------------------------
    wasPersonalResidence: boolean('was_personal_residence').notNull().default(false),
    convertedToRentalDate: date('converted_to_rental_date', { mode: 'string' }),
    /** One of the two inputs to a conversion basis. The app computes neither. */
    fmvAtConversionCents: bigint('fmv_at_conversion_cents', { mode: 'number' }),

    // --- Disposal ---------------------------------------------------------
    soldDate: date('sold_date', { mode: 'string' }),
    salePriceCents: bigint('sale_price_cents', { mode: 'number' }),

    /**
     * Which §469 activity this property is grouped into - an election the owner
     * made, recorded as a fact like an address. A different election from the
     * §199A enterprise above. NULL renders as the nickname, meaning ungrouped.
     */
    section469Activity: text('section_469_activity'),

    createdAt,
    updatedAt,
  },
  (t) => [
    index('properties_enterprise_idx').on(t.enterpriseId),
    check('properties_ownership_pct_range', sql`${t.ownershipPct} >= 0 AND ${t.ownershipPct} <= 100`),
    check('properties_basis_non_negative', sql`${t.unadjustedBasisCents} >= 0`),
    check('properties_nickname_present', sql`length(btrim(${t.nickname})) > 0`),
    check(
      'properties_money_non_negative',
      sql`(${t.purchasePriceCents} IS NULL OR ${t.purchasePriceCents} >= 0)
        AND (${t.closingCostsCents} IS NULL OR ${t.closingCostsCents} >= 0)
        AND (${t.landValueCents} IS NULL OR ${t.landValueCents} >= 0)
        AND (${t.fmvAtConversionCents} IS NULL OR ${t.fmvAtConversionCents} >= 0)
        AND (${t.salePriceCents} IS NULL OR ${t.salePriceCents} >= 0)`,
    ),
    check(
      'properties_sold_after_acquired',
      sql`${t.soldDate} IS NULL OR ${t.acquiredDate} IS NULL OR ${t.soldDate} >= ${t.acquiredDate}`,
    ),
  ],
);

// --- Management history -----------------------------------------------------
// `is_self_managed` is one boolean, but management changes: a property can be
// handed to an agent and taken back, and which arrangement was in force decides
// whose fee appears on which month. Periods carry that; the boolean cannot.
//
// No SQL exclusion constraint for overlaps - Drizzle does not express one - so
// the service enforces it on write and integrity.ts audits it after the fact.

export const propertyManagementPeriods = pgTable(
  'property_management_periods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    /** NULL means self-managed for this stretch. */
    managerActorId: uuid('manager_actor_id').references(() => actors.id, {
      onDelete: 'restrict',
    }),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    /** NULL means current. */
    endDate: date('end_date', { mode: 'string' }),
    notes: text('notes'),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('mgmt_periods_property_idx').on(t.propertyId),
    check(
      'mgmt_periods_date_order',
      sql`${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`,
    ),
    // At most one open period per property. A second "current" manager is not a
    // state that can be true, so it is refused at the database rather than
    // reported later.
    uniqueIndex('mgmt_periods_one_open_per_property')
      .on(t.propertyId)
      .where(sql`${t.endDate} IS NULL`),
  ],
);

// --- Actors (§4) ------------------------------------------------------------

export const actors = pgTable(
  'actors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    type: actorTypeEnum('type').notNull(),
    /** Present for the two people who sign in; null for contractors and PMs. */
    email: text('email'),
    /** Google's stable subject id, set on first sign-in. */
    authSubject: text('auth_subject'),
    w9OnFile: boolean('w9_on_file').notNull().default(false),
    taxIdCollected: boolean('tax_id_collected').notNull().default(false),
    phone: text('phone'),
    notes: text('notes'),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex('actors_email_unique').on(t.email),
    uniqueIndex('actors_auth_subject_unique').on(t.authSubject),
    check('actors_name_present', sql`length(btrim(${t.name})) > 0`),
  ],
);

// --- Turns (§6, built out at M3) -------------------------------------------

export const turns = pgTable(
  'turns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    vacancyStart: date('vacancy_start', { mode: 'string' }).notNull(),
    vacancyEnd: date('vacancy_end', { mode: 'string' }),
    status: turnStatusEnum('status').notNull().default('open'),
    notes: text('notes'),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('turns_property_idx').on(t.propertyId),
    check(
      'turns_vacancy_order',
      sql`${t.vacancyEnd} IS NULL OR ${t.vacancyEnd} >= ${t.vacancyStart}`,
    ),
  ],
);

// --- Jobs -------------------------------------------------------------------
// One real-world task - "buy a laptop for rental management" - with time,
// miles, and money as its line items. Generalises what `turns` already does for
// a make-ready.
//
// The header deliberately holds NO category, NO amount, and NO tax field.
// Everything tax-shaped stays on the children, which is what lets a job be
// summarised under one year's rules today and another's next year without a
// single row changing. A job that cached its own totals would be a stored
// answer to a question whose rules move.

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    /** NULL = portfolio-level. Children inherit it as their default. */
    propertyId: uuid('property_id').references(() => properties.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('jobs_property_idx').on(t.propertyId),
    check('jobs_title_present', sql`length(btrim(${t.title})) > 0`),
  ],
);

// --- Time entries (§5.1, §5.2, §6) -----------------------------------------

export const timeEntries = pgTable(
  'time_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The day the work happened, in the household timezone. */
    date: date('date', { mode: 'string' }).notNull(),
    /** §4: never "household". A merged log is unrecoverable after the fact. */
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id, { onDelete: 'restrict' }),
    enterpriseId: uuid('enterprise_id')
      .notNull()
      .references(() => enterprises.id, { onDelete: 'restrict' }),
    propertyId: uuid('property_id').references(() => properties.id, {
      onDelete: 'set null',
    }),
    turnId: uuid('turn_id').references(() => turns.id, { onDelete: 'set null' }),
    /** Membership in a job. Optional, and never required to log an entry. */
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    minutes: bigint('minutes', { mode: 'number' }).notNull(),
    /** Validated against @rental/domain, not against a Postgres enum. */
    category: text('category').notNull(),
    /** §6: required free text. A category alone is not a record. */
    description: text('description').notNull(),
    /**
     * A CACHE, not the answer.
     *
     * Eligibility is a rule and rules are keyed by tax year, so this column
     * records what the rule said on the day the row was written. Screens and
     * exports recompute via deriveShEligible(entry, taxYearOf(date)); this
     * exists so a list of 5,000 rows does not have to. `rulesVersion` below is
     * what makes a stale copy detectable instead of merely believed.
     */
    shEligible: boolean('sh_eligible').notNull(),
    shEligibleReason: text('sh_eligible_reason').notNull(),
    /** RULES_VERSION at the time the two columns above were derived. */
    rulesVersion: text('rules_version'),
    /** Eligibility hangs on an unresolved classification (§5.2). */
    isProvisional: boolean('is_provisional').notNull().default(false),
    /**
     * The expense whose classification governs this entry, if any (§5.2).
     * Expenses are declared below, so the reference is given as a callback -
     * Drizzle resolves it lazily, which is what makes the circular foreign key
     * between these two tables expressible.
     */
    linkedExpenseId: uuid('linked_expense_id').references(
      (): AnyPgColumn => expenses.id,
      { onDelete: 'set null' },
    ),
    source: entrySourceEnum('source').notNull().default('manual'),
    /** True when `date` is earlier than the day the row was written. */
    isBackdated: boolean('is_backdated').notNull().default(false),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('time_entries_date_idx').on(t.date),
    index('time_entries_actor_idx').on(t.actorId),
    index('time_entries_enterprise_date_idx').on(t.enterpriseId, t.date),
    index('time_entries_property_idx').on(t.propertyId),
    index('time_entries_linked_expense_idx').on(t.linkedExpenseId),
    index('time_entries_job_idx').on(t.jobId),
    check('time_entries_minutes_positive', sql`${t.minutes} > 0 AND ${t.minutes} <= 1440`),
    // §6: enforced here as well as in the form, because the form is not the
    // only way rows arrive - the API and the M4 sync path write here too.
    check('time_entries_description_present', sql`length(btrim(${t.description})) > 0`),
    check('time_entries_category_present', sql`length(btrim(${t.category})) > 0`),
  ],
);

// --- Expenses (§5.3, §6) ----------------------------------------------------

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * The INVOICE date - when the obligation arose. What was actually paid, and
     * when, lives in expensePayments. On the cash basis it is the payment date
     * that decides the year, so no report reads this column for that purpose.
     */
    date: date('date', { mode: 'string' }).notNull(),
    /** Who spent the money. */
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id, { onDelete: 'restrict' }),
    /**
     * Null when the cost is split across properties (§6), or when it is
     * portfolio-wide and not yet resolved to a property or a split - a real,
     * reviewable state rather than an omission. See needsPropertyOrSplit.
     */
    propertyId: uuid('property_id').references(() => properties.id, {
      onDelete: 'set null',
    }),
    turnId: uuid('turn_id').references(() => turns.id, { onDelete: 'set null' }),
    /** Membership in a job. Optional, and never required to log an expense. */
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    /** The INVOICE TOTAL. Reports sum settled payments instead. */
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    vendor: text('vendor').notNull(),
    scheduleECategory: text('schedule_e_category').notNull(),
    /** Null until the §5.3 prompt runs; `needs_review` when unresolved. */
    capitalClassification: capitalClassificationEnum('capital_classification'),
    /** §5.3: the reasoning trail is the point, so the answers are kept. */
    classificationAnswers: jsonb('classification_answers').$type<Record<string, unknown>>(),
    /** Safe-harbor checks that passed. Flags for the CPA, not conclusions. */
    safeHarborFlags: jsonb('safe_harbor_flags').$type<string[]>(),
    /** Set when the payee is a contractor, for the W-9 running total (§5.6). */
    contractorActorId: uuid('contractor_actor_id').references(() => actors.id, {
      onDelete: 'set null',
    }),
    receiptKey: text('receipt_key'),
    /**
     * SHA-256 of the receipt file's bytes, so the same photo uploaded twice is
     * recognised as the same photo.
     *
     * Separate from receiptKey because the key is a fresh UUID on every upload -
     * two uploads of one file collide on nothing. Null for receipts stored
     * before this column existed, and for expenses with no receipt at all;
     * neither is a gap, and the vendor/date/amount match covers both.
     */
    receiptSha256: text('receipt_sha256'),
    notes: text('notes'),
    /** Splits a shared cost without breaking the parent record (§6). */
    allocationRule: jsonb('allocation_rule').$type<Record<string, unknown>>(),
    /**
     * Set ONLY when the owner disagrees with the derived answer.
     *
     * Which side of the placed-in-service line a cost fell on is a comparison
     * between this row's date and the property's date, made at read time. It is
     * not stored, because a stored comparison is a rule baked into a row.
     */
    costTreatmentOverride: text('cost_treatment_override'),
    isBackdated: boolean('is_backdated').notNull().default(false),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('expenses_date_idx').on(t.date),
    index('expenses_property_idx').on(t.propertyId),
    index('expenses_actor_idx').on(t.actorId),
    index('expenses_contractor_idx').on(t.contractorActorId),
    index('expenses_classification_idx').on(t.capitalClassification),
    index('expenses_job_idx').on(t.jobId),
    index('expenses_receipt_sha256_idx').on(t.receiptSha256),
    // The duplicate check asks "same total, near this date" before it asks
    // anything about the vendor, so the pair is the useful index.
    index('expenses_amount_date_idx').on(t.amountCents, t.date),
    check('expenses_amount_non_negative', sql`${t.amountCents} >= 0`),
    check('expenses_vendor_present', sql`length(btrim(${t.vendor})) > 0`),
  ],
);

// --- Expense payments (cash basis) ------------------------------------------
// An expense is an OBLIGATION; a payment is a CASH EVENT. On the cash basis a
// cost is deducted in the year the money left, so one date on the expense
// cannot represent an $8,244 invoice settled $2,500 in December and the balance
// the following spring.
//
// Every expense has at least one payment row, including the ordinary same-day
// ones the service writes by itself. That is what keeps the split invisible:
// the expense form is unchanged, and this table only becomes visible for the
// two invoices a year that need it.

export const expensePayments = pgTable(
  'expense_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    expenseId: uuid('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    /** The day the money actually left. This is what decides the tax year. */
    paidDate: date('paid_date', { mode: 'string' }).notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    /**
     * Planned, not yet made. A plan is not a cash event, so a scheduled row
     * reaches no export until it is confirmed - which is exactly how the
     * remainder of an invoice "pushes to next year" without being deducted
     * twice or a year early.
     */
    isScheduled: boolean('is_scheduled').notNull().default(false),
    /** Validated against PAYMENT_METHODS in @rental/domain. */
    method: text('method'),
    /** Check number, confirmation id. Free text - never an account number. */
    reference: text('reference'),
    receiptKey: text('receipt_key'),
    notes: text('notes'),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('expense_payments_expense_idx').on(t.expenseId),
    index('expense_payments_paid_date_idx').on(t.paidDate),
    // Strictly positive: a zero payment is not an event, and a refund is its
    // own expense line rather than a payment running backwards.
    check('expense_payments_amount_positive', sql`${t.amountCents} > 0`),
  ],
);

// --- Rent income ------------------------------------------------------------
// Not in the §6 model, but §10 requires income by Schedule E line in the
// year-end export, and the small-taxpayer check needs gross receipts. Recording
// rent received is not the same as the rent collection excluded in §3.

export const rentReceipts = pgTable(
  'rent_receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    date: date('date', { mode: 'string' }).notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id, { onDelete: 'restrict' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    source: rentSourceEnum('source').notNull().default('property_manager'),
    notes: text('notes'),
    isBackdated: boolean('is_backdated').notNull().default(false),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('rent_receipts_date_idx').on(t.date),
    index('rent_receipts_property_idx').on(t.propertyId),
    check('rent_receipts_amount_non_negative', sql`${t.amountCents} >= 0`),
  ],
);

// --- Trips (§5.5) -----------------------------------------------------------

export const trips = pgTable(
  'trips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    date: date('date', { mode: 'string' }).notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id, { onDelete: 'restrict' }),
    propertyId: uuid('property_id').references(() => properties.id, {
      onDelete: 'set null',
    }),
    /** Membership in a job. Optional, and never required to log a trip. */
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    origin: text('origin').notNull(),
    destination: text('destination').notNull(),
    destinationKind: destinationKindEnum('destination_kind').notNull().default('property'),
    miles: numeric('miles', { precision: 8, scale: 1 }).notNull(),
    /** Required for the mileage record to be defensible (§5.5). */
    purpose: text('purpose').notNull(),
    /** As on expenses: set only when the owner overrides the derived side. */
    costTreatmentOverride: text('cost_treatment_override'),
    /** The two linked time entries produced by the same trip. */
    driveTimeEntryId: uuid('drive_time_entry_id').references(() => timeEntries.id, {
      onDelete: 'set null',
    }),
    onsiteTimeEntryId: uuid('onsite_time_entry_id').references(() => timeEntries.id, {
      onDelete: 'set null',
    }),
    source: entrySourceEnum('source').notNull().default('manual'),
    isBackdated: boolean('is_backdated').notNull().default(false),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('trips_date_idx').on(t.date),
    index('trips_actor_idx').on(t.actorId),
    index('trips_property_idx').on(t.propertyId),
    index('trips_job_idx').on(t.jobId),
    check('trips_miles_positive', sql`${t.miles} > 0`),
    check('trips_purpose_present', sql`length(btrim(${t.purpose})) > 0`),
    check('trips_endpoints_present', sql`length(btrim(${t.origin})) > 0 AND length(btrim(${t.destination})) > 0`),
  ],
);

// --- Documents --------------------------------------------------------------

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id').references(() => properties.id, {
      onDelete: 'cascade',
    }),
    actorId: uuid('actor_id').references(() => actors.id, { onDelete: 'set null' }),
    type: documentTypeEnum('type').notNull().default('other'),
    title: text('title').notNull(),
    fileKey: text('file_key').notNull(),
    effectiveDate: date('effective_date', { mode: 'string' }),
    createdAt,
    updatedAt,
  },
  (t) => [index('documents_property_idx').on(t.propertyId)],
);

// --- Loan and escrow facts, per property per year ---------------------------
// Transcribed from the Form 1098, or from wherever the figure actually was when
// the 1098 was silent. Box 10 was blank on all four of the household's 2025
// forms and the tax and insurance figures sat in a supplemental escrow block
// below the numbered boxes - so each money column carries a companion source,
// and "not found" is a recordable answer rather than a blank that reads as zero.
//
// These are the largest deductions on the return and none of them passes
// through the expense ledger, which is why they need somewhere of their own.

export const propertyLoanYears = pgTable(
  'property_loan_years',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    taxYear: bigint('tax_year', { mode: 'number' }).notNull(),
    /** Name only. No account numbers and no TINs, masked or otherwise. */
    lenderName: text('lender_name').notNull(),
    interestCents: bigint('interest_cents', { mode: 'number' }), // box 1
    pointsCents: bigint('points_cents', { mode: 'number' }), // box 6
    mortgageInsuranceCents: bigint('mortgage_insurance_cents', { mode: 'number' }), // box 5
    propertyTaxCents: bigint('property_tax_cents', { mode: 'number' }), // box 10, often blank
    /** Validated against DOCUMENT_SOURCES in @rental/domain. */
    propertyTaxSource: text('property_tax_source'),
    insurancePaidFromEscrowCents: bigint('insurance_paid_from_escrow_cents', {
      mode: 'number',
    }),
    insuranceSource: text('insurance_source'),
    escrowBalanceCents: bigint('escrow_balance_cents', { mode: 'number' }),
    originationDate: date('origination_date', { mode: 'string' }),
    originalPrincipalCents: bigint('original_principal_cents', { mode: 'number' }),
    interestRatePct: numeric('interest_rate_pct', { precision: 6, scale: 4 }),
    /** "Box 10 blank. Taxes in the supplemental block below the boxes." */
    documentNote: text('document_note'),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex('loan_years_property_year_lender').on(t.propertyId, t.taxYear, t.lenderName),
    index('loan_years_tax_year_idx').on(t.taxYear),
    check('loan_years_lender_present', sql`length(btrim(${t.lenderName})) > 0`),
  ],
);

// --- Interest income, per account per year ----------------------------------
// The one thing in this schema that is not about the rental at all.
//
// A household savings account, or an account in a business's name, earns
// interest that never touches a property, never reaches Schedule E, and lands
// on Schedule B instead. It is here because the January hand-off to the CPA is
// one hand-off, and a figure kept somewhere else is a figure that gets found in
// March.
//
// Shaped like the 1098 transcription above rather than like the rent ledger:
// one form, once a year, copied off a document. Nobody logs interest monthly.

export const bankAccounts = pgTable(
  'bank_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Name only. No account numbers and no TINs, masked or otherwise. */
    bankName: text('bank_name').notNull(),
    /**
     * Whose name the account is in, when that is a person.
     *
     * Exactly one of this and `holderName` is set, enforced below. An account
     * belonging to an LLC or a trust has no actor to point at - actors are the
     * household's people - and inventing one would put a company in the People
     * list. An account in a person's name must not be a loose string that
     * drifts from how they are spelled everywhere else. So: both, and a check
     * that refuses neither and refuses both.
     */
    holderActorId: uuid('holder_actor_id').references(() => actors.id, {
      onDelete: 'restrict',
    }),
    /** Whose name the account is in, when that is a business or a trust. */
    holderName: text('holder_name'),
    /** "Joint savings", "Operating" - tells two accounts at one bank apart. */
    label: text('label'),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt,
    updatedAt,
  },
  (t) => [
    check('bank_accounts_bank_present', sql`length(btrim(${t.bankName})) > 0`),
    check(
      'bank_accounts_holder_one_of',
      sql`(${t.holderActorId} IS NOT NULL) <> (${t.holderName} IS NOT NULL)`,
    ),
    // A table constraint rather than a unique index, because only the
    // constraint builder carries NULLS NOT DISTINCT - and without it the holder
    // columns and the label, all null by design, would let the same account be
    // added twice with the uniqueness never firing.
    unique('bank_accounts_identity')
      .on(t.bankName, t.holderActorId, t.holderName, t.label)
      .nullsNotDistinct(),
  ],
);

export const interestYears = pgTable(
  'interest_years',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bankAccountId: uuid('bank_account_id')
      .notNull()
      .references(() => bankAccounts.id, { onDelete: 'cascade' }),
    taxYear: bigint('tax_year', { mode: 'number' }).notNull(),
    /** Who transcribed it. Nothing exists without an attributed actor. */
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id, { onDelete: 'restrict' }),
    interestCents: bigint('interest_cents', { mode: 'number' }).notNull(), // box 1
    earlyWithdrawalPenaltyCents: bigint('early_withdrawal_penalty_cents', {
      mode: 'number',
    }), // box 2
    savingsBondInterestCents: bigint('savings_bond_interest_cents', { mode: 'number' }), // box 3
    federalTaxWithheldCents: bigint('federal_tax_withheld_cents', { mode: 'number' }), // box 4
    taxExemptInterestCents: bigint('tax_exempt_interest_cents', { mode: 'number' }), // box 8
    /** Validated against DOCUMENT_SOURCES in @rental/domain. */
    documentSource: text('document_source'),
    /** "No 1099-INT issued; figure from the December statement." */
    documentNote: text('document_note'),
    createdAt,
    updatedAt,
  },
  (t) => [
    // The upsert target. Retyping a mistyped box 1 is the second half of the
    // same task, not a new record.
    uniqueIndex('interest_years_account_year').on(t.bankAccountId, t.taxYear),
    index('interest_years_tax_year_idx').on(t.taxYear),
    check('interest_years_interest_non_negative', sql`${t.interestCents} >= 0`),
    check(
      'interest_years_penalty_non_negative',
      sql`${t.earlyWithdrawalPenaltyCents} IS NULL OR ${t.earlyWithdrawalPenaltyCents} >= 0`,
    ),
    check(
      'interest_years_savings_bond_non_negative',
      sql`${t.savingsBondInterestCents} IS NULL OR ${t.savingsBondInterestCents} >= 0`,
    ),
    check(
      'interest_years_withheld_non_negative',
      sql`${t.federalTaxWithheldCents} IS NULL OR ${t.federalTaxWithheldCents} >= 0`,
    ),
    check(
      'interest_years_tax_exempt_non_negative',
      sql`${t.taxExemptInterestCents} IS NULL OR ${t.taxExemptInterestCents} >= 0`,
    ),
  ],
);

// --- Rent received against rent reported ------------------------------------
// Three figures describe one year of rent and they never agree: what landed in
// the bank, what the 1099-MISC reported, and what the leases called for. The
// IRS matches the reported figure automatically, so that is the one that has to
// be explained.
//
// The app does not explain it - the owner does, one item at a time. It only
// holds them to arithmetic: receipts plus items must equal the reported figure
// exactly. A residual of one cent means something is still unaccounted for.

export const rentReconciliations = pgTable(
  'rent_reconciliations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    taxYear: bigint('tax_year', { mode: 'number' }).notNull(),
    /** The manager who issued the 1099. Null when self-managed. */
    payerActorId: uuid('payer_actor_id').references(() => actors.id, {
      onDelete: 'set null',
    }),
    /**
     * Box 1 exactly as issued. NULL until the form arrives, which is different
     * from zero - and the reconciliation rule keeps them different, because
     * "balanced" is the wrong thing to say about a year with no 1099 yet.
     */
    reportedGrossCents: bigint('reported_gross_cents', { mode: 'number' }),
    documentNote: text('document_note'),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex('rent_recon_property_year').on(t.propertyId, t.taxYear),
    index('rent_recon_tax_year_idx').on(t.taxYear),
  ],
);

export const rentReconciliationItems = pgTable(
  'rent_reconciliation_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reconciliationId: uuid('reconciliation_id')
      .notNull()
      .references(() => rentReconciliations.id, { onDelete: 'cascade' }),
    /** Validated against RECONCILIATION_KINDS in @rental/domain. */
    kind: text('kind').notNull(),
    /**
     * SIGNED, and the only signed money in the schema. Positive for money
     * reported but never banked - a fee withheld, a forfeited deposit, which is
     * income. Negative for money banked but not reported, which in practice
     * means a refundable deposit being held, which is not income. The app never
     * decides which of those a deposit was.
     */
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    note: text('note'),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('rent_recon_items_parent_idx').on(t.reconciliationId),
    check('rent_recon_items_non_zero', sql`${t.amountCents} <> 0`),
    check('rent_recon_items_kind_present', sql`length(btrim(${t.kind})) > 0`),
  ],
);

// --- Figures returned by the CPA --------------------------------------------
// Depreciation and anything else the app must not compute. Row-shaped rather
// than column-shaped because what comes back is not a fixed form: one
// depreciation figure per property today, a cost-seg component schedule or a
// suspended-loss carryforward later, a line that does not exist yet after that.
//
// Nothing here is derived. Every row is transcribed from a document, and
// `sourceNote` is NOT NULL because a figure nobody can trace back to a document
// cannot be checked next year.

export const cpaFigures = pgTable(
  'cpa_figures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** NULL = portfolio-level. */
    propertyId: uuid('property_id').references(() => properties.id, {
      onDelete: 'cascade',
    }),
    taxYear: bigint('tax_year', { mode: 'number' }).notNull(),
    /** Validated against CPA_FIGURE_KINDS in @rental/domain. */
    kind: text('kind').notNull(),
    /** A Schedule E category id when kind = schedule_e_line. */
    categoryId: text('category_id'),
    scheduleELine: bigint('schedule_e_line', { mode: 'number' }),
    /** "27.5-year building", "Suspended PAL carried forward". */
    label: text('label').notNull(),
    recoveryYears: numeric('recovery_years', { precision: 4, scale: 1 }),
    /** Signed: a carryforward and an adjustment can both run negative. */
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    /** "2025 Form 4562, received 12 Apr 2026". Required. */
    sourceNote: text('source_note').notNull(),
    enteredByActorId: uuid('entered_by_actor_id')
      .notNull()
      .references(() => actors.id, { onDelete: 'restrict' }),
    createdAt,
    updatedAt,
  },
  (t) => [
    // `label` is in the key so a cost-seg component schedule - several
    // depreciation rows for one property-year - fits without a migration.
    uniqueIndex('cpa_figures_property_year_kind_label').on(
      t.propertyId,
      t.taxYear,
      t.kind,
      t.label,
    ),
    index('cpa_figures_tax_year_idx').on(t.taxYear),
    check('cpa_figures_label_present', sql`length(btrim(${t.label})) > 0`),
    check('cpa_figures_source_present', sql`length(btrim(${t.sourceNote})) > 0`),
  ],
);

// --- Timers (§8.2) ----------------------------------------------------------
// Server-side so a closed tab, a dead laptop battery, or a switch to the phone
// does not lose the running entry.

export const timers = pgTable(
  'timers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id, { onDelete: 'cascade' }),
    enterpriseId: uuid('enterprise_id')
      .notNull()
      .references(() => enterprises.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id').references(() => properties.id, {
      onDelete: 'set null',
    }),
    category: text('category').notNull(),
    description: text('description').notNull().default(''),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    /** Set when stopped; the row is kept as the audit trail of the session. */
    stoppedAt: timestamp('stopped_at', { withTimezone: true, mode: 'date' }),
    /** The entry this timer produced, once stopped. */
    timeEntryId: uuid('time_entry_id').references(() => timeEntries.id, {
      onDelete: 'set null',
    }),
    createdAt,
  },
  (t) => [
    index('timers_actor_idx').on(t.actorId),
    // One running timer per person. A second start stops the first rather than
    // quietly double-counting the same stretch of time.
    uniqueIndex('timers_one_running_per_actor')
      .on(t.actorId)
      .where(sql`${t.stoppedAt} IS NULL`),
  ],
);

// --- Settings ---------------------------------------------------------------

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedAt,
});

// --- Inferred types ---------------------------------------------------------

export type Enterprise = typeof enterprises.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type Actor = typeof actors.$inferSelect;
export type Turn = typeof turns.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type RentReceipt = typeof rentReceipts.$inferSelect;
export type Trip = typeof trips.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type Timer = typeof timers.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type ExpensePayment = typeof expensePayments.$inferSelect;
export type PropertyManagementPeriod = typeof propertyManagementPeriods.$inferSelect;
export type PropertyLoanYear = typeof propertyLoanYears.$inferSelect;
export type RentReconciliation = typeof rentReconciliations.$inferSelect;
export type RentReconciliationItem = typeof rentReconciliationItems.$inferSelect;
export type CpaFigure = typeof cpaFigures.$inferSelect;
export type BankAccount = typeof bankAccounts.$inferSelect;
export type InterestYear = typeof interestYears.$inferSelect;

export type NewTimeEntry = typeof timeEntries.$inferInsert;
export type NewExpense = typeof expenses.$inferInsert;
export type NewRentReceipt = typeof rentReceipts.$inferInsert;
export type NewTrip = typeof trips.$inferInsert;
export type NewJob = typeof jobs.$inferInsert;
export type NewExpensePayment = typeof expensePayments.$inferInsert;
export type NewPropertyLoanYear = typeof propertyLoanYears.$inferInsert;
export type NewRentReconciliation = typeof rentReconciliations.$inferInsert;
export type NewCpaFigure = typeof cpaFigures.$inferInsert;
export type NewBankAccount = typeof bankAccounts.$inferInsert;
export type NewInterestYear = typeof interestYears.$inferInsert;
