import { and, asc, eq, ne, sql } from 'drizzle-orm';
import {
  canAssignPropertyToEnterprise,
  createActorSchema,
  createPropertySchema,
  createRentReceiptSchema,
  evaluateEnterpriseComposition,
  isBackdated,
  taxYearRange,
  updateActorSchema,
  updatePropertySchema,
  type CreateActorInput,
  type CreatePropertyInput,
  type CreateRentReceiptInput,
  type DomainProperty,
} from '@rental/domain';
import { getDb } from '@/db/client';
import {
  actors,
  enterprises,
  properties,
  rentReceipts,
  type Actor,
  type Enterprise,
  type Property,
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
    })
    .returning();

  if (!row) throw new Error('The property was not saved.');
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

  const [row] = await getDb()
    .update(properties)
    .set({
      enterpriseId: data.enterpriseId ?? existing.enterpriseId,
      nickname: data.nickname ?? existing.nickname,
      address: data.address ?? existing.address,
      acquiredDate: data.acquiredDate === undefined ? existing.acquiredDate : data.acquiredDate,
      unadjustedBasisCents: data.unadjustedBasisCents ?? existing.unadjustedBasisCents,
      ownershipPct:
        data.ownershipPct === undefined ? existing.ownershipPct : String(data.ownershipPct),
      isSelfManaged: data.isSelfManaged ?? existing.isSelfManaged,
      isTripleNet: data.isTripleNet ?? existing.isTripleNet,
      hadPersonalUse: data.hadPersonalUse ?? existing.hadPersonalUse,
      updatedAt: new Date(),
    })
    .where(eq(properties.id, data.id))
    .returning();

  if (!row) throw new NotFoundError('That property no longer exists.');
  return row;
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
