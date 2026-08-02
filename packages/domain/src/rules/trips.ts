/**
 * Trips (brief §5.5).
 *
 * One trip produces up to three linked records: the deductible mileage, the
 * drive time (logged, never eligible), and the on-site time (categorised by the
 * user, usually eligible). Splitting them is the whole point - the productive
 * time at the stop is what counts as work, and merging it with the drive would
 * bury it.
 */

import {
  DRIVE_TIME_CATEGORY,
  getHourCategory,
  type HourCategoryId,
} from '../constants/hourCategories';
import { deriveShEligible } from './eligibility';
import type { CapitalClassification, DestinationKind, EntrySource } from '../types';

export class TripError extends Error {
  override readonly name = 'TripError';
}

/**
 * The on-site category a stop starts with.
 *
 * A hardware store stop defaults to purchase of materials, which is eligible.
 * It must never default to travel - that was the old failure mode where an
 * hour of picking out fixtures got logged as driving.
 */
export function defaultOnsiteCategory(
  kind: DestinationKind,
): HourCategoryId | null {
  switch (kind) {
    case 'hardware_store':
      return 'materials_purchase';
    case 'property':
      return 'repairs_maintenance';
    case 'contractor':
      return 'contractor_management';
    case 'bank':
      return 'rent_collection';
    case 'other':
      // No safe guess. The user picks, rather than the app assuming.
      return null;
  }
}

export interface TripInput {
  date: string;
  actorId: string;
  enterpriseId: string;
  propertyId: string | null;
  origin: string;
  destination: string;
  destinationKind: DestinationKind;
  miles: number;
  /** Required for a mileage record to be defensible. */
  purpose: string;
  /** Minutes behind the wheel, both directions. Optional. */
  driveMinutes?: number | null;
  /** Minutes actually working at the destination. Optional. */
  onsiteMinutes?: number | null;
  /** How the user categorised the on-site time. */
  onsiteCategory?: HourCategoryId | null;
  onsiteDescription?: string | null;
  /** Classification of linked work, if the stop was tied to a classified job. */
  linkedCapitalClassification?: CapitalClassification | null;
  source?: EntrySource;
}

export interface MileageRecordDraft {
  date: string;
  actorId: string;
  propertyId: string | null;
  origin: string;
  destination: string;
  destinationKind: DestinationKind;
  miles: number;
  purpose: string;
  source: EntrySource;
}

export interface TimeEntryDraft {
  date: string;
  actorId: string;
  enterpriseId: string;
  propertyId: string | null;
  minutes: number;
  category: HourCategoryId;
  description: string;
  shEligible: boolean;
  isProvisional: boolean;
  source: EntrySource;
  /** The rule set the eligibility above was derived under. */
  rulesVersion: string;
}

export interface TripDrafts {
  mileage: MileageRecordDraft;
  /** Absent when no drive time was recorded. */
  driveTime: TimeEntryDraft | null;
  /** Absent when the stop had no productive time worth logging. */
  onsiteTime: TimeEntryDraft | null;
}

/**
 * Builds the three drafts for one trip. The caller persists them in a single
 * transaction and links the two time entries back onto the trip row.
 */
export function buildTripDrafts(input: TripInput, taxYear: number): TripDrafts {
  if (!input.purpose?.trim()) {
    throw new TripError(
      'A mileage record needs a business purpose. "Trip to property" is not enough - say what you went to do.',
    );
  }
  if (!Number.isFinite(input.miles) || input.miles <= 0) {
    throw new TripError('Miles must be a positive number.');
  }
  if (!input.destination?.trim()) {
    throw new TripError('A mileage record needs a destination.');
  }
  if (!input.origin?.trim()) {
    throw new TripError('A mileage record needs a starting point.');
  }

  const source: EntrySource = input.source ?? 'manual';

  const mileage: MileageRecordDraft = {
    date: input.date,
    actorId: input.actorId,
    propertyId: input.propertyId,
    origin: input.origin.trim(),
    destination: input.destination.trim(),
    destinationKind: input.destinationKind,
    miles: input.miles,
    purpose: input.purpose.trim(),
    source,
  };

  const driveMinutes = input.driveMinutes ?? 0;
  let driveTime: TimeEntryDraft | null = null;
  if (driveMinutes > 0) {
    // Drive time is pinned to travel and is never eligible, regardless of what
    // the trip was for. Not a user choice.
    const eligibility = deriveShEligible({ category: DRIVE_TIME_CATEGORY }, taxYear);
    driveTime = {
      date: input.date,
      actorId: input.actorId,
      enterpriseId: input.enterpriseId,
      propertyId: input.propertyId,
      minutes: driveMinutes,
      category: DRIVE_TIME_CATEGORY,
      description: `Drive: ${mileage.origin} to ${mileage.destination}. ${mileage.purpose}`,
      shEligible: eligibility.shEligible,
      isProvisional: false,
      source,
      rulesVersion: eligibility.rulesVersion,
    };
  }

  const onsiteMinutes = input.onsiteMinutes ?? 0;
  let onsiteTime: TimeEntryDraft | null = null;
  if (onsiteMinutes > 0) {
    const category =
      input.onsiteCategory ?? defaultOnsiteCategory(input.destinationKind);
    if (!category) {
      throw new TripError(
        'Pick a category for the time spent at this stop. There is no safe default for this destination.',
      );
    }
    // Guard against a caller handing us the drive category for on-site work,
    // which would quietly discard eligible time.
    if (category === DRIVE_TIME_CATEGORY) {
      throw new TripError(
        'On-site time cannot be logged as travel. Travel is captured separately as drive time.',
      );
    }
    getHourCategory(category); // throws on an unknown id

    const description = input.onsiteDescription?.trim();
    if (!description) {
      throw new TripError(
        'Describe what you did at this stop. A category on its own is not a record.',
      );
    }

    const eligibility = deriveShEligible(
      {
        category,
        linkedCapitalClassification: input.linkedCapitalClassification ?? null,
      },
      taxYear,
    );

    onsiteTime = {
      date: input.date,
      actorId: input.actorId,
      enterpriseId: input.enterpriseId,
      propertyId: input.propertyId,
      minutes: onsiteMinutes,
      category,
      description,
      shEligible: eligibility.shEligible,
      isProvisional: eligibility.isProvisional,
      source,
      rulesVersion: eligibility.rulesVersion,
    };
  }

  return { mileage, driveTime, onsiteTime };
}

export interface DestinationKindOption {
  id: DestinationKind;
  label: string;
  helper: string;
}

/** Destination options for the trip form, in the order they are offered. */
export const DESTINATION_KINDS: readonly DestinationKindOption[] = [
  {
    id: 'property',
    label: 'A property',
    helper: 'Time on site defaults to repairs & maintenance.',
  },
  {
    id: 'hardware_store',
    label: 'Hardware store / supplier',
    helper: 'Time in the aisle defaults to purchase of materials.',
  },
  {
    id: 'contractor',
    label: 'Contractor meeting',
    helper: 'Time there defaults to contractor sourcing & supervision.',
  },
  {
    id: 'bank',
    label: 'Bank',
    helper: 'Time there defaults to rent collection.',
  },
  {
    id: 'other',
    label: 'Somewhere else',
    helper: 'You pick the category for time spent.',
  },
] as const;

/** Total miles for a set of trips, used by the mileage log summary. */
export function totalMiles(trips: readonly { miles: number }[]): number {
  return Math.round(trips.reduce((sum, t) => sum + t.miles, 0) * 10) / 10;
}
