'use server';

import { revalidatePath } from 'next/cache';
import {
  CPA_FIGURE_KINDS,
  DOCUMENT_SOURCES,
  parseAmountToCents,
  RECONCILIATION_KINDS,
  type CpaFigureKind,
  type DocumentSource,
  type ReconciliationKind,
} from '@rental/domain';
import { requireUser } from '@/lib/session';
import { toErrorPayload } from '@/server/errors';
import { deleteLoanYear, upsertLoanYear } from '@/server/services/loanYears';
import {
  addItem,
  deleteItem,
  upsertReconciliation,
} from '@/server/services/reconciliation';
import { deleteCpaFigure, upsertCpaFigure } from '@/server/services/cpaFigures';
import { confirmPayment } from '@/server/services/payments';
import type { FormState } from './formState';

/**
 * The January sitting.
 *
 * Four jobs that all happen in the same week once a year: transcribing the
 * 1098s, squaring the rent against the 1099, saying which scheduled payments
 * actually went out, and typing in what the CPA sent back. They live on one
 * screen because they are one task, and they live in one actions file for the
 * same reason.
 *
 * Nothing here computes a tax figure. Every number is copied off a document.
 */

// --- 1098s ------------------------------------------------------------------

export async function saveLoanYearAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireUser();
    const money = new MoneyFields(formData);

    const payload = {
      propertyId: str(formData, 'propertyId'),
      taxYear: Number(str(formData, 'taxYear')),
      lenderName: str(formData, 'lenderName'),
      interestCents: money.optional('interest'),
      pointsCents: money.optional('points'),
      mortgageInsuranceCents: money.optional('mortgageInsurance'),
      propertyTaxCents: money.optional('propertyTax'),
      propertyTaxSource: source(str(formData, 'propertyTaxSource')),
      insurancePaidFromEscrowCents: money.optional('insurancePaidFromEscrow'),
      insuranceSource: source(str(formData, 'insuranceSource')),
      escrowBalanceCents: money.optional('escrowBalance'),
      originationDate: str(formData, 'originationDate') || null,
      originalPrincipalCents: money.optional('originalPrincipal'),
      interestRatePct: rate(str(formData, 'interestRatePct')),
      documentNote: str(formData, 'documentNote') || null,
    };

    if (money.hasErrors) {
      return { ok: false, message: money.summary, fields: money.errors };
    }

    await upsertLoanYear(payload);
    revalidateYearEnd();
    return { ok: true, saved: `Saved ${payload.lenderName}.` };
  } catch (error) {
    return asFormState(error);
  }
}

export async function deleteLoanYearAction(id: string): Promise<void> {
  await requireUser();
  await deleteLoanYear(id);
  revalidateYearEnd();
}

// --- Rent received against the 1099 -----------------------------------------

export async function saveReconciliationAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireUser();
    const money = new MoneyFields(formData);

    // Null, not zero. A 1099 that has not arrived is a different fact from one
    // reporting nothing, and the residual rule treats them differently: null
    // gives no residual at all, where zero would show a gap the size of the
    // year's rent.
    const reportedGrossCents = money.optional('reportedGross');
    if (money.hasErrors) {
      return { ok: false, message: money.summary, fields: money.errors };
    }

    await upsertReconciliation({
      propertyId: str(formData, 'propertyId'),
      taxYear: Number(str(formData, 'taxYear')),
      payerActorId: str(formData, 'payerActorId') || null,
      reportedGrossCents,
      documentNote: str(formData, 'documentNote') || null,
    });

    revalidateYearEnd();
    return { ok: true, saved: 'Saved.' };
  } catch (error) {
    return asFormState(error);
  }
}

export async function addReconciliationItemAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireUser();

    // The one signed amount in the app. A minus sign is legitimate here and
    // nowhere else, so it is parsed rather than stripped.
    const raw = str(formData, 'amount');
    let amountCents: number;
    try {
      amountCents = parseAmountToCents(raw);
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Check the amount.',
        fields: { amount: 'Check this' },
      };
    }

    await addItem({
      propertyId: str(formData, 'propertyId'),
      taxYear: Number(str(formData, 'taxYear')),
      reconciliationId: str(formData, 'reconciliationId') || undefined,
      kind: reconciliationKind(str(formData, 'kind')),
      amountCents,
      note: str(formData, 'note') || null,
    } as Parameters<typeof addItem>[0]);

    revalidateYearEnd();
    return { ok: true, saved: 'Added.' };
  } catch (error) {
    return asFormState(error);
  }
}

