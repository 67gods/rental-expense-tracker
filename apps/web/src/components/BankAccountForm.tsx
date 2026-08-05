'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveBankAccountAction } from '@/app/actions/yearEnd';
import { EMPTY_FORM_STATE } from '@/app/actions/formState';
import { SubmitButton, type Option } from './Pickers';

export interface BankAccountDefaults {
  id?: string;
  bankName?: string;
  holderActorId?: string | null;
  holderName?: string | null;
  label?: string | null;
}

/**
 * An account that earns interest.
 *
 * The whole record exists to answer two questions - which bank, and whose name
 * it is in - and the second one has two shapes. A joint savings account belongs
 * to a person already in People, and spelling their name freehand here would
 * let it drift from how it is spelled everywhere else. An LLC or a trust has no
 * person to point at, and adding one would put a company in the People list.
 *
 * So the holder is one question with two controls, and a segmented switch says
 * which one is meant. Only the chosen one is submitted: the database refuses
 * both at once, and a stale business name left behind after switching back to a
 * person would be an odd way to meet that constraint.
 *
 * No account numbers, here or anywhere. The bank name is the whole identity,
 * with an optional label for the household that banks twice at one bank.
 */
export function BankAccountForm({
  people,
  defaults = {},
}: {
  people: Option[];
  defaults?: BankAccountDefaults;
}) {
  const [state, formAction] = useActionState(saveBankAccountAction, EMPTY_FORM_STATE);
  const [isBusiness, setIsBusiness] = useState(
    defaults.holderName != null && defaults.holderName !== '',
  );

  return (
    <form action={formAction} className="form">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <input type="hidden" name="holderKind" value={isBusiness ? 'business' : 'person'} />

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
          <span className="field-label">Bank</span>
          <input
            className="input"
            name="bankName"
            required
            maxLength={200}
            defaultValue={defaults.bankName}
            placeholder="Ally Bank"
          />
          {state.fields?.bankName ? (
            <span className="error-text">{state.fields.bankName}</span>
          ) : (
            <span className="hint">Name only. No account numbers.</span>
          )}
        </label>

        <label className="field">
          <span className="field-label">Label (optional)</span>
          <input
            className="input"
            name="label"
            maxLength={200}
            defaultValue={defaults.label ?? ''}
            placeholder="Joint savings"
          />
          <span className="hint">Only needed when you bank twice at the same bank.</span>
        </label>
      </div>

      <div className="field">
        <span className="field-label">In whose name?</span>
        <div className="seg mb-2">
          <button
            type="button"
            aria-pressed={!isBusiness}
            onClick={() => setIsBusiness(false)}
          >
            A person
          </button>
          <button type="button" aria-pressed={isBusiness} onClick={() => setIsBusiness(true)}>
            A business or trust
          </button>
        </div>

        {isBusiness ? (
          <input
            className="input"
            name="holderName"
            maxLength={200}
            defaultValue={defaults.holderName ?? ''}
            placeholder="Gandhi Holdings LLC"
            aria-label="Business or trust name"
          />
        ) : (
          <select
            className="select"
            name="holderActorId"
            defaultValue={defaults.holderActorId ?? ''}
            aria-label="Account holder"
          >
            <option value="">Choose…</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </select>
        )}

        {state.fields?.holderActorId ? (
          <span className="error-text">{state.fields.holderActorId}</span>
        ) : null}
      </div>

      <Submit isEdit={Boolean(defaults.id)} />
    </form>
  );
}

function Submit({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <SubmitButton pending={pending}>{isEdit ? 'Save changes' : 'Add this account'}</SubmitButton>
  );
}
