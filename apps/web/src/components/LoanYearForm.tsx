'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { DOCUMENT_SOURCES, formatCentsPlain } from '@rental/domain';
import { saveLoanYearAction } from '@/app/actions/yearEnd';
import { EMPTY_FORM_STATE } from '@/app/actions/formState';
import { SubmitButton, type Option } from './Pickers';

export interface LoanYearDefaults {
  propertyId?: string;
  lenderName?: string;
  interestCents?: number | null;
  pointsCents?: number | null;
  mortgageInsuranceCents?: number | null;
  propertyTaxCents?: number | null;
  propertyTaxSource?: string | null;
  insurancePaidFromEscrowCents?: number | null;
  insuranceSource?: string | null;
  escrowBalanceCents?: number | null;
  originationDate?: string | null;
  originalPrincipalCents?: number | null;
  interestRatePct?: string | null;
  documentNote?: string | null;
}

/**
 * One Form 1098, transcribed.
 *
 * Every money field has a companion "where did this come from", because box 10
 * was blank on all four of the household's 2025 forms and the tax and insurance
 * figures were in a supplemental escrow block below the numbered boxes. Without
 * the source recorded, next January the same hunt starts from nothing.
 *
 * These are the largest deductions on the return and none of them passes
 * through the expense ledger, which is why they need a form of their own.
 */
export function LoanYearForm({
  taxYear,
  properties,
  defaults = {},
  isEdit = false,
}: {
  taxYear: number;
  properties: Option[];
  defaults?: LoanYearDefaults;
  isEdit?: boolean;
}) {
  const [state, formAction] = useActionState(saveLoanYearAction, EMPTY_FORM_STATE);

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

      <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
        <label className="field">
          <span className="field-label">Property</span>
          <select
            className="select"
            name="propertyId"
            required
            defaultValue={defaults.propertyId ?? ''}
            disabled={isEdit}
          >
            <option value="">Choose…</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.label}
              </option>
            ))}
          </select>
          {/* A disabled select posts nothing, so the value still has to travel. */}
          {isEdit ? <input type="hidden" name="propertyId" value={defaults.propertyId} /> : null}
        </label>

        <label className="field">
          <span className="field-label">Lender</span>
          <input
            className="input"
            name="lenderName"
            required
            maxLength={200}
            defaultValue={defaults.lenderName}
            readOnly={isEdit}
            placeholder="As it appears on the form"
          />
          <span className="hint">Name only. No account numbers.</span>
        </label>
      </div>

      <MoneyWithSource
        label="Mortgage interest"
        name="interest"
        boxNote="Box 1"
        cents={defaults.interestCents}
        error={state.fields?.interest}
      />

      <MoneyWithSource
        label="Property tax"
        name="propertyTax"
        boxNote="Box 10 — often blank"
        cents={defaults.propertyTaxCents}
        sourceName="propertyTaxSource"
        sourceValue={defaults.propertyTaxSource}
        error={state.fields?.propertyTax}
      />

      <MoneyWithSource
        label="Insurance paid from escrow"
        name="insurancePaidFromEscrow"
        boxNote="Not a numbered box"
        cents={defaults.insurancePaidFromEscrowCents}
        sourceName="insuranceSource"
        sourceValue={defaults.insuranceSource}
        error={state.fields?.insurancePaidFromEscrow}
      />

      <details className="my-1">
        <summary className="cursor-pointer text-sm font-semibold">
          Points, PMI, escrow balance, loan facts
        </summary>

        <div className="mt-3 grid gap-1">
          <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
            <Money
              label="Points"
              name="points"
              hint="Box 6"
              cents={defaults.pointsCents}
              error={state.fields?.points}
            />
            <Money
              label="Mortgage insurance"
              name="mortgageInsurance"
              hint="Box 5"
              cents={defaults.mortgageInsuranceCents}
              error={state.fields?.mortgageInsurance}
            />
          </div>

          <Money
            label="Escrow balance at year end"
            name="escrowBalance"
            cents={defaults.escrowBalanceCents}
            error={state.fields?.escrowBalance}
          />

          <div className="grid gap-1 sm:grid-cols-3 sm:gap-3">
            <label className="field">
              <span className="field-label">Loan originated</span>
              <input
                className="input"
                type="date"
                name="originationDate"
                defaultValue={defaults.originationDate ?? ''}
              />
            </label>
            <Money
              label="Original principal"
              name="originalPrincipal"
              cents={defaults.originalPrincipalCents}
              error={state.fields?.originalPrincipal}
            />
            <label className="field">
              <span className="field-label">Rate %</span>
              <input
                className="input num"
                name="interestRatePct"
                inputMode="decimal"
                defaultValue={defaults.interestRatePct ?? ''}
                placeholder="6.875"
              />
            </label>
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
          placeholder="Box 10 blank. Taxes are in the supplemental block below the boxes."
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

/** An amount plus the document it was read off. */
function MoneyWithSource({
  label,
  name,
  boxNote,
  cents,
  sourceName,
  sourceValue,
  error,
}: {
  label: string;
  name: string;
  boxNote?: string;
  cents?: number | null;
  sourceName?: string;
  sourceValue?: string | null;
  error?: string;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
      <Money label={label} name={name} hint={boxNote} cents={cents} error={error} />
      {sourceName ? (
        <label className="field">
          <span className="field-label">Read from</span>
          <select className="select" name={sourceName} defaultValue={sourceValue ?? ''}>
            <option value="">Not recorded</option>
            {DOCUMENT_SOURCES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
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
    <SubmitButton pending={pending}>{isEdit ? 'Save changes' : 'Add this 1098'}</SubmitButton>
  );
}
