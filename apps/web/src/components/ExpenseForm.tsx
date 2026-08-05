'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { addDays, formatCents, getScheduleECategory, listScheduleECategories } from '@rental/domain';
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
 * THE SHAPE OF THE PAGE FOLLOWS THE SHAPE OF THE JOB. Two answers carry this
 * form - which property, and the receipt - and everything else is either
 * printed on the receipt or optional. So the property sits across the top as
 * the first thing on the page, the receipt takes a column of its own, and the
 * figures sit beside it where they can be checked against the document without
 * opening anything.
 *
 * On a phone that column layout stacks into the order the job actually happens
 * in: pick the property, photograph the receipt, check what it read. The
 * figures stay folded away until there is something to check or the owner says
 * there is no receipt to wait for - see `revealed`. It is one form either way,
 * one set of fields, and the difference is entirely in the stylesheet.
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
  recentVendors = [],
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
  /** Names already used, newest first, offered as buttons under the vendor field. */
  recentVendors?: string[];
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
  const [hasReceipt, setHasReceipt] = useState(defaults?.receiptKey != null);

  const [extracted, setExtracted] = useState<ExtractedReceipt | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateMatch | null>(null);
  const [readNote, setReadNote] = useState<string | null>(null);

  const editing = defaults !== null;

  /**
   * Whether the figures are shown yet - ON A PHONE ONLY. The stylesheet ignores
   * this above the breakpoint, where both columns are always on screen.
   *
   * A receipt answers four of these fields, so presenting all of them before
   * one has been taken asks somebody to fill in a form and then watch it be
   * overwritten. Until then the screen is the two questions that matter, and
   * "no receipt" is a button rather than a state to be inferred from an
   * untouched file input.
   *
   * Corrections start revealed: an expense being edited has its figures
   * already, and they are the reason the page was opened.
   */
  const [revealed, setRevealed] = useState(editing);

  const lineAsks = category ? safeTriggersPrompt(category) : false;
  const vendorPicks = vendor.trim() === '' ? recentVendors.slice(0, 4) : [];
  const yesterday = addDays(today, -1);

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
   *
   * None of this runs when editing at all - the reader is not called there, so
   * `read.extraction` arrives as `not_requested` and only the duplicate check
   * has anything to say.
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
    <form action={formAction} className="form capture">
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

      {/* Anything the page has to say about the whole record goes across the
          top of it, above both columns, rather than beside one of them. */}
      {state.message || duplicate || readNote ? (
        <div className="capture-alerts">
          {state.message ? (
            <p role="alert" className="error-text">
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
        </div>
      ) : null}

      <div className="capture-props">
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
              layout="tiles"
              noneLabel="Portfolio-wide / shared"
              noneHint="Split by a rule later. Does not reach Schedule E on its own."
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
      </div>

      <div className="capture-receipt">
        <ReceiptUpload
          defaultKey={defaults?.receiptKey ?? null}
          defaultSha256={defaults?.receiptSha256 ?? null}
          propertyId={propertyId || null}
          expenseId={defaults?.id ?? null}
          /*
           * Corrections do not go through the model. The figures on an expense
           * that already exists were entered or checked by the owner, and a
           * document attached months later is evidence for them - so it is
           * filed, not read. See the `mode` note on the extract route.
           */
          read={!editing}
          onBusyChange={(busy) => {
            setUploading(busy);
            // A photograph having been taken is itself the answer to "is there
            // a receipt coming", so the fields open at that moment rather than
            // waiting for the upload to land.
            if (busy) setRevealed(true);
          }}
          onAttachedChange={setHasReceipt}
          onRead={handleRead}
        />

        {/*
          The manual path, said out loud.

          Phone only - on a desktop the fields are already beside this pane and
          a button to reveal what is visible would be nonsense. It is a plain
          reveal rather than a mode: nothing is disabled by taking it, and a
          receipt photographed afterwards still fills the fields in.
        */}
        {revealed ? null : (
          <button type="button" className="capture-manual" onClick={() => setRevealed(true)}>
            No receipt — type it instead
            <span className="hint">Utilities, cash work, anything paid without paper.</span>
          </button>
        )}
      </div>

      <div className={`capture-fields${revealed ? '' : ' capture-fields-folded'}`}>
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
          {/* Four names, and only while the field is empty. A shortcut that
              stays on screen after it has been used is just clutter, and the
              same four vendors account for most of a year. */}
          {vendorPicks.length > 0 ? (
            <span className="hint capture-recents">
              Recent:{' '}
              {vendorPicks.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="linkbtn"
                  onClick={() => setVendor(name)}
                >
                  {name}
                </button>
              ))}
            </span>
          ) : null}
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

        <label className="field">
          <span className="field-label">When</span>
          {/* The two dates that account for nearly every expense logged by
              hand, as buttons. The picker is still there for the rest, and the
              buttons are phone-only - a date field on a desktop is already one
              click and a keyboard. */}
          <span className="capture-dates">
            <button
              type="button"
              className="btn"
              aria-pressed={date === today}
              onClick={() => setDate(today)}
            >
              Today
            </button>
            <button
              type="button"
              className="btn"
              aria-pressed={date === yesterday}
              onClick={() => setDate(yesterday)}
            >
              Yesterday
            </button>
          </span>
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

        {/*
          Everything nobody fills in at a counter, behind one line.

          Open when it already has something in it, because a correction that
          hides the note somebody wrote is a correction that loses it. Closed
          fields still post - this folds the form, it does not shorten it.
        */}
        <details
          className="capture-more"
          open={Boolean(defaults?.contractorActorId || defaults?.notes)}
        >
          <summary>Contractor, notes, who paid — all optional</summary>
          <div className="capture-more-body">
            <SelectField
              name="contractorActorId"
              label="Contractor"
              options={contractors}
              defaultValue={defaults?.contractorActorId ?? null}
              placeholder="Not a contractor"
              hint="Keeps their yearly total running, so the W-9 warning can fire before October."
            />

            <label className="field">
              <span className="field-label">Notes</span>
              <textarea
                className="textarea"
                name="notes"
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>

            <ActorPicker options={people} defaultValue={defaults?.actorId ?? actorId} />
          </div>
        </details>

        <div className="capture-save">
          <span className="muted">
            {hasReceipt
              ? 'Receipt stored with this expense.'
              : 'No receipt on this one — that is fine, and it is recorded as such.'}
          </span>
          <Submit editing={editing} uploading={uploading} />
        </div>
      </div>
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
    case 'not_requested':
      // Editing, or the receipt was just removed. The pane says which, and
      // neither is a failure to report.
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
