/**
 * Core domain types.
 *
 * These describe the shape of the business, not the shape of the database.
 * The persistence layer maps onto these; it does not define them.
 */

/** Who performed the work. Never "household" - see brief §4. */
export type ActorType = 'owner' | 'spouse' | 'pm' | 'contractor' | 'other';

/** Residential and commercial cannot share an enterprise (§5.4). */
export type PropertyType = 'residential' | 'commercial';

/** How a record entered the system. `created_at` is the contemporaneity evidence (§6). */
export type EntrySource = 'manual' | 'timer' | 'geofence' | 'imported';

/**
 * Outcome of the repair-vs-improvement prompt (§5.3).
 * `needs_review` means unresolved, not "probably fine". It is never auto-resolved.
 */
export type CapitalClassification = 'repair' | 'improvement' | 'needs_review';

/** Where a trip ended. Drives the on-site category default (§5.5). */
export type DestinationKind =
  | 'property'
  | 'hardware_store'
  | 'contractor'
  | 'bank'
  | 'other';

/** Lifecycle of a between-tenant make-ready (§6, built out at M3). */
export type TurnStatus = 'open' | 'in_progress' | 'complete';

/** A minimal identifier pair used wherever the domain needs to name a record. */
export interface Ref {
  id: string;
  name: string;
}

/**
 * A property as the domain rules see it.
 * `unadjustedBasisCents` feeds the small-taxpayer threshold check (§5.3).
 */
export interface DomainProperty {
  id: string;
  enterpriseId: string;
  nickname: string;
  unadjustedBasisCents: number;
  ownershipPct: number;
  /** Triple-net leases remove the property from its enterprise (§5.4). */
  isTripleNet: boolean;
  /** Owner personal use during the year removes the property too (§5.4). */
  hadPersonalUse: boolean;
}

/** An enterprise groups properties for the 250-hour test (§5.4). */
export interface DomainEnterprise {
  id: string;
  name: string;
  propertyType: PropertyType;
  taxYearActive: number;
}

/** Everything the eligibility and rollup rules need from a time entry. */
export interface DomainTimeEntry {
  id: string;
  /** Calendar date the work happened, in the household timezone. */
  date: string;
  actorId: string;
  enterpriseId: string;
  propertyId: string | null;
  minutes: number;
  category: string;
  description: string;
  shEligible: boolean;
  /** True when eligibility hangs on an unresolved classification (§5.2). */
  isProvisional: boolean;
}

/** Everything the allocation and report rules need from an expense. */
export interface DomainExpense {
  id: string;
  date: string;
  propertyId: string | null;
  amountCents: number;
  vendor: string;
  scheduleECategory: string;
  capitalClassification: CapitalClassification | null;
  contractorActorId: string | null;
}
