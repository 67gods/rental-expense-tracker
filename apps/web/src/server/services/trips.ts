import { and, desc, eq, gte, lte } from 'drizzle-orm';
import {
  buildTripDrafts,
  createTripSchema,
  isBackdated,
  taxYearRange,
  type CreateTripInput,
} from '@rental/domain';
import { getDb } from '@/db/client';
import { timeEntries, trips, type Trip } from '@/db/schema';
import { env } from '@/env';
import { NotFoundError } from '../errors';

/**
 * Trips (§5.5).
 *
 * One trip becomes up to three linked rows. The drafts - including which
 * category the on-site time gets and the fact that drive time is never
 * eligible - come from @rental/domain, so the Android client at M4 produces
 * identical records through the same endpoint.
 */

export interface TripFilter {
  taxYear?: number;
  propertyId?: string;
  actorId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface TripResult {
  trip: Trip;
  driveTimeEntryId: string | null;
  onsiteTimeEntryId: string | null;
}

export async function createTrip(input: CreateTripInput): Promise<TripResult> {
  const data = createTripSchema.parse(input);
  const drafts = buildTripDrafts(data);
  const db = getDb();
  const backdated = isBackdated(data.date, new Date(), env.timeZone);

  // Write the time entries first so the trip row can point at them. If a later
  // step fails, the orphaned entries are visible in the time log rather than
  // silently lost - and the integrity check reports them.
  let driveTimeEntryId: string | null = null;
  if (drafts.driveTime) {
    const [row] = await db
      .insert(timeEntries)
      .values({
        date: drafts.driveTime.date,
        actorId: drafts.driveTime.actorId,
        enterpriseId: drafts.driveTime.enterpriseId,
        propertyId: drafts.driveTime.propertyId,
        minutes: drafts.driveTime.minutes,
        category: drafts.driveTime.category,
        description: drafts.driveTime.description,
        shEligible: drafts.driveTime.shEligible,
        shEligibleReason: 'category_not_eligible',
        isProvisional: false,
        source: drafts.driveTime.source,
        isBackdated: backdated,
      })
      .returning({ id: timeEntries.id });
    driveTimeEntryId = row?.id ?? null;
  }

  let onsiteTimeEntryId: string | null = null;
  if (drafts.onsiteTime) {
    const [row] = await db
      .insert(timeEntries)
      .values({
        date: drafts.onsiteTime.date,
        actorId: drafts.onsiteTime.actorId,
        enterpriseId: drafts.onsiteTime.enterpriseId,
        propertyId: drafts.onsiteTime.propertyId,
        minutes: drafts.onsiteTime.minutes,
        category: drafts.onsiteTime.category,
        description: drafts.onsiteTime.description,
        shEligible: drafts.onsiteTime.shEligible,
        shEligibleReason: drafts.onsiteTime.shEligible
          ? 'category_eligible'
          : 'linked_capital_improvement',
        isProvisional: drafts.onsiteTime.isProvisional,
        source: drafts.onsiteTime.source,
        isBackdated: backdated,
      })
      .returning({ id: timeEntries.id });
    onsiteTimeEntryId = row?.id ?? null;
  }

  const [trip] = await db
    .insert(trips)
    .values({
      date: drafts.mileage.date,
      actorId: drafts.mileage.actorId,
      propertyId: drafts.mileage.propertyId,
      origin: drafts.mileage.origin,
      destination: drafts.mileage.destination,
      destinationKind: drafts.mileage.destinationKind,
      miles: String(drafts.mileage.miles),
      purpose: drafts.mileage.purpose,
      driveTimeEntryId,
      onsiteTimeEntryId,
      source: drafts.mileage.source,
      isBackdated: backdated,
    })
    .returning();

  if (!trip) throw new Error('The trip was not saved.');
  return { trip, driveTimeEntryId, onsiteTimeEntryId };
}

export async function listTrips(filter: TripFilter = {}): Promise<Trip[]> {
  const db = getDb();
  const conditions = [];

  if (filter.taxYear) {
    const range = taxYearRange(filter.taxYear);
    conditions.push(gte(trips.date, range.start), lte(trips.date, range.end));
  }
  if (filter.from) conditions.push(gte(trips.date, filter.from));
  if (filter.to) conditions.push(lte(trips.date, filter.to));
  if (filter.propertyId) conditions.push(eq(trips.propertyId, filter.propertyId));
  if (filter.actorId) conditions.push(eq(trips.actorId, filter.actorId));

  return db
    .select()
    .from(trips)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(trips.date), desc(trips.createdAt))
    .limit(filter.limit ?? 500);
}

export async function getTrip(id: string): Promise<Trip> {
  const db = getDb();
  const [row] = await db.select().from(trips).where(eq(trips.id, id)).limit(1);
  if (!row) throw new NotFoundError('That trip no longer exists.');
  return row;
}

/**
 * Deletes a trip and the two time entries it created.
 *
 * Removing the trip alone would strand its drive and on-site time as entries
 * with no context, which is worse than either keeping or removing both.
 */
export async function deleteTrip(id: string): Promise<void> {
  const db = getDb();
  const trip = await getTrip(id);

  await db.delete(trips).where(eq(trips.id, id));

  for (const entryId of [trip.driveTimeEntryId, trip.onsiteTimeEntryId]) {
    if (entryId) await db.delete(timeEntries).where(eq(timeEntries.id, entryId));
  }
}
