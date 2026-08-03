'use server';

import { revalidatePath } from 'next/cache';
import { parseAmountToCents } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { toErrorPayload } from '@/server/errors';
import {
  deletePayment,
  planInstalments,
  updatePayment,
} from '@/server/services/payments';
import type { FormState } from './formState';

/**
 * Payments against one expense.
 *
 * This is the part of the app most people will never open. An expense is
 * entered, the service writes the one payment row that says "paid in full on
 * the invoice date", and that is the end of it for roughly seventy-three
 * expenses out of seventy-five.
 *
 * These actions serve the other two: the invoice that genuinely straddles a
 * year boundary, where what was deducted has to be what actually left the bank.
 */

export async function correctPaymentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireUser();

    let amountCents: number;
    try {
      amountCents = parseAmountToCents(str(formData, 'amount'));
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Check the amount.',
        fields: { amount: 'Check this' },
      };
    }

    await updatePayment({
      id: str(formData, 'id'),
      amountCents,
      paidDate: str(formData, 'paidDate') || undefined,
    });

    revalidateExpense(str(formData, 'expenseId'));
    return { ok: true, saved: 'Saved.' };
  } catch (error) {
    const payload = toErrorPayload(error);
    return { ok: false, message: payload.message, fields: payload.fields };
  }
}

/**
 * Spreads the unpaid remainder over monthly instalments.
 *
 * Every row it writes is scheduled, so none of it is deductible until the owner
 * confirms the money moved. That is what "push the rest to next year" has to
 * mean for the figures to stay honest.
 */
export async function planInstalmentsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireUser();

    const count = Number(str(formData, 'count'));
    if (!Number.isInteger(count) || count < 1) {
      return { ok: false, message: 'How many instalments?', fields: { count: 'Required' } };
    }

    const payments = await planInstalments({
      expenseId: str(formData, 'expenseId'),
      count,
      firstDate: str(formData, 'firstDate'),
    });

    revalidateExpense(str(formData, 'expenseId'));
    return {
      ok: true,
      saved: `Scheduled ${payments.length} ${payments.length === 1 ? 'payment' : 'payments'}. None of it is deducted until you confirm it went out.`,
    };
  } catch (error) {
    const payload = toErrorPayload(error);
    return { ok: false, message: payload.message, fields: payload.fields };
  }
}

/** Refuses the last payment on an expense - see the service for why. */
export async function deletePaymentAction(id: string, expenseId: string): Promise<void> {
  await requireUser();
  await deletePayment(id);
  revalidateExpense(expenseId);
}

function revalidateExpense(expenseId: string) {
  if (expenseId) revalidatePath(`/entries/expense/${expenseId}`);
  revalidatePath('/entries');
  revalidatePath('/year-end');
  revalidatePath('/');
}

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}
