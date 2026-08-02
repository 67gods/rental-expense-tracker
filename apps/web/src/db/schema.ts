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
    isSelfManaged: boolean('is_self_managed').notNull().default(false),
    /** Removes the property from its enterprise for the year (§5.4). */
    isTripleNet: boolean('is_triple_net').notNull().default(false),
    /** Removes the property from its enterprise for the year (§5.4). */
    hadPersonalUse: boolean('had_personal_use').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
    notes: text('notes'),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('properties_enterprise_idx').on(t.enterpriseId),
    check('properties_ownership_pct_range', sql`${t.ownershipPct} >= 0 AND ${t.ownershipPct} <= 100`),
    check('properties_basis_non_negative', sql`${t.unadjustedBasisCents} >= 0`),
    check('properties_nickname_present', sql`length(btrim(${t.nickname})) > 0`),
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
    minutes: bigint('minutes', { mode: 'number' }).notNull(),
    /** Validated against @rental/domain, not against a Postgres enum. */
    category: text('category').notNull(),
    /** §6: required free text. A category alone is not a record. */
    description: text('description').notNull(),
    /** Derived by deriveShEligible(). Never accepted from a client. */
    shEligible: boolean('sh_eligible').notNull(),
    shEligibleReason: text('sh_eligible_reason').notNull(),
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
    date: date('date', { mode: 'string' }).notNull(),
    /** Who spent the money. */
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id, { onDelete: 'restrict' }),
    /** Null only when the cost is split across properties (§6). */
    propertyId: uuid('property_id').references(() => properties.id, {
      onDelete: 'set null',
    }),
    turnId: uuid('turn_id').references(() => turns.id, { onDelete: 'set null' }),
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
    notes: text('notes'),
    /** Splits a shared cost without breaking the parent record (§6). */
    allocationRule: jsonb('allocation_rule').$type<Record<string, unknown>>(),
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
    check('expenses_amount_non_negative', sql`${t.amountCents} >= 0`),
    check('expenses_vendor_present', sql`length(btrim(${t.vendor})) > 0`),
    // An expense belongs to a property, or it carries a rule saying how it is
    // shared between several. Neither is not a valid state.
    check(
      'expenses_property_or_allocation',
      sql`${t.propertyId} IS NOT NULL OR ${t.allocationRule} IS NOT NULL`,
    ),
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
    origin: text('origin').notNull(),
    destination: text('destination').notNull(),
    destinationKind: destinationKindEnum('destination_kind').notNull().default('property'),
    miles: numeric('miles', { precision: 8, scale: 1 }).notNull(),
    /** Required for the mileage record to be defensible (§5.5). */
    purpose: text('purpose').notNull(),
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

export type NewTimeEntry = typeof timeEntries.$inferInsert;
export type NewExpense = typeof expenses.$inferInsert;
export type NewRentReceipt = typeof rentReceipts.$inferInsert;
export type NewTrip = typeof trips.$inferInsert;
