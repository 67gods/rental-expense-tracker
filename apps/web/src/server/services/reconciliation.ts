import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import {
  createReconciliationItemSchema,
  isUnusualSign,
  reconcileRent,
  taxYearRange,
  upsertRentReconciliationSchema,
  type CreateReconciliationItemInput,
  type ReconciliationResult,
  type UpsertRentReconciliationInput,
} from '@rental/domain';
import { getDb, withTransaction } from '@/db/client';
import {
  properties,
  rentReceipts,
  rentReconciliationItems,
  rentReconciliations,
  type RentReconciliation,
  type RentReconciliationItem,
} from '@/db/schema';
import { NotFoundError } from '../errors';

/**
 * Received rent against reported rent.
 *
 * The received figure is never entered here - it is summed from the rent
 * receipts already logged, so the two can never drift. What the owner enters is
 * the 1099 figure and the reasons the two differ, one item at a time.
 *
 * The app does not decide any of those reasons. A forfeited deposit is income
 * and a held one is not, and only the owner knows which happened.
 */

export interface ReconciliationView extends ReconciliationResult {
  reconciliation: RentReconciliation | null;
  propertyId: string;
  taxYear: number;
  items: (RentReconciliationItem & { isUnusualSign: boolean })[];
}

export async function listReconciliations(taxYear: number): Promise<RentReconciliation[]> {
  return getDb()
    .select()
    .from(rentReconciliations)
    .where(eq(rentReconciliations.taxYear, taxYear))
    .orderBy(asc(rentReconciliations.propertyId));
}

/** Rent actually banked for a property in a year, from the receipts. */
export async function receiptsTotalFor(
  propertyId: string,
  taxYear: number,
): Promise<number> {
  const range = taxYearRange(taxYear);
  const [row] = await getDb()
    .select({ total: sql<string>`COALESCE(sum(${rentReceipts.amountCents}), 0)` })
    .from(rentReceipts)
    .where(
      and(
        eq(rentReceipts.propertyId, propertyId),
        gte(rentReceipts.date, range.start),
        lte(rentReceipts.date, range.end),
      ),
    );
  return Number(row?.total ?? 0);
}

/**
 * The full picture for one property-year, whether or not a reconciliation row
 * exists yet.
 *
 * Returns a view even when nothing has been entered, so the year-end screen can
 * show every property with its received total and an empty 1099 box rather than
 * only the ones somebody has already started.
 */
export async function reconciliationFor(
  propertyId: string,
  taxYear: number,
): Promise<ReconciliationView> {
  const db = getDb();
  const [header] = await db
    .select()
    .from(rentReconciliations)
    .where(
      and(
        eq(rentReconciliations.propertyId, propertyId),
        eq(rentReconciliations.taxYear, taxYear),
      ),
    )
    .limit(1);

  const items = header
    ? await db
        .select()
        .from(rentReconciliationItems)
        .where(eq(rentReconciliationItems.reconciliationId, header.id))
        .orderBy(asc(rentReconciliationItems.createdAt))
    : [];

  const receipts = await receiptsTotalFor(propertyId, taxYear);
  const result = reconcileRent(receipts, header?.reportedGrossCents ?? null, items);

  return {
    ...result,
    reconciliation: header ?? null,
    propertyId,
    taxYear,
    items: items.map((item) => ({ ...item, isUnusualSign: isUnusualSign(item) })),
  };
}

/**
 * Every active property's view for a year, whether or not anyone has started.
 *
 * The year-end screen shows all four properties with their received totals and
 * an empty 1099 box. Listing only the ones with a header would hide the exact
 * case that needs attention - the property whose 1099 arrived and was never
 * entered looks identical to one that has no 1099 at all.
 *
 * A handful of properties, so the per-property queries are not worth batching;
 * if that changes this is the one place to fix.
 */
export async function reconciliationsForYear(
  taxYear: number,
): Promise<(ReconciliationView & { propertyNickname: string })[]> {
  const rows = await getDb()
    .select({ id: properties.id, nickname: properties.nickname })
    .from(properties)
    .where(eq(properties.isArchived, false))
    // Acquisition order, matching `listProperties` - the year-end screen reads
    // this list beside others built from it, and two orders would not line up.
    .orderBy(sql`${properties.acquiredDate} ASC NULLS LAST`, asc(properties.nickname));

  const views: (ReconciliationView & { propertyNickname: string })[] = [];
  for (const row of rows) {
    const view = await reconciliationFor(row.id, taxYear);
    views.push({ ...view, propertyNickname: row.nickname });
  }
  return views;
}

export async function upsertReconciliation(
  input: UpsertRentReconciliationInput,
): Promise<RentReconciliation> {
  const data = upsertRentReconciliationSchema.parse(input);

  const values = {
    propertyId: data.propertyId,
    taxYear: data.taxYear,
    payerActorId: data.payerActorId,
    reportedGrossCents: data.reportedGrossCents,
    documentNote: data.documentNote,
  };

  const [row] = await getDb()
    .insert(rentReconciliations)
    .values(values)
    .onConflictDoUpdate({
      target: [rentReconciliations.propertyId, rentReconciliations.taxYear],
      set: { ...values, updatedAt: new Date() },
    })
    .returning();

  if (!row) throw new Error('The reconciliation was not saved.');
  return row;
}

/**
 * Adds an item explaining part of the gap.
 *
 * Creates the header if there is not one yet, so the owner can start explaining
 * a difference without first having to create something to explain it against.
 */
export async function addItem(
  input: CreateReconciliationItemInput & { propertyId?: string; taxYear?: number },
): Promise<RentReconciliationItem> {
  return withTransaction(async (tx) => {
    let reconciliationId = input.reconciliationId;

    if (!reconciliationId && input.propertyId && input.taxYear) {
      const [header] = await tx
        .insert(rentReconciliations)
        .values({ propertyId: input.propertyId, taxYear: input.taxYear })
        .onConflictDoUpdate({
          target: [rentReconciliations.propertyId, rentReconciliations.taxYear],
          set: { updatedAt: new Date() },
        })
        .returning();
      if (!header) throw new Error('The reconciliation was not created.');
      reconciliationId = header.id;
    }

    const data = createReconciliationItemSchema.parse({ ...input, reconciliationId });

    const [row] = await tx
      .insert(rentReconciliationItems)
      .values({
        reconciliationId: data.reconciliationId,
        kind: data.kind,
        amountCents: data.amountCents,
        note: data.note,
      })
      .returning();

    if (!row) throw new Error('The item was not saved.');
    return row;
  });
}

export async function deleteItem(id: string): Promise<void> {
  const deleted = await getDb()
    .delete(rentReconciliationItems)
    .where(eq(rentReconciliationItems.id, id))
    .returning({ id: rentReconciliationItems.id });
  if (deleted.length === 0) throw new NotFoundError('That item no longer exists.');
}

/** Property-years whose residual is not zero, for the integrity audit. */
export async function unreconciledYears(
  taxYear: number,
): Promise<{ propertyId: string; residualCents: number | null }[]> {
  const headers = await listReconciliations(taxYear);
  const out: { propertyId: string; residualCents: number | null }[] = [];

  for (const header of headers) {
    // Only a year with a reported figure can be out of balance. One still
    // waiting for its 1099 is incomplete, not wrong.
    if (header.reportedGrossCents === null) continue;
    const view = await reconciliationFor(header.propertyId, taxYear);
    if (!view.isReconciled) {
      out.push({ propertyId: header.propertyId, residualCents: view.residualCents });
    }
  }

  return out;
}
