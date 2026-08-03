'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { getScheduleECategory, listScheduleECategories } from '@rental/domain';
import { saveExpenseAction } from '@/app/actions/capture';
import { EMPTY_FORM_STATE } from '@/app/actions/formState';
import { ReceiptUpload } from './ReceiptUpload';
import { ActorPicker, PropertyPicker, SelectField, SubmitButton, type Option } from './Pickers';

/**
 * Expense entry.
 *
 * The repair-versus-improvement prompt that §5.3 describes is milestone 2. What
 * this form does now is flag - honestly - which lines will need that answer, so
 * the user knows an entry is not finished rather than believing it is.
 */
export function ExpenseForm({
  today,
  actorId,
  properties,
  people,
  contractors,
  jobId = null,
  defaultPropertyId = null,
}: {
  today: string;
  actorId: string;
  properties: Option[];
  people: Option[];
  contractors: Option[];
  /** Set only when opened from "+ Add related". Hidden - never a field. */
  jobId?: string | null;
  defaultPropertyId?: string | null;
}) {
  const [state, formAction] = useActionState(saveExpenseAction, EMPTY_FORM_STATE);
  const [category, setCategory] = useState('');

  const needsClassification = category
    ? safeTriggersPrompt(category)
    : false;

  return (
    <form action={formAction} className="form">
      {/*
        The job rides along invisibly. THIS FORM HAS THE SAME FIELDS IT HAS
        ALWAYS HAD - a hidden value is not a field, and the word "job" appears
        nowhere on it. Adding a job picker here would tax the seventy-odd
        expenses a year that stand alone to serve the handful that do not.
      */}
      {jobId ? <input type="hidden" name="jobId" value={jobId} /> : null}

      {state.message ? (
        <p role="alert" className="error-text mb-2">
          {state.message}
        </p>
      ) : null}

      <label className="field">
        <span className="field-label">How much?</span>
        <input
          className="input num"
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="124.99"
          required
        />
        {state.fields?.amount ? <span className="error-text">{state.fields.amount}</span> : null}
      </label>

      <label className="field">
        <span className="field-label">Paid to</span>
        <input
          className="input"
          name="vendor"
          required
          maxLength={200}
          placeholder="Home Depot"
          autoComplete="off"
        />
      </label>

      <div className="field">
        <label className="field-label" htmlFor="scheduleECategory">
          Which Schedule E line?
        </label>
        <select
          id="scheduleECategory"
          className="select"
          name="scheduleECategory"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Choose…</option>
          {listScheduleECategories().map((line) => (
            <option key={line.id} value={line.id}>
              {line.line}. {line.label}
            </option>
          ))}
        </select>
        {category ? <span className="hint">{safeHelper(category)}</span> : null}
        {needsClassification ? (
          <p className="note note-warn">
            This is spend on physical work, so it needs a repair-or-improvement
            answer before year end. It will sit in the review list until then.
          </p>
        ) : null}
      </div>

      <PropertyPicker
        options={properties}
        label="Which property?"
        allowNone={false}
        required
        defaultValue={defaultPropertyId}
      />

      <SelectField
        name="contractorActorId"
        label="Paid a contractor? (optional)"
        options={contractors}
        placeholder="Not a contractor"
        hint="Naming them here keeps their yearly total running, so the W-9 warning can fire before October."
      />

      <ReceiptUpload />

      <label className="field">
        <span className="field-label">When?</span>
        <input className="input" type="date" name="date" defaultValue={today} required />
      </label>

      <label className="field">
        <span className="field-label">Notes (optional)</span>
        <textarea className="textarea" name="notes" maxLength={2000} />
      </label>

      <ActorPicker options={people} defaultValue={actorId} />

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return <SubmitButton pending={pending}>Save expense</SubmitButton>;
}

function safeTriggersPrompt(id: string): boolean {
  try {
    return getScheduleECategory(id).triggersCapitalPrompt;
  } catch {
    return false;
  }
}

function safeHelper(id: string): string {
  try {
    return getScheduleECategory(id).helper;
  } catch {
    return '';
  }
}
