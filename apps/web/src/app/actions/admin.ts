'use server';

import { revalidatePath } from 'next/cache';
import { parseAmountToCents } from '@rental/domain';
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

    let unadjustedBasisCents = 0;
    const basisRaw = str(formData, 'unadjustedBasis');
    if (basisRaw) {
      try {
        unadjustedBasisCents = parseAmountToCents(basisRaw);
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'Check the basis figure.',
          fields: { unadjustedBasis: 'Check this' },
        };
      }
    }

    const payload = {
      enterpriseId: str(formData, 'enterpriseId') || user.enterprise.id,
      nickname: str(formData, 'nickname'),
      address: str(formData, 'address'),
      acquiredDate: str(formData, 'acquiredDate') || null,
      unadjustedBasisCents,
      ownershipPct: Number(str(formData, 'ownershipPct') || '100'),
      isSelfManaged: formData.get('isSelfManaged') === 'on',
      // §5.4: either of these removes the property from its enterprise for the
      // year, so they are plain checkboxes on the record rather than buried.
      isTripleNet: formData.get('isTripleNet') === 'on',
      hadPersonalUse: formData.get('hadPersonalUse') === 'on',
    };

    if (id) {
      await updateProperty({ ...payload, id });
    } else {
      await createProperty(payload);
    }

    revalidatePath('/properties');
    revalidatePath('/');
    return { ok: true, saved: id ? 'Property updated.' : 'Property added.' };
  } catch (error) {
    const payload = toErrorPayload(error);
    return { ok: false, message: payload.message, fields: payload.fields };
  }
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
