'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { startTimerAction } from '@/app/actions/timer';
import { EMPTY_FORM_STATE } from '@/app/actions/formState';
import { CategoryPicker } from './CategoryPicker';
import { PropertyPicker, SubmitButton, type Option } from './Pickers';

/**
 * Starting a timer asks for the minimum: what and where. The description is
 * collected when it stops, because by then the person knows what they actually
 * did - and asking up front is friction at the exact moment the timer needs to
 * be easy to start.
 */
export function TimerStartForm({
  properties,
  taxYear,
}: {
  properties: Option[];
  /** A timer is always started now, so this is the current tax year. */
  taxYear: number;
}) {
  const [state, formAction] = useActionState(startTimerAction, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="grid gap-1">
      {state.message ? (
        <p role="alert" className="error-text mb-2">
          {state.message}
        </p>
      ) : null}

      <CategoryPicker taxYear={taxYear} />
      <PropertyPicker options={properties} />

      <label className="field">
        <span className="label">Note to yourself (optional)</span>
        <input
          className="input"
          name="description"
          maxLength={1000}
          placeholder="Reviewing the Oak Ave renewal"
        />
        <span className="hint">You can write the real description when you stop.</span>
      </label>

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return <SubmitButton pending={pending}>Start timer</SubmitButton>;
}
