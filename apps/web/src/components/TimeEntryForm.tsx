'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveTimeEntryAction } from '@/app/actions/timeEntries';
import { EMPTY_FORM_STATE } from '@/app/actions/formState';
import { CategoryPicker } from './CategoryPicker';
import { MinutePicker } from './MinutePicker';
import { ActorPicker, PropertyPicker, SubmitButton, type Option } from './Pickers';

export interface TimeEntryDefaults {
  id?: string;
  date: string;
  actorId: string;
  propertyId?: string | null;
  minutes?: number;
  category?: string;
  description?: string;
}

/**
 * Time entry (§7.2, target: under 15 seconds).
 *
 * Everything that can carry a default does. Today's date and the signed-in
 * person are pre-filled, duration is a chip, and the only thing that has to be
 * typed is the description - which §6 requires, because a category on its own
 * is not a record.
 */
export function TimeEntryForm({
  defaults,
  properties,
  people,
  returnTo,
}: {
  defaults: TimeEntryDefaults;
  properties: Option[];
  people: Option[];
  returnTo?: string;
}) {
  const [state, formAction] = useActionState(saveTimeEntryAction, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="grid gap-1">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      {state.message ? (
        <p role="alert" className="error-text mb-2">
          {state.message}
        </p>
      ) : null}

      {/* The year comes from the entry's own date, so an entry backdated into
          last year is explained under last year's rules. */}
      <CategoryPicker
        defaultValue={defaults.category}
        taxYear={Number(defaults.date.slice(0, 4))}
      />
      <MinutePicker defaultValue={defaults.minutes} />

      <label className="field">
        <span className="label">What did you do?</span>
        <textarea
          className="textarea"
          name="description"
          defaultValue={defaults.description ?? ''}
          required
          maxLength={1000}
          placeholder="Replaced the kitchen faucet washer and checked under the sink"
        />
        <span className="hint">
          One specific line. This is the part that makes the entry hold up later, so
          &ldquo;maintenance&rdquo; is not enough.
        </span>
        {state.fields?.description ? (
          <span className="error-text">{state.fields.description}</span>
        ) : null}
      </label>

      <PropertyPicker options={properties} defaultValue={defaults.propertyId} />
      <ActorPicker options={people} defaultValue={defaults.actorId} />

      <label className="field">
        <span className="label">When?</span>
        <input className="input" type="date" name="date" defaultValue={defaults.date} required />
        <span className="hint">
          Defaults to today. Logging an earlier day is fine and is recorded as such.
        </span>
      </label>

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return <SubmitButton pending={pending}>Save time entry</SubmitButton>;
}
