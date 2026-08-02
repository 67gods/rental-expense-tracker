import { and, asc, eq, isNull } from 'drizzle-orm';
import { upsertCpaFigureSchema, type UpsertCpaFigureInput } from '@rental/domain';
import { getDb } from '@/db/client';
import { cpaFigures, type CpaFigure } from '@/db/schema';
import { NotFoundError } from '../errors';

/**
 * Figures the CPA sent back.
 *
 * Depreciation and anything else this app must not compute. Every row is
 * transcribed from a document and `sourceNote` is required, because a figure
 * nobody can trace back to a document cannot be checked next year - and an
 * untraceable number in a tax file is worse than a missing one, since a missing
 * one gets chased.
 *
 * Row-shaped rather than column-shaped so what comes back can change without a
 * migration: one depreciation figure per property today, a component schedule
 * or a suspended-loss carryforward later.
 */

export async function listCpaFigures(
  filter: { taxYear?: number; propertyId?: string | null } = {},
): Promise<CpaFigure[]> {
  const conditions = [];
  if (filter.taxYear) conditions.push(eq(cpaFigures.taxYear, filter.taxYear));
  if (filter.propertyId === null) conditions.push(isNull(cpaFigures.propertyId));
  else if (filter.propertyId) conditions.push(eq(cpaFigures.propertyId, filter.propertyId));

  return getDb()
    .select()
    .from(cpaFigures)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(cpaFigures.taxYear), asc(cpaFigures.kind), asc(cpaFigures.label));
}

export async function upsertCpaFigure(input: UpsertCpaFigureInput): Promise<CpaFigure> {
  const data = upsertCpaFigureSchema.parse(input);

  const values = {
    propertyId: data.propertyId,
    taxYear: data.taxYear,
    kind: data.kind,
    categoryId: data.categoryId,
    scheduleELine: data.scheduleELine,
    label: data.label,
    recoveryYears: data.recoveryYears === null ? null : String(data.recoveryYears),
    amountCents: data.amountCents,
    sourceNote: data.sourceNote,
    enteredByActorId: data.enteredByActorId,
  };

  const [row] = await getDb()
    .insert(cpaFigures)
    .values(values)
    .onConflictDoUpdate({
      target: [cpaFigures.propertyId, cpaFigures.taxYear, cpaFigures.kind, cpaFigures.label],
      set: { ...values, updatedAt: new Date() },
    })
    .returning();

  if (!row) throw new Error('The figure was not saved.');
  return row;
}

export async function deleteCpaFigure(id: string): Promise<void> {
  const deleted = await getDb()
    .delete(cpaFigures)
    .where(eq(cpaFigures.id, id))
    .returning({ id: cpaFigures.id });
  if (deleted.length === 0) throw new NotFoundError('That figure no longer exists.');
}

/**
 * CPA figures that belong on a Schedule E line, keyed by `propertyId:categoryId`.
 *
 * Used by the export to merge them into the per-property summary alongside the
 * ledger and the 1098 figures. Portfolio-level rows key on an empty property id.
 */
export async function scheduleEFiguresByProperty(
  taxYear: number,
): Promise<Map<string, number>> {
  const rows = await listCpaFigures({ taxYear });
  const out = new Map<string, number>();

  for (const row of rows) {
    if (row.kind !== 'schedule_e_line' || !row.categoryId) continue;
    const key = `${row.propertyId ?? ''}:${row.categoryId}`;
    out.set(key, (out.get(key) ?? 0) + row.amountCents);
  }

  return out;
}

/** The suspended-loss balance carried into the next year, if one is recorded. */
export async function suspendedLossFor(taxYear: number): Promise<CpaFigure[]> {
  return (await listCpaFigures({ taxYear })).filter(
    (f) => f.kind === 'suspended_loss_carryforward',
  );
}
