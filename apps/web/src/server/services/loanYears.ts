import { and, asc, eq } from 'drizzle-orm';
import {
  upsertLoanYearSchema,
  type UpsertLoanYearInput,
} from '@rental/domain';
import { getDb } from '@/db/client';
import { propertyLoanYears, type PropertyLoanYear } from '@/db/schema';
import { NotFoundError } from '../errors';

/**
 * Loan and escrow facts, transcribed once a year from the Form 1098.
 *
 * Nothing here is computed. Every figure is copied from a document, and every
 * money column has a companion source saying which document - because box 10
 * was blank on all four of the household's 2025 forms and the tax and insurance
 * figures were in a supplemental escrow block below the numbered boxes. Without
 * the source recorded, next January the same hunt starts again.
 *
 * These are the largest deductions on the return and none of them passes
 * through the expense ledger, which is why they need a home of their own.
 */

export async function listLoanYears(
  filter: { taxYear?: number; propertyId?: string } = {},
): Promise<PropertyLoanYear[]> {
  const conditions = [];
  if (filter.taxYear) conditions.push(eq(propertyLoanYears.taxYear, filter.taxYear));
  if (filter.propertyId) conditions.push(eq(propertyLoanYears.propertyId, filter.propertyId));

  return getDb()
    .select()
    .from(propertyLoanYears)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(propertyLoanYears.taxYear), asc(propertyLoanYears.lenderName));
}

export async function getLoanYear(id: string): Promise<PropertyLoanYear> {
  const [row] = await getDb()
    .select()
    .from(propertyLoanYears)
    .where(eq(propertyLoanYears.id, id))
    .limit(1);
  if (!row) throw new NotFoundError('That loan record no longer exists.');
  return row;
}

/**
 * Creates or replaces the record for one lender, property and year.
 *
 * Upsert rather than create-then-edit: transcribing a 1098 is a task someone
 * does once and then redoes when they notice a figure was mistyped, and making
 * the second attempt fail on a uniqueness error would be pointless friction.
 */
export async function upsertLoanYear(
  input: UpsertLoanYearInput,
): Promise<PropertyLoanYear> {
  const data = upsertLoanYearSchema.parse(input);
  const db = getDb();

  const values = {
    propertyId: data.propertyId,
    taxYear: data.taxYear,
    lenderName: data.lenderName,
    interestCents: data.interestCents,
    pointsCents: data.pointsCents,
    mortgageInsuranceCents: data.mortgageInsuranceCents,
    propertyTaxCents: data.propertyTaxCents,
    propertyTaxSource: data.propertyTaxSource,
    insurancePaidFromEscrowCents: data.insurancePaidFromEscrowCents,
    insuranceSource: data.insuranceSource,
    escrowBalanceCents: data.escrowBalanceCents,
    originationDate: data.originationDate,
    originalPrincipalCents: data.originalPrincipalCents,
    interestRatePct: data.interestRatePct === null ? null : String(data.interestRatePct),
    documentNote: data.documentNote,
  };

  const [row] = await db
    .insert(propertyLoanYears)
    .values(values)
    .onConflictDoUpdate({
      target: [
        propertyLoanYears.propertyId,
        propertyLoanYears.taxYear,
        propertyLoanYears.lenderName,
      ],
      set: { ...values, updatedAt: new Date() },
    })
    .returning();

  if (!row) throw new Error('The loan record was not saved.');
  return row;
}

export async function deleteLoanYear(id: string): Promise<void> {
  const deleted = await getDb()
    .delete(propertyLoanYears)
    .where(eq(propertyLoanYears.id, id))
    .returning({ id: propertyLoanYears.id });
  if (deleted.length === 0) throw new NotFoundError('That loan record no longer exists.');
}

export interface LoanYearTotals {
  interestCents: number;
  propertyTaxCents: number;
  insuranceCents: number;
  pointsCents: number;
  mortgageInsuranceCents: number;
}

/**
 * Per-property totals for a year, keyed by property id.
 *
 * A property can carry more than one lender in a year - a refinance leaves two
 * 1098s - so these are sums rather than single rows.
 */
export async function loanTotalsByProperty(
  taxYear: number,
): Promise<Map<string, LoanYearTotals>> {
  const rows = await listLoanYears({ taxYear });
  const totals = new Map<string, LoanYearTotals>();

  for (const row of rows) {
    const current = totals.get(row.propertyId) ?? {
      interestCents: 0,
      propertyTaxCents: 0,
      insuranceCents: 0,
      pointsCents: 0,
      mortgageInsuranceCents: 0,
    };
    current.interestCents += row.interestCents ?? 0;
    current.propertyTaxCents += row.propertyTaxCents ?? 0;
    current.insuranceCents += row.insurancePaidFromEscrowCents ?? 0;
    current.pointsCents += row.pointsCents ?? 0;
    current.mortgageInsuranceCents += row.mortgageInsuranceCents ?? 0;
    totals.set(row.propertyId, current);
  }

  return totals;
}
