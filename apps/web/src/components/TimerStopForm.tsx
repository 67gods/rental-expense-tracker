'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { formatMinutes, getHourCategory, listHourCategories } from '@rental/domain';
import { discardTimerAction } from '@/app/actions/timer';
import { stopTimerAction } from '@/app/actions/timer';
import { EMPTY_FORM_STATE } from '@/app/actions/formState';
import { EligibilityBadge } from './CategoryPicker';
import { PropertyPicker, SubmitButton, type Option } from './Pickers';

/**
 * Stopping a timer (§8.2).
 *
 * The measured time is offered as the default and can be replaced. That is the
 * whole point of retroactive correction: a timer left running through lunch
 * should be saved as the 40 minutes of work it represents, not the three hours
 * the clock counted. The entry's `created_at` is unaffected, so correcting the
 * duration never manufactures a contemporaneous record.
 */
export function TimerStopForm({
  id,
  measuredMinutes,
  isLongRunning,
  category,
  description,
  propertyId,
  properties,
}: {
  id: string;
  measuredMinutes: number;
  isLongRunning: boolean;
  category: string;
  description: string;
  propertyId: string | null;
  properties: Option[];
}) {
  const [state, formAction] = useActionState(stopTimerAction, EMPTY_FORM_STATE);
  const [correcting, setCorrecting] = useState(isLongRunning);
  const [minutes, setMinutes] = useState(measuredMinutes);
  const [selectedCategory, setSelectedCategory] = useState(category);

  const chosen = safeGet(selectedCategory);

  return (
    <form action={formAction} className="grid gap-1">
      <input type="hidden" name="id" value={id} />

      {state.message ? (
        <p role="alert" className="error-text mb-2">
          {state.message}
        </p>
      ) : null}

      <div className="panel panel-body mb-3">
        <p className="section-title">Measured</p>
        <p className="num text-3xl font-bold tracking-tight">
          {formatMinutes(measuredMinutes)}
        </p>
        {isLongRunning ? (
          <p className="hint mt-2 rounded-lg border border-[color:var(--color-flag-500)] bg-[color:var(--color-flag-50)] p-2.5 warn">
            This ran for a long stretch. If you stepped away, correct it to the time you
            actually worked — an inflated entry is worse than a missing one.
          </p>
        ) : null}
      </div>

      {correcting ? (
        <label className="field">
          <span className="field-label">Time actually worked</span>
          <input
            className="input num"
            type="number"
            inputMode="numeric"
            name="minutesOverride"
            min={1}
            max={1440}
            value={minutes || ''}
            onChange={(e) => setMinutes(Number(e.target.value))}
            required
          />
          <span className="hint">
            Minutes. Recorded as of now, so the entry still shows when it was written.
          </span>
          {state.fields?.minutesOverride ? (
            <span className="error-text">{state.fields.minutesOverride}</span>
          ) : null}
        </label>
      ) : (
        <button
          type="button"
          className="btn btn-block mb-3"
          onClick={() => setCorrecting(true)}
        >
          Correct the time
        </button>
      )}

      <label className="field">
        <span className="field-label">What did you do?</span>
        <textarea
          className="textarea"
          name="description"
          defaultValue={description}
          required
          maxLength={1000}
          autoFocus
          placeholder="Reviewed and marked up the Oak Ave renewal lease"
        />
        {state.fields?.description ? (
          <span className="error-text">{state.fields.description}</span>
        ) : null}
      </label>

      <div className="field">
        <label className="field-label" htmlFor="category">
          Category
        </label>
        <select
          id="category"
          className="select"
          name="category"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
        >
          {listHourCategories().map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        {chosen ? (
          <span className="hint mt-1 flex items-center gap-2">
            <EligibilityBadge eligible={chosen.shEligible} />
            {chosen.helper}
          </span>
        ) : null}
      </div>

      <PropertyPicker options={properties} defaultValue={propertyId} />

      <Submit />

      <button
        type="button"
        className="btn btn-danger btn-block mt-2"
        onClick={() => {
          if (confirm('Throw this timer away without saving an entry?')) {
            void discardTimerAction(id);
          }
        }}
      >
        Discard without saving
      </button>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return <SubmitButton pending={pending}>Save time entry</SubmitButton>;
}

function safeGet(id: string) {
  try {
    return getHourCategory(id);
  } catch {
    return null;
  }
}
