import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import {
  canAssignPropertyToEnterprise,
  createActorSchema,
  createPropertySchema,
  createRentReceiptSchema,
  evaluateEnterpriseComposition,
  isBackdated,
  propertyDateProblems,
  taxYearRange,
  todayInZone,
  updateActorSchema,
  updatePropertySchema,
  type CreateActorInput,
  type CreatePropertyInput,
  type CreateRentReceiptInput,
  type DomainProperty,
} from '@rental/domain';
import { getDb, withTransaction } from '@/db/client';
import {
  actors,
  enterprises,
  properties,
  propertyManagementPeriods,
  rentReceipts,
  type Actor,
  type Enterprise,
  type Property,
  type PropertyManagementPeriod,
  type RentReceipt,
} from '@/db/schema';
import { env } from '@/env';
import { NotFoundError, ValidationError } from '../errors';

/** Reference data: enterprises, properties, actors, and rent income. */

// --- Enterprises ------------------------------------------------------------

export async function listEnterprises(): Promise<Enterprise[]> {
  return getDb().select().from(enterprises).orderBy(asc(enterprises.name));
}

export async function getEnterprise(id: string): Promise<Enterprise> {
  const [row] = await getDb().select().from(enterprises).where(eq(enterprises.id, id)).limit(1);
  if (!row) throw new NotFoundError('That enterprise no longer exists.');
  return row;
}

// --- Properties -------------------------------------------------------------

export async function listProperties(options: { includeArchived?: boolean } = {}): Promise<
  Property[]
> {
  const db = getDb();
  return db
    .select()
    .from(properties)
    .where(options.includeArchived ? undefined : eq(properties.isArchived, false))
    .orderBy(asc(properties.nickname));
}

export async function getProperty(id: string): Promise<Property> {
  const [row] = await getDb().select().from(properties).where(eq(properties.id, id)).limit(1);
  if (!row) throw new NotFoundError('That property no longer exists.');
  return row;
}

/** The purchase and in-service facts, shared by create and update. */
function propertyFactColumns(data: {
  placedInServiceDate?: string | null;
  placedInServiceEvidence?: string | null;
  firstTenantDate?: string | null;
  purchasePriceCents?: number | null;
  closingCostsCents?: number | null;
  landValueCents?: number | null;
  wasPersonalResidence?: boolean;
  convertedToRentalDate?: string | null;
  fmvAtConversionCents?: number | null;
  soldDate?: string | null;
  salePriceCents?: number | null;
  section469Activity?: string | null;
}) {
  return {
    placedInServiceDate: data.placedInServiceDate ?? null,
    placedInServiceEvidence: data.placedInServiceEvidence ?? null,
    firstTenantDate: data.firstTenantDate ?? null,
    purchasePriceCents: data.purchasePriceCents ?? null,
    closingCostsCents: data.closingCostsCents ?? null,
    landValueCents: data.landValueCents ?? null,
    wasPersonalResidence: data.wasPersonalResidence ?? false,
    convertedToRentalDate: data.convertedToRentalDate ?? null,
    fmvAtConversionCents: data.fmvAtConversionCents ?? null,
    soldDate: data.soldDate ?? null,
    salePriceCents: data.salePriceCents ?? null,
    section469Activity: data.section469Activity ?? null,
  };
}

export async function createProperty(input: CreatePropertyInput): Promise<Property> {
  const data = createPropertySchema.parse(input);
  await assertEnterpriseAccepts(data.enterpriseId);

  const [row] = await getDb()
    .insert(properties)
    .values({
      enterpriseId: data.enterpriseId,
      nickname: data.nickname,
      address: data.address,
      acquiredDate: data.acquiredDate,
      unadjustedBasisCents: data.unadjustedBasisCents,
      ownershipPct: String(data.ownershipPct),
      isSelfManaged: data.isSelfManaged,
      isTripleNet: data.isTripleNet,
      hadPersonalUse: data.hadPersonalUse,
      ...propertyFactColumns(data),
    })
    .returning();

  if (!row) throw new Error('The property was not saved.');

  if (data.managedByActorId) {
    await setManager(row.id, data.managedByActorId, data.acquiredDate ?? undefined);
  }

  return row;
}

