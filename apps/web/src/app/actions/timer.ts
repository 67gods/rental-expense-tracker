'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isHourCategoryId } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { toErrorPayload } from '@/server/errors';
import { discardTimer, startTimer, stopTimer } from '@/server/services/timer';
import type { FormState } from './formState';

export async function startTimerAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  let destination: string | null = null;

  try {
    const user = await requireUser();
    const category = str(formData, 'category');

    if (!isHourCategoryId(category)) {
      return {
        ok: false,
        message: category ? 'That category is not one we track.' : 'Pick what you are working on.',
        fields: { category: 'Required' },
      };
    }

    await startTimer({
      actorId: user.actor.id,
      enterpriseId: user.enterprise.id,
      propertyId: str(formData, 'propertyId') || null,
      category,
      description: str(formData, 'description'),
    });

    revalidatePath('/', 'layout');
    destination = '/';
  } catch (error) {
    const payload = toErrorPayload(error);
    return { ok: false, message: payload.message, fields: payload.fields };
  }

  redirect(destination);
}

export async function stopTimerAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  let destination: string | null = null;

  try {
    await requireUser();

    const description = str(formData, 'description');
    if (!description) {
      return {
        ok: false,
        message: 'Describe what you worked on. A category on its own is not a record.',
        fields: { description: 'Required' },
      };
    }

    const overrideRaw = str(formData, 'minutesOverride');
    const minutesOverride = overrideRaw ? Number(overrideRaw) : null;
    if (overrideRaw && (!Number.isFinite(minutesOverride) || (minutesOverride ?? 0) < 1)) {
      return {
        ok: false,
        message: 'The corrected time needs to be at least one minute.',
        fields: { minutesOverride: 'Check this' },
      };
    }

    const categoryRaw = str(formData, 'category');

    await stopTimer({
      id: str(formData, 'id'),
      description,
      minutesOverride,
      ...(isHourCategoryId(categoryRaw) ? { category: categoryRaw } : {}),
      propertyId: str(formData, 'propertyId') || null,
    });

    revalidatePath('/', 'layout');
    revalidatePath('/entries');
    destination = '/entries?saved=timer';
  } catch (error) {
    const payload = toErrorPayload(error);
    return { ok: false, message: payload.message, fields: payload.fields };
  }

  redirect(destination);
}

/** Throws the session away without writing an entry. */
export async function discardTimerAction(id: string): Promise<void> {
  await requireUser();
  await discardTimer(id);
  revalidatePath('/', 'layout');
}

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}
