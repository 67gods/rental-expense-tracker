'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { formatCents, getScheduleECategory, listScheduleECategories } from '@rental/domain';
import { saveExpenseAction } from '@/app/actions/capture';
import { EMPTY_FORM_STATE } from '@/app/actions/formState';
import {
  ReceiptUpload,
  type DuplicateMatch,
  type ExtractedReceipt,
  type ReceiptRead,
} from './ReceiptUpload';
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
  receiptSha256: string | null;
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
 *
 * The money fields are controlled rather than uncontrolled, which they were
 * until the receipt reader arrived: an uploaded receipt fills them, and a
 * defaultValue cannot be changed after the field has been rendered.
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

  const [amount, setAmount] = useState(defaults ? centsToInput(defaults.amountCents) : '');
  const [vendor, setVendor] = useState(defaults?.vendor ?? '');
  const [date, setDate] = useState(defaults?.date ?? today);
  const [notes, setNotes] = useState(defaults?.notes ?? '');
  const [category, setCategory] = useState(defaults?.scheduleECategory ?? '');
  const [propertyId, setPropertyId] = useState(defaults?.propertyId ?? defaultPropertyId ?? '');
  const [uploading, setUploading] = useState(false);

  const [extracted, setExtracted] = useState<ExtractedReceipt | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateMatch | null>(null);
  const [readNote, setReadNote] = useState<string | null>(null);

  const editing = defaults !== null;
  const lineAsks = category ? safeTriggersPrompt(category) : false;

  /**
   * Applies what the reader found.
   *
   * The figures are overwritten even when something is already typed. They are
   * facts printed on the document that just arrived, so the document wins, and
   * keeping a typed total while filling in the vendor and date around it
   * produces a form that is half from one source and half from another with
   * nothing saying which is which.
   *
   * NOTES ARE THE EXCEPTION, and only when they already say something. On the
   * capture form they never do. But this same form reopens an expense from
   * months ago, and a receipt attached to it then would otherwise replace a
   * sentence somebody wrote about the job with a summary of the line items.
   * The model's version of that field is a convenience; the owner's is a
   * record.
   */
  function handleRead(read: ReceiptRead) {
    setDuplicate(read.duplicate);

    if (read.extraction.status === 'extracted') {
      const found = read.extraction.extracted;
      setExtracted(found);
      setAmount(centsToInput(found.amountCents));
      setVendor(found.vendor);
      setDate(found.date);
      setCategory(found.scheduleECategory);
      if (found.notes && notes.trim() === '') setNotes(found.notes);

      const match = contractors.find(
        (c) => found.contractorName && c.label.toLowerCase() === found.contractorName.toLowerCase(),
      );
      setReadNote(
        found.contractorName && !match
          ? `Read from the receipt. It looks like an invoice from ${found.contractorName} - set the contractor below if they are on the list.`
          : 'Read from the receipt. Check the figures before saving.',
      );
      return;
    }

    setExtracted(null);
    setReadNote(readFailureNote(read));
  }

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
      {/*
        What the reader said, carried to the server so the save can tell an
        accepted guess from a typed correction. Not a field - see the action.
      */}
      {extracted ? (
        <input type="hidden" name="extraction" value={JSON.stringify(extracted)} />
      ) : null}

      {state.message ? (
        <p role="alert" className="error-text mb-2">
          {state.message}
        </p>
      ) : null}

      {duplicate ? (
        <p className="note note-warn" role="alert">
          {duplicate.kind === 'exact'
            ? 'This exact receipt is already attached to an expense: '
            : 'This looks like an expense already recorded: '}
          <Link className="linkbtn" href={`/entries/expense/${duplicate.id}`}>
            {duplicate.vendor}, {duplicate.date}, {formatCents(duplicate.amountCents)}
          </Link>
          . Nothing has been changed there. Saving this form adds a second entry.
        </p>
      ) : null}

      {readNote ? <p className="note">{readNote}</p> : null}

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
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        {state.fields?.amount ? <span className="error-text">{state.fields.amount}</span> : null}
        <Unsure level={extracted?.confidence.amount} what="total" />
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
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
        />
        <Unsure level={extracted?.confidence.vendor} what="name" />
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
        <>
          <PropertyPicker
            options={properties}
            label="Which property"
            noneLabel="Portfolio-wide / shared"
            defaultValue={defaults?.propertyId ?? defaultPropertyId}
            onChange={setPropertyId}
          />
          {/* Portfolio-wide has no property and no split rule - a real state
              (§6), not a blank field, but Schedule E cannot use it until one
              is set. It sits in the review list, the same as an unanswered
              capital question, same as lineAsks below. */}
          {propertyId === '' ? (
            <p className="note note-warn">
              No property set. This expense will not appear on Schedule E
              until you give it one, or split it.
            </p>
          ) : null}
        </>
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
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
          <Unsure level={extracted?.confidence.date} what="date" />
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

      <ReceiptUpload
        defaultKey={defaults?.receiptKey ?? null}
        defaultSha256={defaults?.receiptSha256 ?? null}
        propertyId={propertyId || null}
        expenseId={defaults?.id ?? null}
        onBusyChange={setUploading}
        onRead={handleRead}
      />

      <label className="field">
        <span className="field-label">Notes (optional)</span>
        <textarea
          className="textarea"
          name="notes"
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>

      <ActorPicker options={people} defaultValue={defaults?.actorId ?? actorId} />

      <Submit editing={editing} uploading={uploading} />
    </form>
  );
}

/**
 * Says so when the reader was not sure of a figure.
 *
 * Only for `low`. A marker on every merely-medium reading would sit under most
 * fields most of the time, which is the same as no marker at all.
 */
function Unsure({ level, what }: { level?: 'high' | 'medium' | 'low'; what: string }) {
  if (level !== 'low') return null;
  return <span className="hint">The {what} was hard to read. Worth checking against the receipt.</span>;
}

function readFailureNote(read: ReceiptRead): string | null {
  if (read.extraction.status === 'not_receipt') {
    return 'That does not look like a receipt, so nothing was filled in. It is still attached.';
  }
  if (read.extraction.status !== 'skipped') return null;

  switch (read.extraction.reason) {
    case 'heic':
      return 'Receipt attached. HEIC photos cannot be read automatically - fill the fields in below.';
    case 'duplicate':
      // The duplicate warning above already says everything worth saying.
      return null;
    case 'not_configured':
      return null;
    case 'unsupported':
    case 'unreadable':
      return 'Receipt attached, but it could not be read. Fill the fields in below.';
  }
}

function Submit({ editing, uploading }: { editing: boolean; uploading: boolean }) {
  const { pending } = useFormStatus();
  return (
    <SubmitButton
      pending={pending}
      blocked={uploading}
      blockedLabel="Waiting for the receipt…"
    >
      {editing ? 'Save changes' : 'Save expense'}
    </SubmitButton>
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