export async function updateProperty(
  input: { id: string } & Partial<CreatePropertyInput>,
): Promise<Property> {
  const data = updatePropertySchema.parse(input);
  const existing = await getProperty(data.id);

  if (data.enterpriseId && data.enterpriseId !== existing.enterpriseId) {
    await assertEnterpriseAccepts(data.enterpriseId);
  }

  // `undefined` means "not sent in this patch, keep it"; `null` means "cleared".
  const keep = <T>(sent: T | undefined, current: T): T => (sent === undefined ? current : sent);

  // The same date checks the create schema runs, asked again over the merged
  // result. A partial schema cannot ask them: a patch that moves only the
  // acquisition date never sees the in-service date it might now contradict.
  // Without this, create refuses a date pair that update accepts.
  const problems = propertyDateProblems({
    acquiredDate: keep(data.acquiredDate, existing.acquiredDate),
    placedInServiceDate: keep(data.placedInServiceDate, existing.placedInServiceDate),
    soldDate: keep(data.soldDate, existing.soldDate),
    wasPersonalResidence: data.wasPersonalResidence ?? existing.wasPersonalResidence,
  });
  if (problems.length > 0) {
    const first = problems[0]!;
    throw new ValidationError(
      first.message,
      Object.fromEntries(problems.map((p) => [p.field, p.message])),
    );
  }

  const [row] = await getDb()
    .update(properties)
    .set({
      enterpriseId: data.enterpriseId ?? existing.enterpriseId,
      nickname: data.nickname ?? existing.nickname,
      address: data.address ?? existing.address,
      acquiredDate: keep(data.acquiredDate, existing.acquiredDate),
      unadjustedBasisCents: data.unadjustedBasisCents ?? existing.unadjustedBasisCents,
      ownershipPct:
        data.ownershipPct === undefined ? existing.ownershipPct : String(data.ownershipPct),
      isSelfManaged: data.isSelfManaged ?? existing.isSelfManaged,
      isTripleNet: data.isTripleNet ?? existing.isTripleNet,
      hadPersonalUse: data.hadPersonalUse ?? existing.hadPersonalUse,

      placedInServiceDate: keep(data.placedInServiceDate, existing.placedInServiceDate),
      placedInServiceEvidence: keep(
        data.placedInServiceEvidence,
        existing.placedInServiceEvidence,
      ),
      firstTenantDate: keep(data.firstTenantDate, existing.firstTenantDate),
      purchasePriceCents: keep(data.purchasePriceCents, existing.purchasePriceCents),
      closingCostsCents: keep(data.closingCostsCents, existing.closingCostsCents),
      landValueCents: keep(data.landValueCents, existing.landValueCents),
      wasPersonalResidence: data.wasPersonalResidence ?? existing.wasPersonalResidence,
      convertedToRentalDate: keep(data.convertedToRentalDate, existing.convertedToRentalDate),
      fmvAtConversionCents: keep(data.fmvAtConversionCents, existing.fmvAtConversionCents),
      soldDate: keep(data.soldDate, existing.soldDate),
      salePriceCents: keep(data.salePriceCents, existing.salePriceCents),
      section469Activity: keep(data.section469Activity, existing.section469Activity),

      updatedAt: new Date(),
    })
    .where(eq(properties.id, data.id))
    .returning();

  if (!row) throw new NotFoundError('That property no longer exists.');

  if (data.managedByActorId !== undefined && data.managedByActorId !== null) {
    await setManager(row.id, data.managedByActorId);
  }

  return row;
}

// --- Management history -----------------------------------------------------

export async function listManagementPeriods(
  propertyId: string,
): Promise<PropertyManagementPeriod[]> {
  return getDb()
    .select()
    .from(propertyManagementPeriods)
    .where(eq(propertyManagementPeriods.propertyId, propertyId))
    .orderBy(desc(propertyManagementPeriods.startDate));
}

/** Who manages each property right now, from the open period. */
export async function currentManagers(): Promise<Map<string, string | null>> {
  const rows = await getDb()
    .select({
      propertyId: propertyManagementPeriods.propertyId,
      managerActorId: propertyManagementPeriods.managerActorId,
    })
    .from(propertyManagementPeriods)
    .where(isNull(propertyManagementPeriods.endDate));
  return new Map(rows.map((r) => [r.propertyId, r.managerActorId]));
}

