'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  isHourCategoryId,
  isScheduleECategoryId,
  parseAmountToCents,
  todayInZone,
} from '@rental/domain';
import type { DestinationKind } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { toErrorPayload } from '@/server/errors';
import { createExpense, deleteExpense } from '@/server/services/expenses';
import { createTrip, deleteTrip } from '@/server/services/trips';
import { createRentReceipt, deleteRentReceipt } from '@/server/services/reference';
import type { FormState } from './formState';

/** Server actions for expenses, trips, and rent income. */

const DESTINATION_KINDS: readonly DestinationKind[] = [
  'property',
  'hardware_store',
  'contractor',
  'bank',
  'other',
];

export async function saveExpenseAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  let destination: string | null = null;

  try {
    const user = await requireUser();

    const scheduleECategory = str(formData, 'scheduleECategory');
    if (!isScheduleECategoryId(scheduleECategory)) {
      return {
        ok: false,
        message: 'Pick which Schedule E line this belongs on.',
        fields: { scheduleECategory: 'Required' },
      };
    }

    let amountCents: number;
    try {
      // parseAmountToCents refuses anything ambiguous rather than guessing, so
      // its message is already written for the user.
      amountCents = parseAmountToCents(str(formData, 'amount'));
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Enter a valid amount.',
        fields: { amount: 'Check this' },
      };
    }

    await createExpense({
      date: str(formData, 'date') || todayInZone(user.timeZone),
      actorId: str(formData, 'actorId') || user.actor.id,
      propertyId: str(formData, 'propertyId') || null,
      amountCents,
      vendor: str(formData, 'vendor'),
      scheduleECategory,
      contractorActorId: str(formData, 'contractorActorId') || null,
      receiptKey: str(formData, 'receiptKey') || null,
      notes: str(formData, 'notes') || null,
    });

    revalidatePath('/');
    revalidatePath('/entries');
    destination = '/entries?saved=expense';
  } catch (error) {
    const payload = toErrorPayload(error);
    return { ok: false, message: payload.message, fields: payload.fields };
  }

  redirect(destination);
}

export async function saveTripAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  let destination: string | null = null;

  try {
    const user = await requireUser();

    const miles = Number(str(formData, 'miles'));
    if (!Number.isFinite(miles) || miles <= 0) {
      return { ok: false, message: 'How many miles?', fields: { miles: 'Required' } };
    }

    const rawKind = str(formData, 'destinationKind');
    const destinationKind = (DESTINATION_KINDS as readonly string[]).includes(rawKind)
      ? (rawKind as DestinationKind)
      : 'property';

    const onsiteCategoryRaw = str(formData, 'onsiteCategory');
    const onsiteCategory = isHourCategoryId(onsiteCategoryRaw) ? onsiteCategoryRaw : null;

    const onsiteMinutes = numberOrNull(str(formData, 'onsiteMinutes'));
    const onsiteDescription = str(formData, 'onsiteDescription') || null;

    // buildTripDrafts refuses on-site time with no description or category and
    // says why, so those cases surface as the domain's own message.
    await createTrip({
      date: str(formData, 'date') || todayInZone(user.timeZone),
      actorId: str(formData, 'actorId') || user.actor.id,
      enterpriseId: user.enterprise.id,
      propertyId: str(formData, 'propertyId') || null,
      origin: str(formData, 'origin'),
      destination: str(formData, 'destination'),
      destinationKind,
      miles,
      purpose: str(formData, 'purpose'),
      driveMinutes: numberOrNull(str(formData, 'driveMinutes')),
      onsiteMinutes,
      onsiteCategory,
      onsiteDescription,
    });

    revalidatePath('/');
    revalidatePath('/entries');
    destination = '/entries?saved=trip';
  } catch (error) {
    const payload = toErrorPayload(error);
    return { ok: false, message: payload.message, fields: payload.fields };
  }

  redirect(destination);
}

export async function saveIncomeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  let destination: string | null = null;

  try {
    const user = await requireUser();

    const propertyId = str(formData, 'propertyId');
    if (!propertyId) {
      return {
        ok: false,
        message: 'Which property was this rent for?',
        fields: { propertyId: 'Required' },
      };
    }

    let amountCents: number;
    try {
      amountCents = parseAmountToCents(str(formData, 'amount'));
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Enter a valid amount.',
        fields: { amount: 'Check this' },
      };
    }

    const rawSource = str(formData, 'source');
    const source = (['property_manager', 'direct_from_tenant', 'other'] as const).includes(
      rawSource as 'property_manager',
    )
      ? (rawSource as 'property_manager' | 'direct_from_tenant' | 'other')
      : 'property_manager';

    await createRentReceipt({
      date: str(formData, 'date') || todayInZone(user.timeZone),
      actorId: str(formData, 'actorId') || user.actor.id,
      propertyId,
      amountCents,
      source,
      notes: str(formData, 'notes') || null,
    });

    revalidatePath('/');
    revalidatePath('/entries');
    destination = '/entries?saved=income';
  } catch (error) {
    const payload = toErrorPayload(error);
    return { ok: false, message: payload.message, fields: payload.fields };
  }

  redirect(destination);
}

export async function deleteExpenseAction(id: string): Promise<void> {
  await requireUser();
  await deleteExpense(id);
  revalidatePath('/');
  revalidatePath('/entries');
}

/** Removes the trip along with the drive and on-site entries it created. */
export async function deleteTripAction(id: string): Promise<void> {
  await requireUser();
  await deleteTrip(id);
  revalidatePath('/');
  revalidatePath('/entries');
}

export async function deleteIncomeAction(id: string): Promise<void> {
  await requireUser();
  await deleteRentReceipt(id);
  revalidatePath('/');
  revalidatePath('/entries');
}

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function numberOrNull(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
