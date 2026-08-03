'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { getScheduleECategory, listScheduleECategories } from '@rental/domain';
import { saveExpenseAction } from '@/app/actions/capture';
import { EMPTY_FORM_STATE } from '@/app/actions/formState';
import { ReceiptUpload } from './ReceiptUpload';
import { CapitalPicker } from './CapitalPicker';
import { ActorPicker, PropertyPicker, SelectField, SubmitButton, type Option } from './Pickers';

/** Everything the form needs to reopen an expense as it was saved. */
export interface ExpenseDefaults {
  id: string;
  date: string;
  actorId: string;
  propertyId: string | null;
  amountCents: number;
  vendor: string;
  scheduleECategory: string;
  capitalClassification: string | null;
  contractorActorId: string | null;
  receiptKey: string | null;
  notes: string | null;
  /** The cost is divided across properties by a rule (§6) rather than owned by one. */
  isSplit: boolean;
  /** More than one payment row, or one that no longer mirrors the invoice. */
  hasOwnPayments: boolean;
}

/**
 * Expense entry, and the same form reopened to correct one.
 *
 * The two modes are one component because they are one set of rules: a vendor
 * is required either way, and a Schedule E line either way. Splitting them is
 * how the create and edit paths drift until only one of them validates.
 *
 * Two fields exist only when editing, both deliberately:
 *
 *   - REPAIR OR IMPROVEMENT. §5.3 is not asked at capture. The capture form is
 *     built for the fifteen-second case and the answer is frequently not known
 *     at the counter, so the entry is flagged honestly and answered later. Here
 *     is later.
 *   - The RECEIPT already on file, which has to round-trip or an edit that
 *     ignored it would detach it.
 */
export function ExpenseForm({
  today,
  actorId,
  properties,
  people,
  contractors,
  jobId = null,
  defaultPropertyId = null,
  defaults = null,
  returnTo,
}: {
  today: string;
  actorId: string;
  properties: Option[];
  people: Option[];
  contractors: Option[];
  /** Set only when opened from "+ Add related". Hidden - never a field. */
  jobId?: string | null;
  defaultPropertyId?: string | null;
  /** Present when correcting an existing expense rather than logging a new one. */
  defaults?: ExpenseDefaults | null;
  returnTo?: string;
}) {
  const [state, formAction] = useActionState(saveExpenseAction, EMPTY_FORM_STATE);
  const [category, setCategory] = useState(defaults?.scheduleECategory ?? '');

  const editing = defaults !== null;
  const lineAsks = category ? safeTriggersPrompt(category) : false;

  return (
    <form action={formAction} className="form">
      {/*
        The job rides along invisibly. THIS FORM HAS THE SAME FIELDS IT HAS
        ALWAYS HAD - a hidden value is not a field, and the word "job" appears
        nowhere on it. Adding a job picker here would tax the seventy-odd
        expenses a year that stand alone to serve the handful that do not.
      */}
      {jobId ? <input type="hidden" name="jobId" value={jobId} /> : null}
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      {state.message ? (
        <p role="alert" className="error-text mb-2">
          {state.message}
        </p>
      ) : null}

      {/* The amount is the one figure on this form, so it is set large and
          monospaced rather than being one box among nine. */}
      <label className="field">
        <span className="field-label">How much</span>
        <input
          className="input input-lg"
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="124.99"
          defaultValue={defaults ? centsToInput(defaults.amountCents) : ''}
          required
        />
        {state.fields?.amount ? <span className="error-text">{state.fields.amount}</span> : null}
      </label>

      {/* An unsplit expense keeps its single payment in step with the invoice
          automatically. Once the payments are real cash events of their own,
          they are left alone and a changed total can contradict them - so say
          so here rather than after the save is refused. */}
      {defaults?.hasOwnPayments ? (
        <p className="note note-warn">
          This invoice has payments recorded against it separately. Changing the
          total will not move them, and a total below what is already paid will
          be refused. Adjust the payments on the expense itself.
        </p>
      ) : null}

      <label className="field">
        <span className="field-label">Paid to</span>
        <input
          className="input"
          name="vendor"
          required
          maxLength={200}
          placeholder="Home Depot"
          autoComplete="off"
          defaultValue={defaults?.vendor ?? ''}
        />
      </label>

      <div className="field">
        <label className="field-label" htmlFor="scheduleECategory">
          Which Schedule E line
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
        {/* Only worth saying while the question cannot yet be answered. In edit
            mode the picker is right below, so the warning would point at it. */}
        {lineAsks && !editing ? (
          <p className="note note-warn">
            This is spend on physical work, so it needs a repair-or-improvement
            answer before year end. It will sit in the review list until then.
          </p>
        ) : null}
      </div>

      {editing ? (
        <CapitalPicker defaultValue={defaults.capitalClassification} lineAsks={lineAsks} />
      ) : null}

      {/* A split cost belongs to a rule, not to a property, and there is no UI
          for editing the rule. Rendering the picker here would offer to break
          the split with no way to put it back. */}
      {defaults?.isSplit ? (
        <div className="field">
          <span className="field-label">Which property</span>
          <p className="hint">
            Split across properties by an allocation rule, so no single property
            owns it. The split is not editable here.
          </p>
        </div>
      ) : (
        <PropertyPicker
          options={properties}
          label="Which property"
          allowNone={false}
          required
          defaultValue={defaults?.propertyId ?? defaultPropertyId}
        />
      )}

      {/* Two short answers on one line. Neither needs a full row, and stacking
          them pushed the save button below the fold on a phone. */}
      <div className="form-row">
        <label className="field">
          <span className="field-label">When</span>
          <input
            className="input"
            type="date"
            name="date"
            defaultValue={defaults?.date ?? today}
            required
          />
        </label>

        <SelectField
          name="contractorActorId"
          label="Contractor (optional)"
          options={contractors}
          defaultValue={defaults?.contractorActorId ?? null}
          placeholder="Not a contractor"
          hint="Keeps their yearly total running, so the W-9 warning can fire before October."
        />
      </div>

      <ReceiptUpload defaultKey={defaults?.receiptKey ?? null} />

      <label className="field">
        <span className="field-label">Notes (optional)</span>
        <textarea
          className="textarea"
          name="notes"
          maxLength={2000}
          defaultValue={defaults?.notes ?? ''}
        />
      </label>

      <ActorPicker options={people} defaultValue={defaults?.actorId ?? actorId} />

      <Submit editing={editing} />
    </form>
  );
}

function Submit({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <SubmitButton pending={pending}>{editing ? 'Save changes' : 'Save expense'}</SubmitButton>
  );
}

/** Cents back to something the amount field can show and parseAmountToCents can read. */
function centsToInput(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
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
