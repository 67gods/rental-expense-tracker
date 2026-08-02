'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveActorAction } from '@/app/actions/admin';
import { EMPTY_FORM_STATE } from '@/app/actions/formState';
import { SubmitButton } from './Pickers';

const TYPES = [
  { id: 'contractor', label: 'Contractor' },
  { id: 'pm', label: 'Property manager' },
  { id: 'owner', label: 'Owner' },
  { id: 'spouse', label: 'Spouse' },
  { id: 'other', label: 'Other' },
] as const;

export function ActorForm() {
  const [state, formAction] = useActionState(saveActorAction, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="grid gap-1">
      {state.message ? (
        <p role="alert" className="error-text mb-2">
          {state.message}
        </p>
      ) : null}
      {state.saved ? (
        <p role="status" className="mb-2 text-sm text-[color:var(--color-eligible-700)]">
          {state.saved}
        </p>
      ) : null}

      <label className="field">
        <span className="label">Name</span>
        <input className="input" name="name" required maxLength={120} />
      </label>

      <label className="field">
        <span className="label">What are they?</span>
        <select className="select" name="type" defaultValue="contractor">
          {TYPES.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="label">Email (optional)</span>
        <input className="input" name="email" type="email" maxLength={200} />
      </label>

      <label className="row cursor-pointer">
        <span className="row-main">
          <span className="row-title">W-9 on file</span>
          <span className="row-meta">
            Without this, a contractor paid $600 or more in a year raises a warning from
            October onward.
          </span>
        </span>
        <input type="checkbox" name="w9OnFile" className="h-6 w-6 shrink-0" />
      </label>

      <label className="row cursor-pointer">
        <span className="row-main">
          <span className="row-title">Tax ID collected</span>
        </span>
        <input type="checkbox" name="taxIdCollected" className="h-6 w-6 shrink-0" />
      </label>

      <label className="field mt-3">
        <span className="label">Notes (optional)</span>
        <textarea className="textarea" name="notes" maxLength={2000} />
      </label>

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return <SubmitButton pending={pending}>Add</SubmitButton>;
}
