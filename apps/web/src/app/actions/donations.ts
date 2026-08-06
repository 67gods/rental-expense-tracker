'use server';

import { revalidatePath } from 'next/cache';
import { DONATION_KINDS, MoneyError, parseAmountToCents, type DonationKind } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { toErrorPayload } from '@/server/errors';
import {
  archiveCharity,
  createCharity,
  createDonation,
  deleteDonation,
  updateCharity,
  updateDonation,
} from '@/server/services/donations';
import type { FormState } from './formState';

/**
 * Recording what was given away.
 *
 * Its own actions file rather than another banner in `yearEnd.ts`. The year-end
 * actions are transcriptions - a form arrives, its boxes get copied - and they
 * all happen in one week. Giving happens all year and the form carries a file
 * upload, which makes this `capture.ts`'s shape rather than the January sitting's.
 *
 * Nothing here decides whether a gift is deductible. It records an amount, a
 * date, a charity, and whether the letter that makes it defensible exists.
 */

// --- Charities ---------------------------------------------------------------

export async function saveCharityAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireUser();

    const payload = {
      name: str(formData, 'name'),
      // Empty, not null: the schema trims it and turns a blank into null itself,
      // and routing it through there keeps the nine-bare-digits case in one
      // place rather than two.
      taxId: str(formData, 'taxId'),
    };

    const id = str(formData, 'id');
    if (id) {
      await updateCharity({ ...payload, id });
    } else {
      await createCharity(payload);
    }

    revalidateDonations();
    return { ok: true, saved: `Saved ${payload.name}.` };
  } catch (error) {
    return asFormState(error);
  }
}

export async function archiveCharityAction(id: string): Promise<void> {
  await requireUser();
  await archiveCharity(id);
  revalidateDonations();
}

// --- The gifts ---------------------------------------------------------------

/**
 * One gift, recorded or corrected.
 *
 * The amount is validated here rather than left to the schema, because
 * `parseAmountToCents` is what turns "1,250.00" into cents and its complaint
 * names the problem ("that is not a number") where a zod message about integers
 * would not.
 */
export async function saveDonationAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const user = await requireUser();

    const charityId = str(formData, 'charityId');
    if (!charityId) {
      return { ok: false, message: 'Which charity?', fields: { charityId: 'Required' } };
    }

    const rawAmount = str(formData, 'amount');
    if (!rawAmount) {
      return { ok: false, message: 'How much was given?', fields: { amount: 'Required' } };
    }

    let amountCents: number;
    try {
      amountCents = parseAmountToCents(rawAmount);
    } catch (error) {
      return {
        ok: false,
        message: error instanceof MoneyError ? error.message : 'Check the amount.',
        fields: { amount: 'Check this figure.' },
      };
    }

    const kind = donationKindOf(str(formData, 'kind'));
    const payload = {
      charityId,
      date: str(formData, 'date'),
      actorId: user.actor.id,
      amountCents,
      kind,
      // Cleared when the gift is money, so switching a mistyped non-cash gift
      // over to cash does not leave a description of goods hanging off it.
      nonCashDescription: kind === 'non_cash' ? str(formData, 'nonCashDescription') || null : null,
      acknowledgmentOnFile: formData.get('acknowledgmentOnFile') !== null,
      receiptKey: str(formData, 'receiptKey') || null,
      receiptSha256: str(formData, 'receiptSha256') || null,
      note: str(formData, 'note') || null,
    };

    const id = str(formData, 'id');
    if (id) {
      await updateDonation({ ...payload, id });
    } else {
      await createDonation(payload);
    }

    revalidateDonations();
    return { ok: true, saved: id ? 'Corrected.' : 'Recorded.' };
  } catch (error) {
    return asFormState(error);
  }
}

export async function deleteDonationAction(id: string): Promise<void> {
  await requireUser();
  await deleteDonation(id);
  revalidateDonations();
}

// --- internals --------------------------------------------------------------

function revalidateDonations() {
  revalidatePath('/donations');
  revalidatePath('/year-end');
  revalidatePath('/reports');
}

function asFormState(error: unknown): FormState {
  const payload = toErrorPayload(error);
  return { ok: false, message: payload.message, fields: payload.fields };
}

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Money unless the form said goods.
 *
 * Defaulting rather than rejecting, because the two ids are radio buttons with
 * one of them pre-selected - an unrecognised value here means a tampered
 * request, not a person who forgot to answer, and cash is the reading that
 * requires no description and so hides nothing.
 */
function donationKindOf(value: string): DonationKind {
  return DONATION_KINDS.some((o) => o.id === value) ? (value as DonationKind) : 'cash';
}
