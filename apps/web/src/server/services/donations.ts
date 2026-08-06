import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import {
  createCharitySchema,
  createDonationSchema,
  taxYearRange,
  updateCharitySchema,
  updateDonationSchema,
  type CreateCharityInput,
  type CreateDonationInput,
  type UpdateCharityInput,
  type UpdateDonationInput,
} from '@rental/domain';
import { getDb } from '@/db/client';
import { charities, donations, type Charity, type Donation } from '@/db/schema';
import { NotFoundError, ValidationError } from '../errors';

/**
 * Charitable giving, recorded gift by gift.
 *
 * The second part of this app that is not about the rental. A gift to a charity
 * is an itemized deduction on Schedule A, it never reaches Schedule E, and it
 * lives here because the acknowledgment letters arrive in the same post as the
 * 1099-INTs - and a deduction kept in a shoebox is a deduction nobody claims.
 *
 * Shaped like the rent ledger rather than like `interest`: a charity is a
 * reusable record, but each gift to it is its own row rather than a yearly
 * figure corrected in place. Two envelopes to one church on one Sunday are two
 * gifts, so there is no uniqueness to upsert against and `createDonation`
 * inserts.
 */

// --- Charities ---------------------------------------------------------------

export async function listCharities(
  filter: { includeArchived?: boolean } = {},
): Promise<Charity[]> {
  return getDb()
    .select()
    .from(charities)
    .where(filter.includeArchived ? undefined : eq(charities.isArchived, false))
    .orderBy(asc(charities.name));
}

export async function createCharity(input: CreateCharityInput): Promise<Charity> {
  const data = createCharitySchema.parse(input);

  const [row] = await getDb()
    .insert(charities)
    .values({ name: data.name, taxId: data.taxId })
    // The uniqueness stops one church becoming three churches across three
    // years of giving. Saying so beats a raw constraint violation.
    .onConflictDoNothing()
    .returning();

  if (!row) {
    throw new ValidationError('That charity is already on file.', { name: 'Already added' });
  }
  return row;
}

export async function updateCharity(input: UpdateCharityInput): Promise<Charity> {
  const data = updateCharitySchema.parse(input);

  const [row] = await getDb()
    .update(charities)
    .set({
      name: data.name,
      taxId: data.taxId,
      ...(data.isArchived === undefined ? {} : { isArchived: data.isArchived }),
      updatedAt: new Date(),
    })
    .where(eq(charities.id, data.id))
    .returning();

  if (!row) throw new NotFoundError('That charity no longer exists.');
  return row;
}

/**
 * Archived, never deleted.
 *
 * A charity the household has stopped giving to still received the gifts it
 * received, and those gifts are the deduction. The foreign key is `restrict`
 * rather than `cascade` precisely so a delete cannot take them - so this is the
 * only way to get a charity out of the pickers.
 */
export async function archiveCharity(id: string): Promise<void> {
  const [row] = await getDb()
    .update(charities)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(eq(charities.id, id))
    .returning({ id: charities.id });
  if (!row) throw new NotFoundError('That charity no longer exists.');
}

// --- The gifts ---------------------------------------------------------------

export interface DonationView extends Donation {
  charityName: string;
  /** The donee's EIN, when the letter carried one. */
  charityTaxId: string | null;
}

/**
 * The year's gifts, newest first, each carrying its charity's name and EIN.
 *
 * Joined here rather than stitched together in the page, because the name and
 * the EIN are two of the four columns the table shows - every caller needs them,
 * so no caller should have to remember to look them up.
 *
 * The year filter is a DATE RANGE, not a column. Donations are dated events,
 * unlike `interest_years`, so there is no `tax_year` to compare against and
 * inventing one would be a second answer to "which year is this in".
 */
