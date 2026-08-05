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

/**
 * The fields of an existing person this form can put back on screen. Only what
 * is editable - the row's id travels as a hidden input so the action knows to
 * update rather than insert.
 */
export type EditableActor = {
  id: string;
  name: string;
  type: string;
  email: string | null;
  w9OnFile: boolean;
  taxIdCollected: boolean;
  notes: string | null;
};

export function ActorForm({ actor }: { actor?: EditableActor }) {
  const [state, formAction] = useActionState(saveActorAction, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="form">
      {actor ? <input type="hidden" name="id" value={actor.id} /> : null}
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

      <label className="field">
        <span className="field-label">Name</span>
        <input
          className="input"
          name="name"
          required
          maxLength={120}
          defaultValue={actor?.name ?? ''}
        />
      </label>

      <label className="field">
        <span className="field-label">What are they?</span>
        <select className="select" name="type" defaultValue={actor?.type ?? 'contractor'}>
          {TYPES.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">Email (optional)</span>
        <input
          className="input"
          name="email"
          type="email"
          maxLength={200}
          defaultValue={actor?.email ?? ''}
        />
      </label>

      <label className="row cursor-pointer">
        <span>
          <span className="rowtitle">W-9 on file</span>
          <span className="hint">
            Without this, a contractor paid $600 or more in a year raises a warning from
            October onward.
          </span>
        </span>
        <input
          type="checkbox"
          name="w9OnFile"
          className="h-6 w-6 shrink-0"
          defaultChecked={actor?.w9OnFile ?? false}
        />
      </label>

      <label className="row cursor-pointer">
        <span>
          <span className="rowtitle">Tax ID collected</span>
        </span>
        <input
          type="checkbox"
          name="taxIdCollected"
          className="h-6 w-6 shrink-0"
          defaultChecked={actor?.taxIdCollected ?? false}
        />
      </label>

      <label className="field mt-3">
        <span className="field-label">Notes (optional)</span>
        <textarea className="textarea" name="notes" maxLength={2000} defaultValue={actor?.notes ?? ''} />
      </label>

      <Submit editing={Boolean(actor)} />
    </form>
  );
}

function Submit({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return <SubmitButton pending={pending}>{editing ? 'Save' : 'Add'}</SubmitButton>;
}