export async function deleteReconciliationItemAction(id: string): Promise<void> {
  await requireUser();
  await deleteItem(id);
  revalidateYearEnd();
}

// --- Figures from the CPA ---------------------------------------------------

export async function saveCpaFigureAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const user = await requireUser();
    const money = new MoneyFields(formData);
    const amountCents = money.optional('amount');

    if (amountCents === null && !money.hasErrors) {
      return {
        ok: false,
        message: 'A figure needs an amount.',
        fields: { amount: 'How much?' },
      };
    }
    if (money.hasErrors) {
      return { ok: false, message: money.summary, fields: money.errors };
    }

    await upsertCpaFigure({
      propertyId: str(formData, 'propertyId') || null,
      taxYear: Number(str(formData, 'taxYear')),
      kind: cpaFigureKind(str(formData, 'kind')),
      categoryId: str(formData, 'categoryId') || null,
      label: str(formData, 'label'),
      recoveryYears: recovery(str(formData, 'recoveryYears')),
      amountCents: amountCents as number,
      // Required by the schema. A figure nobody can trace back to a document
      // cannot be checked next year, and an untraceable number in a tax file is
      // worse than a missing one - a missing one gets chased.
      sourceNote: str(formData, 'sourceNote'),
      enteredByActorId: user.actor.id,
    } as Parameters<typeof upsertCpaFigure>[0]);

    revalidateYearEnd();
    return { ok: true, saved: 'Saved.' };
  } catch (error) {
    return asFormState(error);
  }
}

export async function deleteCpaFigureAction(id: string): Promise<void> {
  await requireUser();
  await deleteCpaFigure(id);
  revalidateYearEnd();
}

// --- Scheduled payments that actually went out ------------------------------

/**
 * Turns a plan into a cash event.
 *
 * Until this runs, the payment reaches no export - which is what lets the
 * remainder of an invoice sit in next year without being deducted a year early.
 */
export async function confirmPaymentAction(id: string, paidDate?: string): Promise<void> {
  await requireUser();
  await confirmPayment(id, paidDate);
  revalidateYearEnd();
  revalidatePath('/entries');
}

// --- internals --------------------------------------------------------------

function revalidateYearEnd() {
  revalidatePath('/year-end');
  revalidatePath('/reports');
}

function asFormState(error: unknown): FormState {
  const payload = toErrorPayload(error);
  return { ok: false, message: payload.message, fields: payload.fields };
}

/**
 * Parses the optional money boxes, collecting every complaint before failing.
 *
 * A 1098 has eight numbers on it. Reporting one typo at a time would mean eight
 * round trips through a form the owner opens once a year.
 */
class MoneyFields {
  readonly errors: Record<string, string> = {};

  constructor(private readonly formData: FormData) {}

  get hasErrors(): boolean {
    return Object.keys(this.errors).length > 0;
  }

  get summary(): string {
    return 'Check the amounts marked below. Nothing else on the form is a problem.';
  }

  /** Null for an empty box - "not on the form" is a fact, and it is not zero. */
  optional(key: string): number | null {
    const raw = str(this.formData, key);
    if (!raw) return null;
    try {
      return parseAmountToCents(raw);
    } catch (error) {
      this.errors[key] = error instanceof Error ? error.message : 'Check this figure.';
      return null;
    }
  }
}

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function source(value: string): DocumentSource | null {
  return DOCUMENT_SOURCES.some((o) => o.id === value) ? (value as DocumentSource) : null;
}

function reconciliationKind(value: string): ReconciliationKind {
  return RECONCILIATION_KINDS.some((o) => o.id === value)
    ? (value as ReconciliationKind)
    : 'other';
}

function cpaFigureKind(value: string): CpaFigureKind {
  return CPA_FIGURE_KINDS.some((o) => o.id === value) ? (value as CpaFigureKind) : 'other';
}

function rate(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value.replace('%', '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function recovery(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}