export async function listDonations(
  filter: { taxYear?: number; charityId?: string } = {},
): Promise<DonationView[]> {
  const conditions = [];
  if (filter.taxYear) {
    const range = taxYearRange(filter.taxYear);
    conditions.push(gte(donations.date, range.start), lte(donations.date, range.end));
  }
  if (filter.charityId) conditions.push(eq(donations.charityId, filter.charityId));

  // No filter on charities.isArchived. Archiving takes a charity out of the
  // pickers; it does not unmake the gifts, and those gifts are the deduction.

  return getDb()
    .select({
      id: donations.id,
      charityId: donations.charityId,
      date: donations.date,
      actorId: donations.actorId,
      amountCents: donations.amountCents,
      kind: donations.kind,
      nonCashDescription: donations.nonCashDescription,
      acknowledgmentOnFile: donations.acknowledgmentOnFile,
      receiptKey: donations.receiptKey,
      receiptSha256: donations.receiptSha256,
      note: donations.note,
      createdAt: donations.createdAt,
      updatedAt: donations.updatedAt,
      charityName: charities.name,
      charityTaxId: charities.taxId,
    })
    .from(donations)
    .innerJoin(charities, eq(charities.id, donations.charityId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(donations.date), asc(charities.name));
}

/**
 * Records one gift.
 *
 * An insert, deliberately - not the upsert `upsertInterestYear` is. A 1099-INT
 * arrives once and gets retyped when a digit was wrong; a gift is an event, and
 * a household that gives twice in a week has given twice.
 */
export async function createDonation(input: CreateDonationInput): Promise<Donation> {
  const data = createDonationSchema.parse(input);

  const [row] = await getDb()
    .insert(donations)
    .values({
      charityId: data.charityId,
      date: data.date,
      actorId: data.actorId,
      amountCents: data.amountCents,
      kind: data.kind,
      nonCashDescription: data.nonCashDescription,
      acknowledgmentOnFile: data.acknowledgmentOnFile,
      receiptKey: data.receiptKey,
      receiptSha256: data.receiptSha256,
      note: data.note,
    })
    .returning();

  if (!row) throw new Error('The donation was not saved.');
  return row;
}

export async function updateDonation(input: UpdateDonationInput): Promise<Donation> {
  const data = updateDonationSchema.parse(input);

  const [row] = await getDb()
    .update(donations)
    .set({
      charityId: data.charityId,
      date: data.date,
      amountCents: data.amountCents,
      kind: data.kind,
      nonCashDescription: data.nonCashDescription,
      acknowledgmentOnFile: data.acknowledgmentOnFile,
      receiptKey: data.receiptKey,
      receiptSha256: data.receiptSha256,
      note: data.note,
      updatedAt: new Date(),
      // actorId is not updated. It records who entered the gift, which does not
      // change because somebody else later fixed a typo in it.
    })
    .where(eq(donations.id, data.id))
    .returning();

  if (!row) throw new NotFoundError('That donation no longer exists.');
  return row;
}

export async function deleteDonation(id: string): Promise<void> {
  const deleted = await getDb()
    .delete(donations)
    .where(eq(donations.id, id))
    .returning({ id: donations.id });
  if (deleted.length === 0) throw new NotFoundError('That donation no longer exists.');
}

// --- Rollups ----------------------------------------------------------------

export interface DonationTotals {
  totalCents: number;
  cashCents: number;
  nonCashCents: number;
  giftCount: number;
  /** How many distinct charities were given to. */
  charityCount: number;
}

export async function donationTotalsForYear(taxYear: number): Promise<DonationTotals> {
  const rows = await listDonations({ taxYear });
  const charityIds = new Set(rows.map((row) => row.charityId));

  return rows.reduce<DonationTotals>(
    (totals, row) => ({
      totalCents: totals.totalCents + row.amountCents,
      cashCents: totals.cashCents + (row.kind === 'cash' ? row.amountCents : 0),
      nonCashCents: totals.nonCashCents + (row.kind === 'non_cash' ? row.amountCents : 0),
      giftCount: totals.giftCount + 1,
      charityCount: charityIds.size,
    }),
    { totalCents: 0, cashCents: 0, nonCashCents: 0, giftCount: 0, charityCount: 0 },
  );
}

/** The count beside "Donations" in the rail. */
export async function countDonations(taxYear: number): Promise<number> {
  const range = taxYearRange(taxYear);
  const [row] = await getDb()
    .select({ c: sql<number>`count(*)::int` })
    .from(donations)
    .where(and(gte(donations.date, range.start), lte(donations.date, range.end)));
  return row?.c ?? 0;
}
