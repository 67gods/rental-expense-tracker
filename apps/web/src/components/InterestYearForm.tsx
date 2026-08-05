'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { formatCentsPlain, INTEREST_SOURCES } from '@rental/domain';
import { saveInterestYearAction } from '@/app/actions/yearEnd';
import { EMPTY_FORM_STATE } from '@/app/actions/formState';
import { SubmitButton, type Option } from './Pickers';

export interface InterestYearDefaults {
  bankAccountId?: string;
  interestCents?: number | null;
  earlyWithdrawalPenaltyCents?: number | null;
  savingsBondInterestCents?: number | null;
  federalTaxWithheldCents?: number | null;
  taxExemptInterestCents?: number | null;
  documentSource?: string | null;
  documentNote?: string | null;
}

/**
 * One 1099-INT, transcribed.
 *
 * Built like the 1098 form next door, and for the same reason: the figures are
 * copied off a document once a year, and where each one was read from matters
 * more than it looks. A bank paying under $10 issues no form at all, and the
 * interest is still income - so "no form issued" is one of the answers rather
 * than a blank that reads as an oversight.
 *
 * Box 1 is the only required figure. The rest are boxes that are usually empty,
 * folded away so the common case is one number and a save.
 */
export function InterestYearForm({
  taxYear,
  accounts,
  defaults = {},
  isEdit = false,
}: {
  taxYear: number;
  accounts: Option[];
  defaults?: InterestYearDefaults;
  isEdit?: boolean;
}) {
  const [state, formAction] = useActionState(saveInterestYearAction, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="form">
      <input type="hidden" name="taxYear" value={taxYear} />

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
        <span className="field-label">Account</span>
        <select
          className="select"
          name="bankAccountId"
          required
          defaultValue={defaults.bankAccountId ?? ''}
          disabled={isEdit}
        >
          <option value="">Choose…</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.label}
            </option>
          ))}
        </select>
        {/* A disabled select posts nothing, so the value still has to travel. */}
        {isEdit ? (
          <input type="hidden" name="bankAccountId" value={defaults.bankAccountId} />
        ) : null}
        {state.fields?.bankAccountId ? (
          <span className="error-text">{state.fields.bankAccountId}</span>
        ) : null}
      </label>

      <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
        <Money
          label="Interest"
          name="interest"
          hint="Box 1"
          cents={defaults.interestCents}
          error={state.fields?.interest}
        />
        <label className="field">
          <span className="field-label">Read from</span>
          <select
            className="select"
            name="documentSource"
            defaultValue={defaults.documentSource ?? ''}
          >
            <option value="">Not recorded</option>
            {INTEREST_SOURCES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <details className="my-1">
        <summary className="cursor-pointer text-sm font-semibold">
          Tax withheld, tax-exempt interest, the other boxes
        </summary>

        <div className="mt-3 grid gap-1">
          <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
            <Money
              label="Federal tax withheld"
              name="federalTaxWithheld"
              hint="Box 4 — a credit on the return, not income"
              cents={defaults.federalTaxWithheldCents}
              error={state.fields?.federalTaxWithheld}
            />
            <Money
              label="Tax-exempt interest"
              name="taxExemptInterest"
              hint="Box 8"
              cents={defaults.taxExemptInterestCents}
              error={state.fields?.taxExemptInterest}
            />
          </div>

          <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
            <Money
              label="Early withdrawal penalty"
              name="earlyWithdrawalPenalty"
              hint="Box 2"
              cents={defaults.earlyWithdrawalPenaltyCents}
              error={state.fields?.earlyWithdrawalPenalty}
            />
            <Money
              label="US savings bond interest"
              name="savingsBondInterest"
              hint="Box 3"
              cents={defaults.savingsBondInterestCents}
              error={state.fields?.savingsBondInterest}
            />
          </div>
        </div>
      </details>

      <label className="field">
        <span className="field-label">Note about the document</span>
        <textarea
          className="input"
          name="documentNote"
          rows={2}
          defaultValue={defaults.documentNote ?? ''}
          placeholder="No 1099-INT issued; figure from the December statement."
        />
        <span className="hint">
          Where you found what was not where you expected it. Next January this is the note
          that saves the hunt.
        </span>
      </label>

      <Submit isEdit={isEdit} />
    </form>
  );
}

function Money({
  label,
  name,
  hint,
  cents,
  error,
}: {
  label: string;
  name: string;
  hint?: string;
  cents?: number | null;
  error?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="input num"
        name={name}
        inputMode="decimal"
        defaultValue={cents == null ? '' : formatCentsPlain(cents)}
        autoComplete="off"
      />
      {error ? <span className="error-text">{error}</span> : null}
      {hint && !error ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

function Submit({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <SubmitButton pending={pending}>
      {isEdit ? 'Save changes' : 'Add this 1099-INT'}
    </SubmitButton>
  );
}
