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
import { createExpense, deleteExpense, updateExpense } from '@/server/services/expenses';
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

/** §5.3. The empty string is the fourth option - "not answered" - not a miss. */
const CAPITAL_CLASSIFICATIONS = ['repair', 'improvement', 'needs_review'] as const;
type CapitalClassification = (typeof CAPITAL_CLASSIFICATIONS)[number];

/**
 * Logs a new expense, or saves a correction to one.
 *
 * One action for both, keyed on a hidden id, so the two paths cannot disagree
 * about what a valid expense is. The shape follows saveTimeEntryAction, which
 * had the same problem first.
 */
export async function saveExpenseAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  let destination: string | null = null;

  try {
    const user = await requireUser();
    const id = str(formData, 'id');

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

    const jobId = str(formData, 'jobId') || null;

    const date = str(formData, 'date') || todayInZone(user.timeZone);
    const reading = unsureReading(formData, { amountCents, date });

    const common = {
      date,
      actorId: str(formData, 'actorId') || user.actor.id,
      amountCents,
      vendor: str(formData, 'vendor'),
      scheduleECategory,
      contractorActorId: str(formData, 'contractorActorId') || null,
      receiptKey: str(formData, 'receiptKey') || null,
      receiptSha256: str(formData, 'receiptSha256') || null,
      notes: str(formData, 'notes') || null,
    };

    if (id) {
      // The field is ABSENT when the form is a split expense's - there is no
      // UI for editing the rule, so ExpenseForm never renders the picker and
      // updateExpense reads undefined as "leave it". Present-but-empty is a
      // real choice: Portfolio-wide, which is now a value (§6), not a gap.
      const propertyId = str(formData, 'propertyId');

      await updateExpense({
        ...common,
        id,
        capitalClassification: capitalClassification(formData),
        ...(formData.has('propertyId') ? { propertyId: propertyId || null } : {}),
      });

      revalidatePath('/');
      revalidatePath('/entries');
      revalidatePath(`/entries/expense/${id}`);
      destination = str(formData, 'returnTo') || `/entries/expense/${id}?saved=1`;
    } else {
      const expense = await createExpense(
        {
          ...common,
          propertyId: str(formData, 'propertyId') || null,
          // A figure the reader was unsure of, saved unchanged, is the one case
          // that earns a place on the review list - see unsureReading.
          ...(reading
            ? {
                capitalClassification: 'needs_review' as const,
                classificationAnswers: { extraction: reading },
              }
            : {}),
        },
        { jobId },
      );

      revalidatePath('/');
      revalidatePath('/entries');
      destination = afterSave('expense', expense.id, jobId);
    }
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

    const jobId = str(formData, 'jobId') || null;

    // buildTripDrafts refuses on-site time with no description or category and
    // says why, so those cases surface as the domain's own message.
    // The job id reaches all three rows the trip writes - miles, drive time and
    // on-site time - so grouping a store run captures the whole errand.
    const result = await createTrip(
      {
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
      },
      { jobId },
    );

    revalidatePath('/');
    revalidatePath('/entries');
    destination = afterSave('trip', result.trip.id, jobId);
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

/**
 * Where to land after a save.
 *
 * A record saved on its own goes back to the entries list, which offers to
 * start a job from it. A record saved INTO a job goes to that job, because the
 * only reason it carried a job id is that the owner is part-way through
 * building one and wants to see what is in it so far.
 *
 * The record id travels either way, so the list can offer "+ Add related" for
 * the thing just saved rather than making the owner find it again.
 */
function afterSave(kind: 'expense' | 'trip' | 'time', recordId: string, jobId: string | null) {
  return jobId
    ? `/jobs/${jobId}?saved=${kind}`
    : `/entries?saved=${kind}&kind=${kind}&id=${recordId}`;
}

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The §5.3 answer, narrowed here rather than asserted.
 *
 * Null is a real answer - "not answered yet" - and has to be distinguishable
 * from an absent field, because clearing an improvement set by mistake is the
 * whole reason the option is offered.
 */
function capitalClassification(formData: FormData): CapitalClassification | null {
  const value = str(formData, 'capitalClassification');
  return (CAPITAL_CLASSIFICATIONS as readonly string[]).includes(value)
    ? (value as CapitalClassification)
    : null;
}

function numberOrNull(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** What the receipt reader returned, as it arrives back on the form. */
interface ExtractionField {
  amountCents?: unknown;
  date?: unknown;
  vendor?: unknown;
  confidence?: { amount?: unknown; date?: unknown; vendor?: unknown };
}

/**
 * Decides whether a receipt reading has to be checked by a person.
 *
 * Deliberately narrow. The temptation is to flag everything a machine read,
 * but the review list is only useful while everything on it is actionable -
 * §5.3's own notes record a version that put every small expense through the
 * repair-or-improvement prompt and produced a queue of $23 items nobody could
 * act on, which teaches you to ignore the queue. A reader that is confident and
 * right most of the time would do the same thing again.
 *
 * So two conditions both have to hold: the reader said it was unsure of the
 * date or the total, AND that value is still the one being saved. Retyping the
 * amount is the check happening - there is nothing left to review.
 *
 * Returns the reading to keep as evidence, or null when nothing is owed.
 */
function unsureReading(
  formData: FormData,
  submitted: { amountCents: number; date: string },
): Record<string, unknown> | null {
  const raw = str(formData, 'extraction');
  if (!raw) return null;

  let parsed: ExtractionField;
  try {
    parsed = JSON.parse(raw) as ExtractionField;
  } catch {
    // A hidden field that did not survive the round trip is not worth failing
    // a save over. The expense is still correct; it just loses its provenance.
    return null;
  }

  const confidence = parsed.confidence ?? {};
  const amountUnsure = confidence.amount === 'low' && parsed.amountCents === submitted.amountCents;
  const dateUnsure = confidence.date === 'low' && parsed.date === submitted.date;
  if (!amountUnsure && !dateUnsure) return null;

  return {
    source: 'receipt',
    readAt: new Date().toISOString(),
    unsureAbout: [amountUnsure ? 'amount' : null, dateUnsure ? 'date' : null].filter(Boolean),
    read: { vendor: parsed.vendor, date: parsed.date, amountCents: parsed.amountCents },
  };
}
