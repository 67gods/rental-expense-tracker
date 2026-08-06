'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveCharityAction } from '@/app/actions/donations';
import { EMPTY_FORM_STATE } from '@/app/actions/formState';
import { SubmitButton } from './Pickers';

export interface CharityDefaults {
  id?: string;
  name?: string;
  taxId?: string | null;
}

/**
 * A charity, entered once and given to many times.
 *
 * Two fields, and the second one is the only taxpayer identification number this
 * app holds. That is deliberate and it is not the same thing as holding a
 * household's: a donee's EIN is published by the IRS and printed on the
 * acknowledgment letter, and it is what lets somebody check the deduction rather
 * than take it on trust.
 *
 * It is optional, because the alternative is worse. A gift recalled in January
 * with the letter still in a drawer is a gift that gets recorded here or gets
 * lost, and refusing it until the EIN is to hand chooses losing it.
 */
export function CharityForm({ defaults = {} }: { defaults?: CharityDefaults }) {
  const [state, formAction] = useActionState(saveCharityAction, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="form">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}

      {state.message ? (
        <p role="alert" className="error-text mb-2">
          {state.message}
        </p>
      ) : null}
      {state.saved ? (
        <p role="status" className="mb-2 text-sm pos">
          {state.saved}
        </p>
      ) : null}

      <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
        <label className="field">
          <span className="field-label">Charity</span>
          <input
            className="input"
            name="name"
            required
            maxLength={200}
            defaultValue={defaults.name}
            placeholder="American Red Cross"
          />
          {state.fields?.name ? (
            <span className="error-text">{state.fields.name}</span>
          ) : (
            <span className="hint">As it appears on the letter.</span>
          )}
        </label>

        <label className="field">
          <span className="field-label">Tax ID (optional)</span>
          <input
            className="input"
            name="taxId"
            maxLength={20}
            defaultValue={defaults.taxId ?? ''}
            placeholder="53-0196605"
            inputMode="numeric"
            autoComplete="off"
          />
          {state.fields?.taxId ? (
            <span className="error-text">{state.fields.taxId}</span>
          ) : (
            <span className="hint">
              The EIN from the acknowledgment. Public information — leave it blank if the
              letter is not to hand.
            </span>
          )}
        </label>
      </div>

      <Submit isEdit={Boolean(defaults.id)} />
    </form>
  );
}

function Submit({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <SubmitButton pending={pending}>{isEdit ? 'Save changes' : 'Add this charity'}</SubmitButton>
  );
}
