'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { DONATION_KINDS, formatCentsPlain, type DonationKind } from '@rental/domain';
import { saveDonationAction } from '@/app/actions/donations';
import { EMPTY_FORM_STATE } from '@/app/actions/formState';
import { ReceiptUpload } from './ReceiptUpload';
import { SubmitButton, type Option } from './Pickers';

export interface DonationDefaults {
  id?: string;
  charityId?: string;
  date?: string;
  amountCents?: number | null;
  kind?: DonationKind;
  nonCashDescription?: string | null;
  acknowledgmentOnFile?: boolean;
  receiptKey?: string | null;
  receiptSha256?: string | null;
  note?: string | null;
}

/**
 * One gift.
 *
 * Four fields carry the record - when, to whom, how much, and money or goods -
 * and a fifth carries the thing that decides whether any of it is deductible.
 * A gift of $250 or more is disallowed outright without a written acknowledgment
 * from the charity, so whether that letter exists is asked here rather than
 * inferred from whether somebody happened to photograph it. The two are not the
 * same: a letter can sit in a drawer unphotographed, and an attached image can be
 * a bank slip.
 *
 * The description only appears for goods, and only then is it required. "$600"
 * is not a record of a donation of furniture - Form 8283 asks what was given, and
 * next January nobody remembers.
 */
export function DonationForm({
  charities,
  defaults = {},
  today,
}: {
  charities: Option[];
  defaults?: DonationDefaults;
  /** Today in the household timezone, so a fresh form opens on the right day. */
  today: string;
}) {
  const [state, formAction] = useActionState(saveDonationAction, EMPTY_FORM_STATE);
  const [kind, setKind] = useState<DonationKind>(defaults.kind ?? 'cash');
  const [uploading, setUploading] = useState(false);
  const isEdit = Boolean(defaults.id);

  return (
    <form action={formAction} className="form">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <input type="hidden" name="kind" value={kind} />

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

      <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
        <label className="field">
          <span className="field-label">Charity</span>
          <select
            className="select"
            name="charityId"
            required
            defaultValue={defaults.charityId ?? ''}
          >
            <option value="">Choose…</option>
            {charities.map((charity) => (
              <option key={charity.id} value={charity.id}>
                {charity.label}
              </option>
            ))}
          </select>
          {state.fields?.charityId ? (
            <span className="error-text">{state.fields.charityId}</span>
          ) : null}
        </label>

        <label className="field">
          <span className="field-label">Date</span>
          <input
            className="input"
            type="date"
            name="date"
            required
            defaultValue={defaults.date ?? today}
          />
          {state.fields?.date ? (
            <span className="error-text">{state.fields.date}</span>
          ) : (
            <span className="hint">The day it was given, not the day the letter arrived.</span>
          )}
        </label>
      </div>

      <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
        <label className="field">
          <span className="field-label">Amount</span>
          <input
            className="input num"
            name="amount"
            inputMode="decimal"
            required
            defaultValue={
              defaults.amountCents == null ? '' : formatCentsPlain(defaults.amountCents)
            }
            autoComplete="off"
          />
          {state.fields?.amount ? (
            <span className="error-text">{state.fields.amount}</span>
          ) : (
            <span className="hint">
              {kind === 'non_cash' ? 'Fair market value of the goods.' : 'What was paid.'}
            </span>
          )}
        </label>

        <div className="field">
          <span className="field-label">Money or goods?</span>
          <div className="seg mb-2">
            {DONATION_KINDS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={kind === option.id}
                onClick={() => setKind(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className="hint">
            {DONATION_KINDS.find((option) => option.id === kind)?.helper}
          </span>
        </div>
      </div>

      {kind === 'non_cash' ? (
        <label className="field">
          <span className="field-label">What was given</span>
          <input
            className="input"
            name="nonCashDescription"
            required
            maxLength={500}
            defaultValue={defaults.nonCashDescription ?? ''}
            placeholder="12 boxes of books"
          />
          {state.fields?.nonCashDescription ? (
            <span className="error-text">{state.fields.nonCashDescription}</span>
          ) : (
            <span className="hint">
              Enough that somebody could agree with the valuation. Form 8283 asks this.
            </span>
          )}
        </label>
      ) : null}

      {/*
        The one field on this form that is about paperwork rather than about the
        gift, and the one that decides whether the deduction survives. It is a
        plain checkbox and it defaults to unticked, because the whole point of
        the donations screen is showing which letters are still missing - and a
        box that starts ticked would report every gift as covered.
      */}
      <label className="row cursor-pointer">
        <span>
          <span className="rowtitle">The charity&rsquo;s written acknowledgment is in hand</span>
          <span className="hint">
            Required for anything from $250 up, and it has to exist by the filing date. A bank
            statement is not one.
          </span>
        </span>
        <input
          type="checkbox"
          name="acknowledgmentOnFile"
          className="h-6 w-6 shrink-0"
          defaultChecked={defaults.acknowledgmentOnFile ?? false}
        />
      </label>

      <div className="field">
        <span className="field-label">Letter or receipt (optional)</span>
        <ReceiptUpload
          defaultKey={defaults.receiptKey ?? null}
          defaultSha256={defaults.receiptSha256 ?? null}
          /*
           * Never read by the model. The reader is built for receipts - vendor,
           * Schedule E category, contractor - and there is nothing on an
           * acknowledgment letter it is looking for. The upload and the hash
           * still happen; only the reading is skipped.
           */
          read={false}
          scope="donation"
          onBusyChange={setUploading}
        />
      </div>

      <label className="field">
        <span className="field-label">Note</span>
        <textarea
          className="input"
          name="note"
          rows={2}
          defaultValue={defaults.note ?? ''}
          placeholder="Pledge paid in two instalments. Letter emailed 3 January."
        />
      </label>

      <Submit isEdit={isEdit} uploading={uploading} />
    </form>
  );
}

function Submit({ isEdit, uploading }: { isEdit: boolean; uploading: boolean }) {
  const { pending } = useFormStatus();
  return (
    // Blocked while the file is in flight: the key only exists once S3 has the
    // bytes, so saving early stores a gift with no letter attached and leaves the
    // object orphaned in the bucket, neither of which looks like a failure.
    <SubmitButton pending={pending} blocked={uploading} blockedLabel="Waiting for the file…">
      {isEdit ? 'Save changes' : 'Record this gift'}
    </SubmitButton>
  );
}
