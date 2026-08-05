import { and, asc, eq, sql } from 'drizzle-orm';
import {
  createBankAccountSchema,
  updateBankAccountSchema,
  upsertInterestYearSchema,
  type CreateBankAccountInput,
  type UpdateBankAccountInput,
  type UpsertInterestYearInput,
} from '@rental/domain';
import { getDb } from '@/db/client';
import {
  actors,
  bankAccounts,
  interestYears,
  type BankAccount,
  type InterestYear,
} from '@/db/schema';
import { NotFoundError, ValidationError } from '../errors';

/**
 * Interest income, transcribed once a year from the 1099-INT.
 *
 * The one part of this app that is not about the rental. A household savings
 * account, or one in a business's name, earns interest that never touches a
 * property and lands on Schedule B rather than Schedule E. It lives here
 * because the January hand-off to the CPA is a single hand-off, and a figure
 * kept somewhere else is a figure found in March.
 *
 * Shaped like `loanYears`, not like the rent ledger: an account is a reusable
 * record, and each year against it is one transcription that gets corrected in
 * place rather than logged again.
 */

// --- Accounts ---------------------------------------------------------------

export interface BankAccountView extends BankAccount {
  /** The holder's name, whichever of the two columns is carrying it. */
  holderLabel: string;
  holderKind: 'person' | 'business';
}

function withHolder(row: BankAccount, actorNames: Map<string, string>): BankAccountView {
  return {
    ...row,
    holderLabel: row.holderActorId
      ? (actorNames.get(row.holderActorId) ?? 'Unknown person')
      : (row.holderName ?? ''),
    holderKind: row.holderActorId ? 'person' : 'business',
  };
}

export async function listBankAccounts(
  filter: { includeArchived?: boolean } = {},
): Promise<BankAccountView[]> {
  const db = getDb();

  const [rows, people] = await Promise.all([
    db
      .select()
      .from(bankAccounts)
      .where(filter.includeArchived ? undefined : eq(bankAccounts.isArchived, false))
      .orderBy(asc(bankAccounts.bankName), asc(bankAccounts.label)),
    db.select({ id: actors.id, name: actors.name }).from(actors),
  ]);

  const actorNames = new Map(people.map((p) => [p.id, p.name]));
  return rows.map((row) => withHolder(row, actorNames));
}

export async function createBankAccount(input: CreateBankAccountInput): Promise<BankAccount> {
  const data = createBankAccountSchema.parse(input);

  const [row] = await getDb()
    .insert(bankAccounts)
    .values({
      bankName: data.bankName,
      holderActorId: data.holderActorId,
      holderName: data.holderName,
      label: data.label,
    })
    // The uniqueness is there to stop the same bank becoming three banks across
    // three years. Saying so beats a raw constraint violation.
    .onConflictDoNothing()
    .returning();

  if (!row) {
    throw new ValidationError('That account is already on file.', { bankName: 'Already added' });
  }
  return row;
}

export async function updateBankAccount(input: UpdateBankAccountInput): Promise<BankAccount> {
  const data = updateBankAccountSchema.parse(input);

  const [row] = await getDb()
    .update(bankAccounts)
    .set({
      bankName: data.bankName,
      holderActorId: data.holderActorId,
      holderName: data.holderName,
      label: data.label,
      ...(data.isArchived === undefined ? {} : { isArchived: data.isArchived }),
      updatedAt: new Date(),
    })
    .where(eq(bankAccounts.id, data.id))
    .returning();

  if (!row) throw new NotFoundError('That account no longer exists.');
  return row;
}

/**
 * Archived, never deleted.
 *
 * An account closed in June still earned interest that year, and the years
 * behind it are the record of it. Removing the account would take them with it
 * through the cascade.
 */
export async function archiveBankAccount(id: string): Promise<void> {
  const [row] = await getDb()
    .update(bankAccounts)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(eq(bankAccounts.id, id))
    .returning({ id: bankAccounts.id });
  if (!row) throw new NotFoundError('That account no longer exists.');
}

// --- The yearly figure ------------------------------------------------------

export async function listInterestYears(
  filter: { taxYear?: number; bankAccountId?: string } = {},
): Promise<InterestYear[]> {
  const conditions = [];
  if (filter.taxYear) conditions.push(eq(interestYears.taxYear, filter.taxYear));
  if (filter.bankAccountId) {
    conditions.push(eq(interestYears.bankAccountId, filter.bankAccountId));
  }

  return getDb()
    .select()
    .from(interestYears)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(interestYears.taxYear));
}

/**
 * Creates or replaces the figure for one account and year.
 *
 * Upsert, exactly as `upsertLoanYear` is: transcribing a form is a task someone
 * does once and redoes when they spot a mistyped digit, and failing the second
 * attempt on a uniqueness error would be pointless friction.
 */
export async function upsertInterestYear(
  input: UpsertInterestYearInput,
): Promise<InterestYear> {
  const data = upsertInterestYearSchema.parse(input);

  const values = {
    bankAccountId: data.bankAccountId,
    taxYear: data.taxYear,
    actorId: data.actorId,
    interestCents: data.interestCents,
    earlyWithdrawalPenaltyCents: data.earlyWithdrawalPenaltyCents,
    savingsBondInterestCents: data.savingsBondInterestCents,
    federalTaxWithheldCents: data.federalTaxWithheldCents,
    taxExemptInterestCents: data.taxExemptInterestCents,
    documentSource: data.documentSource,
    documentNote: data.documentNote,
  };

  const [row] = await getDb()
    .insert(interestYears)
    .values(values)
    .onConflictDoUpdate({
      target: [interestYears.bankAccountId, interestYears.taxYear],
      set: { ...values, updatedAt: new Date() },
    })
    .returning();

  if (!row) throw new Error('The interest record was not saved.');
  return row;
}

export async function deleteInterestYear(id: string): Promise<void> {
  const deleted = await getDb()
    .delete(interestYears)
    .where(eq(interestYears.id, id))
    .returning({ id: interestYears.id });
  if (deleted.length === 0) throw new NotFoundError('That interest record no longer exists.');
}

// --- Rollups ----------------------------------------------------------------

export interface InterestTotals {
  interestCents: number;
  taxExemptCents: number;
  withheldCents: number;
  accountCount: number;
}

export async function interestTotalsForYear(taxYear: number): Promise<InterestTotals> {
  const rows = await listInterestYears({ taxYear });

  return rows.reduce<InterestTotals>(
    (totals, row) => ({
      interestCents: totals.interestCents + row.interestCents,
      taxExemptCents: totals.taxExemptCents + (row.taxExemptInterestCents ?? 0),
      withheldCents: totals.withheldCents + (row.federalTaxWithheldCents ?? 0),
      accountCount: totals.accountCount + 1,
    }),
    { interestCents: 0, taxExemptCents: 0, withheldCents: 0, accountCount: 0 },
  );
}

/** The count beside "Interest income" in the rail. */
export async function countInterestYears(taxYear: number): Promise<number> {
  const [row] = await getDb()
    .select({ c: sql<number>`count(*)::int` })
    .from(interestYears)
    .where(eq(interestYears.taxYear, taxYear));
  return row?.c ?? 0;
}
