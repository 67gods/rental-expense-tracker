'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { RENT_SOURCES } from '@rental/domain';
import { saveIncomeAction } from '@/app/actions/capture';
import { EMPTY_FORM_STATE } from '@/app/actions/formState';
import { ActorPicker, PropertyPicker, SubmitButton, type Option } from './Pickers';

/**
 * Rent received.
 *
 * Recording income is not the rent collection the brief rules out - nothing
 * here chases a tenant or moves money. It exists because the year-end export
 * has to show income by Schedule E line per property, and the small-taxpayer
 * check needs gross receipts.
 */
export function IncomeForm({
  today,
  actorId,
  properties,
  people,
}: {
  today: string;
  actorId: string;
  properties: Option[];
  people: Option[];
}) {
  const [state, formAction] = useActionState(saveIncomeAction, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="grid gap-1">
      {state.message ? (
        <p role="alert" className="error-text mb-2">
          {state.message}
        </p>
      ) : null}

      <label className="field">
        <span className="field-label">How much came in?</span>
        <input
          className="input num"
          name="amount"
          inputMode="decimal"
          required
          placeholder="1850.00"
          autoComplete="off"
        />
        {state.fields?.amount ? <span className="error-text">{state.fields.amount}</span> : null}
      </label>

      <PropertyPicker
        options={properties}
        label="Which property?"
        allowNone={false}
        required
      />
      {state.fields?.propertyId ? (
        <span className="error-text">{state.fields.propertyId}</span>
      ) : null}

      <div className="field">
        <label className="field-label" htmlFor="source">
          How did it arrive?
        </label>
        <select id="source" className="select" name="source" defaultValue="property_manager">
          {RENT_SOURCES.map((source) => (
            <option key={source.id} value={source.id}>
              {source.label}
            </option>
          ))}
        </select>
        <span className="hint">
          Kept so the year-end figures can be reconciled against the manager&rsquo;s
          statements.
        </span>
      </div>

      <label className="field">
        <span className="field-label">When?</span>
        <input className="input" type="date" name="date" defaultValue={today} required />
      </label>

      <label className="field">
        <span className="field-label">Notes (optional)</span>
        <textarea
          className="textarea"
          name="notes"
          maxLength={2000}
          placeholder="March rent, less the $95 management fee"
        />
      </label>

      <ActorPicker options={people} defaultValue={actorId} />

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return <SubmitButton pending={pending}>Save rent received</SubmitButton>;
}
