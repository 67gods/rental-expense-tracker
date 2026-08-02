'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isHourCategoryId, todayInZone } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { toErrorPayload } from '@/server/errors';
import {
  createTimeEntry,
  deleteTimeEntry,
  updateTimeEntry,
} from '@/server/services/timeEntries';

/**
 * Server actions for time entry.
 *
 * These call the same services the /api/v1 routes do, so the web forms and the
 * Android client at M4 go through one implementation of the rules rather than
 * two that drift.
 */

export interface FormState {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
  /** Confirmation text shown after a successful save. */
  saved?: string;
}

export const EMPTY_FORM_STATE: FormState = { ok: false };

export async function saveTimeEntryAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  let destination: string | null = null;

  try {
    const user = await requireUser();
    const id = str(formData, 'id');

    const category = str(formData, 'category');
    // Narrowed with the domain's own guard rather than asserted, so a stale or
    // tampered form value is refused here instead of reaching the eligibility
    // rule as an unknown category.
    if (!isHourCategoryId(category)) {
      return {
        ok: false,
        message: category ? 'That category is not one we track.' : 'Pick what you were doing.',
        fields: { category: 'Required' },
      };
    }

    const minutes = Number(str(formData, 'minutes'));
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return { ok: false, message: 'How long did it take?', fields: { minutes: 'Required' } };
    }

    const payload = {
      date: str(formData, 'date') || todayInZone(user.timeZone),
      actorId: str(formData, 'actorId') || user.actor.id,
      enterpriseId: user.enterprise.id,
      propertyId: str(formData, 'propertyId') || null,
      minutes,
      category,
      description: str(formData, 'description'),
      source: 'manual' as const,
    };

    if (id) {
      await updateTimeEntry({ ...payload, id });
    } else {
      await createTimeEntry(payload);
    }

    revalidatePath('/');
    revalidatePath('/entries');
    destination = formData.get('returnTo')?.toString() || '/entries?saved=time';
  } catch (error) {
    const payload = toErrorPayload(error);
    return { ok: false, message: payload.message, fields: payload.fields };
  }

  // redirect() throws to unwind, so it must sit outside the try block or the
  // catch would treat a successful save as a failure.
  redirect(destination);
}

export async function deleteTimeEntryAction(id: string): Promise<void> {
  await requireUser();
  await deleteTimeEntry(id);
  revalidatePath('/');
  revalidatePath('/entries');
}

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}