/**
 * Changes who manages a property: closes the open period and opens a new one.
 *
 * This is the whole interaction behind the `Managed by` dropdown. The owner
 * picks a name; the history keeps itself. Both writes are one transaction,
 * because a closed period with no replacement, or two open ones, each misstate
 * who was managing the property - and the partial unique index would reject the
 * second anyway, leaving the first committed on its own.
 *
 * `actorId` is a uuid, or the literal 'self' meaning no manager.
 */
export async function setManager(
  propertyId: string,
  actorId: string,
  startDate?: string,
): Promise<PropertyManagementPeriod | null> {
  const managerActorId = actorId === 'self' ? null : actorId;
  const from = startDate ?? todayInZone(env.timeZone);

  return withTransaction(async (tx) => {
    const [open] = await tx
      .select()
      .from(propertyManagementPeriods)
      .where(
        and(
          eq(propertyManagementPeriods.propertyId, propertyId),
          isNull(propertyManagementPeriods.endDate),
        ),
      )
      .limit(1);

    // Already the arrangement in force. Recording a zero-length change would
    // add a row that says nothing happened.
    if (open && open.managerActorId === managerActorId) return open;

    if (open) {
      // A period that would end before it began means the dates were entered out
      // of order; keep it non-negative rather than writing an impossible row.
      const endDate = from < open.startDate ? open.startDate : from;
      await tx
        .update(propertyManagementPeriods)
        .set({ endDate, updatedAt: new Date() })
        .where(eq(propertyManagementPeriods.id, open.id));
    }

    const [created] = await tx
      .insert(propertyManagementPeriods)
      .values({ propertyId, managerActorId, startDate: from })
      .returning();

    // Kept in step so the property list badge does not contradict the history.
    await tx
      .update(properties)
      .set({ isSelfManaged: managerActorId === null, updatedAt: new Date() })
      .where(eq(properties.id, propertyId));

    return created ?? null;
  });
}

/** Properties whose management periods overlap, for the integrity audit. */
export async function overlappingManagementPeriods(): Promise<string[]> {
  const rows = await getDb()
    .select({ propertyId: propertyManagementPeriods.propertyId })
    .from(propertyManagementPeriods)
    .where(
      sql`EXISTS (
        SELECT 1 FROM ${propertyManagementPeriods} other
        WHERE other.property_id = ${propertyManagementPeriods.propertyId}
          AND other.id <> ${propertyManagementPeriods.id}
          AND other.start_date <= COALESCE(${propertyManagementPeriods.endDate}, DATE '9999-12-31')
          AND COALESCE(other.end_date, DATE '9999-12-31') >= ${propertyManagementPeriods.startDate}
      )`,
    );
  return [...new Set(rows.map((r) => r.propertyId))];
}

/**
 * §5.4: residential and commercial cannot share an enterprise. Checked before
 * the write so the invalid grouping never exists, rather than being reported
 * afterwards.
 */
async function assertEnterpriseAccepts(enterpriseId: string) {
  const enterprise = await getEnterprise(enterpriseId);
  const verdict = canAssignPropertyToEnterprise(enterprise.propertyType, enterprise);
  if (!verdict.allowed) {
    throw new ValidationError(verdict.message ?? 'That property cannot join this enterprise.', {
      enterpriseId: verdict.message ?? '',
    });
  }
}

/** Properties as the domain rules see them, with numeric fields converted. */
export function toDomainProperties(rows: readonly Property[]): DomainProperty[] {
  return rows.map((p) => ({
    id: p.id,
    enterpriseId: p.enterpriseId,
    nickname: p.nickname,
    unadjustedBasisCents: p.unadjustedBasisCents,
    ownershipPct: Number(p.ownershipPct),
    isTripleNet: p.isTripleNet,
    hadPersonalUse: p.hadPersonalUse,
  }));
}

/** Property ids currently outside their enterprise for the year (§5.4). */
export async function excludedPropertyIds(enterpriseId: string): Promise<string[]> {
  const rows = await listProperties();
  return evaluateEnterpriseComposition({ id: enterpriseId }, toDomainProperties(rows))
    .excludedPropertyIds;
}

// --- Actors -----------------------------------------------------------------

export async function listActors(options: { includeArchived?: boolean } = {}): Promise<Actor[]> {
  const db = getDb();
  return db
    .select()
    .from(actors)
    .where(options.includeArchived ? undefined : eq(actors.isArchived, false))
    .orderBy(asc(actors.type), asc(actors.name));
}

