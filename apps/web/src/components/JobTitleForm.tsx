'use client';

import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { renameJobAction } from '@/app/actions/jobs';
import { EMPTY_FORM_STATE } from '@/app/actions/formState';
import { SubmitButton } from './Pickers';

/**
 * Renaming a job.
 *
 * The action has existed since jobs did and was wired to nothing, so a title
 * taken from whichever record happened to create the job - "The Home Depot",
 * "CLEANING SERVICE" - was permanent. A job is the one record in this app the
 * owner names, so it is the one that most needs correcting.
 *
 * The notes field travels with it because `renameJobAction` writes both, and
 * posting the form without it would silently blank a note that was already there.
 */
export function JobTitleForm({
  id,
  title,
  notes,
  onSaved,
  onCancel,
}: {
  id: string;
  title: string;
  notes: string | null;
  /** Given when the form lives in a dialog, which shuts once the save lands. */
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const [state, formAction] = useActionState(renameJobAction, EMPTY_FORM_STATE);

  // On the SUCCESS of the action, not on the click - a title that failed
  // validation has to stay on screen with its message, or the owner watches the
  // dialog vanish and the old name still sitting in the row.
  useEffect(() => {
    if (state.ok) onSaved?.();
  }, [state, onSaved]);

  return (
    <form action={formAction} className="form">
      <input type="hidden" name="id" value={id} />

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
        <span className="field-label">Title</span>
        <input
          className="input"
          name="title"
          defaultValue={title}
          maxLength={200}
          required
          autoComplete="off"
        />
        {state.fields?.title ? <span className="error-text">{state.fields.title}</span> : null}
      </label>

      <label className="field">
        <span className="field-label">Notes</span>
        <textarea className="input" name="notes" rows={2} defaultValue={notes ?? ''} />
      </label>

      <Buttons onCancel={onCancel} />
    </form>
  );
}

function Buttons({ onCancel }: { onCancel?: (() => void) | undefined }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex items-center gap-2">
      {onCancel ? (
        // Disabled mid-save: closing the dialog while the action is in flight
        // unmounts the form that is holding the result.
        <button type="button" className="btn" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      ) : null}
      <SubmitButton pending={pending}>Save</SubmitButton>
    </div>
  );
}
