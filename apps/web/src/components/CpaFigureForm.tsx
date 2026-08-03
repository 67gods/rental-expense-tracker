'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { CPA_FIGURE_KINDS, listScheduleECategories } from '@rental/domain';
import { saveCpaFigureAction } from '@/app/actions/yearEnd';
import { EMPTY_FORM_STATE } from '@/app/actions/formState';
import { SubmitButton, type Option } from './Pickers';

/**
 * A figure the CPA sent back.
 *
 * Row-shaped rather than a depreciation table, because what comes back is not a
 * fixed shape and its shape is not ours to fix. Today it is one depreciation
 * figure per property; it could be a component schedule across 5, 15 and 27.5
 * year buckets after a cost segregation, or a suspended loss carried forward,
 * or a figure for a line that does not exist yet. All of those fit here without
 * a migration.
 *
 * Nothing on this form is computed. Every field is transcribed from a document,
 * and saying which document is not optional.
 */
export function CpaFigureForm({
  taxYear,
  properties,
}: {
  taxYear: number;
  properties: Option[];
}) {
  const [state, formAction] = useActionState(saveCpaFigureAction, EMPTY_FORM_STATE);
  const [kind, setKind] = useState<string>('schedule_e_line');
  const categories = listScheduleECategories();

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
        <span className="field-label">What kind of figure</span>
        <select
          className="select"
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          {CPA_FIGURE_KINDS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="hint">
          {CPA_FIGURE_KINDS.find((k) => k.id === kind)?.helper}
        </span>
      </label>

      {kind === 'schedule_e_line' ? (
        <label className="field">
          <span className="field-label">Which line</span>
          <select className="select" name="categoryId" defaultValue="depreciation" required>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.line} — {category.label}
              </option>
            ))}
          </select>
          {state.fields?.categoryId ? (
            <span className="error-text">{state.fields.categoryId}</span>
          ) : null}
        </label>
      ) : null}

      <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
        <label className="field">
          <span className="field-label">Property</span>
          <select className="select" name="propertyId" defaultValue="">
            <option value="">Whole portfolio</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Amount</span>
          <input
            className="input num"
            name="amount"
            inputMode="decimal"
            required
            placeholder="10552.00"
            autoComplete="off"
          />
          {state.fields?.amount ? (
            <span className="error-text">{state.fields.amount}</span>
          ) : null}
          <span className="hint">A carryforward or an adjustment may be negative.</span>
        </label>
      </div>

      <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
        <label className="field">
          <span className="field-label">Label</span>
          <input
            className="input"
            name="label"
            required
            maxLength={200}
            placeholder="27.5-year building"
          />
          {state.fields?.label ? <span className="error-text">{state.fields.label}</span> : null}
          <span className="hint">
            How the CPA named it. This and the year are what make the figure findable next
            January.
          </span>
        </label>

        <label className="field">
          <span className="field-label">Recovery period</span>
          <input
            className="input num"
            name="recoveryYears"
            inputMode="decimal"
            placeholder="27.5"
          />
          <span className="hint">Only if it is a depreciation bucket. Otherwise blank.</span>
        </label>
      </div>

      <label className="field">
        <span className="field-label">Where this came from</span>
        <input
          className="input"
          name="sourceNote"
          required
          maxLength={500}
          placeholder="2025 Form 4562, received 12 Apr 2026"
        />
        {state.fields?.sourceNote ? (
          <span className="error-text">{state.fields.sourceNote}</span>
        ) : null}
        <span className="hint">
          Required, and it is the field that matters most. A figure nobody can trace back to a
          document cannot be checked next year — and an untraceable number in a tax file is
          worse than a missing one, because a missing one gets chased.
        </span>
      </label>

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return <SubmitButton pending={pending}>Save this figure</SubmitButton>;
}