/** The two people who log their own work, for the "who did this" picker. */
export async function listPeople(): Promise<Actor[]> {
  const db = getDb();
  return db
    .select()
    .from(actors)
    .where(and(eq(actors.isArchived, false), ne(actors.type, 'contractor')))
    .orderBy(asc(actors.name));
}

/**
 * Who can appear in the `Managed by` dropdown.
 *
 * Property managers, plus anyone recorded as 'other' - a management company
 * entered before the type existed should still be pickable, and the cost of
 * being wrong here is a name in a list rather than a wrong number.
 */
export async function listPropertyManagers(): Promise<Actor[]> {
  const db = getDb();
  return db
    .select()
    .from(actors)
    .where(
      and(
        eq(actors.isArchived, false),
        sql`${actors.type} IN ('pm', 'other')`,
      ),
    )
    .orderBy(asc(actors.name));
}

export async function listContractors(): Promise<Actor[]> {
  const db = getDb();
  return db
    .select()
    .from(actors)
    .where(and(eq(actors.isArchived, false), eq(actors.type, 'contractor')))
    .orderBy(asc(actors.name));
}

export async function getActor(id: string): Promise<Actor> {
  const [row] = await getDb().select().from(actors).where(eq(actors.id, id)).limit(1);
  if (!row) throw new NotFoundError('That person no longer exists.');
  return row;
}

export async function createActor(input: CreateActorInput): Promise<Actor> {
  const data = createActorSchema.parse(input);
  const [row] = await getDb()
    .insert(actors)
    .values({
      name: data.name,
      type: data.type,
      email: data.email?.toLowerCase() ?? null,
      w9OnFile: data.w9OnFile,
      taxIdCollected: data.taxIdCollected,
      notes: data.notes,
    })
    .returning();
  if (!row) throw new Error('That person was not saved.');
  return row;
}

export async function updateActor(
  input: { id: string } & Partial<CreateActorInput>,
): Promise<Actor> {
  const data = updateActorSchema.parse(input);
  const existing = await getActor(data.id);

  const [row] = await getDb()
    .update(actors)
    .set({
      name: data.name ?? existing.name,
      type: data.type ?? existing.type,
      email: data.email === undefined ? existing.email : (data.email?.toLowerCase() ?? null),
      w9OnFile: data.w9OnFile ?? existing.w9OnFile,
      taxIdCollected: data.taxIdCollected ?? existing.taxIdCollected,
      notes: data.notes === undefined ? existing.notes : data.notes,
      updatedAt: new Date(),
    })
    .where(eq(actors.id, data.id))
    .returning();

  if (!row) throw new NotFoundError('That person no longer exists.');
  return row;
}

// --- Rent income ------------------------------------------------------------

export async function createRentReceipt(input: CreateRentReceiptInput): Promise<RentReceipt> {
  const data = createRentReceiptSchema.parse(input);
  const [row] = await getDb()
    .insert(rentReceipts)
    .values({
      date: data.date,
      actorId: data.actorId,
      propertyId: data.propertyId,
      amountCents: data.amountCents,
      source: data.source,
      notes: data.notes,
      isBackdated: isBackdated(data.date, new Date(), env.timeZone),
    })
    .returning();
  if (!row) throw new Error('The rent record was not saved.');
  return row;
}

export async function listRentReceipts(
  filter: { taxYear?: number; propertyId?: string; limit?: number } = {},
): Promise<RentReceipt[]> {
  const db = getDb();
  const conditions = [];
  if (filter.taxYear) {
    const range = taxYearRange(filter.taxYear);
    conditions.push(
      sql`${rentReceipts.date} >= ${range.start}`,
      sql`${rentReceipts.date} <= ${range.end}`,
    );
  }
  if (filter.propertyId) conditions.push(eq(rentReceipts.propertyId, filter.propertyId));

  return db
    .select()
    .from(rentReceipts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${rentReceipts.date} desc`)
    .limit(filter.limit ?? 500);
}

export async function deleteRentReceipt(id: string): Promise<void> {
  const deleted = await getDb()
    .delete(rentReceipts)
    .where(eq(rentReceipts.id, id))
    .returning({ id: rentReceipts.id });
  if (deleted.length === 0) throw new NotFoundError('That rent record no longer exists.');
}
