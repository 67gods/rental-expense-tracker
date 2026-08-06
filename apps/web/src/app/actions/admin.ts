'use server';

import { revalidatePath } from 'next/cache';
import {
  parseAmountToCents,
  PLACED_IN_SERVICE_EVIDENCE,
  type PlacedInServiceEvidence,
} from '@rental/domain';
import { requireUser } from '@/lib/session';
import { toErrorPayload } from '@/server/errors';
import {
  createActor,
  createProperty,
  updateActor,
  updateProperty,
} from '@/server/services/reference';
import type { FormState } from './formState';

/** Server actions for the properties and people admin screens. */

export async function savePropertyAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const user = await requireUser();
    const id = str(formData, 'id');

    // Every money box is parsed before anything is written, and all the
    // complaints come back at once. Reporting them one at a time would mean
    // three round trips to fix three typos in a section entered once a decade.
    const money = new MoneyFields(formData);
    const unadjustedBasisCents = money.optional('unadjustedBasis') ?? 0;
    const purchasePriceCents = money.optional('purchasePrice');
    const closingCostsCents = money.optional('closingCosts');
    const landValueCents = money.optional('landValue');
    const fmvAtConversionCents = money.optional('fmvAtConversion');
    const salePriceCents = money.optional('salePrice');
    const annualDepreciationCents = money.optional('annualDepreciation');

    if (money.hasErrors) {
      return {
        ok: false,
        message: 'Check the amounts marked below. Nothing else on the form is a problem.',
        fields: money.errors,
      };
    }

    // 'self' is how the dropdown says "no manager" without inventing a uuid.
    // The service turns it into a null manager on a new period; the boolean is
    // set here as well so the property row is right even before that runs.
    const managedByActorId = str(formData, 'managedByActorId') || 'self';

    const payload = {
      enterpriseId: str(formData, 'enterpriseId') || user.enterprise.id,
      nickname: str(formData, 'nickname'),
      address: str(formData, 'address'),
      acquiredDate: str(formData, 'acquiredDate') || null,
      unadjustedBasisCents,
      ownershipPct: Number(str(formData, 'ownershipPct') || '100'),
      isSelfManaged: managedByActorId === 'self',
      managedByActorId,
      // §5.4: either of these removes the property from its enterprise for the
      // year, so they are plain checkboxes on the record rather than buried.
      isTripleNet: formData.get('isTripleNet') === 'on',
      hadPersonalUse: formData.get('hadPersonalUse') === 'on',

      // Purchase and CPA details. All optional, and none of it can block the
      // save - a property with a nickname and an address is a valid property,
      // and a half-remembered land value must never be the reason one does not
      // get created.
      placedInServiceDate: str(formData, 'placedInServiceDate') || null,
      placedInServiceEvidence: evidence(str(formData, 'placedInServiceEvidence')),
      firstTenantDate: str(formData, 'firstTenantDate') || null,

      // Both halves of the schedule stay nullable and independent. Blank means
      // "use the in-service date", which is a real answer rather than a gap -
      // it is where depreciation starts unless something moved it.
      depreciationStartMonth: wholeNumber(str(formData, 'depreciationStartMonth')),
      depreciationStartYear: wholeNumber(str(formData, 'depreciationStartYear')),
      annualDepreciationCents,

      purchasePriceCents,
      closingCostsCents,
      landValueCents,
      wasPersonalResidence: formData.get('wasPersonalResidence') === 'on',
      convertedToRentalDate: str(formData, 'convertedToRentalDate') || null,
      fmvAtConversionCents,
      soldDate: str(formData, 'soldDate') || null,
      salePriceCents,
      section469Activity: str(formData, 'section469Activity') || null,
    };

    if (id) {
      await updateProperty({ ...payload, id });
    } else {
      await createProperty(payload);
    }

    revalidatePath('/properties');
    if (id) revalidatePath(`/properties/${id}`);
    revalidatePath('/');
    return { ok: true, saved: id ? 'Property updated.' : 'Property added.' };
  } catch (error) {
    const payload = toErrorPayload(error);
    return { ok: false, message: payload.message, fields: payload.fields };
  }
}

/**
 * Parses the optional money boxes, collecting every complaint before failing.
 *
 * An empty box reads as null, not zero. "Not recorded" and "recorded as
 * nothing" are different facts, and a land value of $0 would be a claim the
 * owner never made.
 */
class MoneyFields {
  readonly errors: Record<string, string> = {};

  constructor(private readonly formData: FormData) {}

  get hasErrors(): boolean {
    return Object.keys(this.errors).length > 0;
  }

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

/** Blank means "not recorded", which the schema wants as null rather than ''. */
function evidence(value: string): PlacedInServiceEvidence | null {
  return PLACED_IN_SERVICE_EVIDENCE.some((option) => option.id === value)
    ? (value as PlacedInServiceEvidence)
    : null;
}

/**
 * A whole number from a text box, or null.
 *
 * Anything that is not one becomes null rather than NaN, which the schema would
 * then reject with a message about an expected number - true, unhelpful, and
 * about a field the person may not have touched. The range checks live in the
 * schema, which is the one place that says what a valid month or year is.
 */
function wholeNumber(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function saveActorAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireUser();
    const id = str(formData, 'id');
    const rawType = str(formData, 'type');
    const type = (['owner', 'spouse', 'pm', 'contractor', 'other'] as const).includes(
      rawType as 'owner',
    )
      ? (rawType as 'owner' | 'spouse' | 'pm' | 'contractor' | 'other')
      : 'contractor';

    const payload = {
      name: str(formData, 'name'),
      type,
      email: str(formData, 'email') || null,
      w9OnFile: formData.get('w9OnFile') === 'on',
      taxIdCollected: formData.get('taxIdCollected') === 'on',
      notes: str(formData, 'notes') || null,
    };

    if (id) {
      await updateActor({ ...payload, id });
    } else {
      await createActor(payload);
    }

    revalidatePath('/people');
    revalidatePath('/');
    return { ok: true, saved: id ? 'Saved.' : 'Added.' };
  } catch (error) {
    const payload = toErrorPayload(error);
    return { ok: false, message: payload.message, fields: payload.fields };
  }
}

/** Toggling the W-9 flag is the single most common admin edit in Q4. */
export async function toggleW9Action(id: string, w9OnFile: boolean): Promise<void> {
  await requireUser();
  await updateActor({ id, w9OnFile });
  revalidatePath('/people');
  revalidatePath('/');
}

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}
