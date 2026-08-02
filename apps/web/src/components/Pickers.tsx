'use client';

import { useState } from 'react';

export interface Option {
  id: string;
  label: string;
  hint?: string;
}

/**
 * Property selection as chips rather than a dropdown.
 *
 * Five properties fit on one screen, so a native select would add two taps and
 * a scroll wheel for no gain. Chips also make "portfolio-wide" a visible
 * option instead of something hidden at the top of a list.
 */
export function PropertyPicker({
  name = 'propertyId',
  options,
  defaultValue,
  allowNone = true,
  noneLabel = 'Portfolio-wide',
  label = 'Which property?',
  required = false,
}: {
  name?: string;
  options: Option[];
  defaultValue?: string | null;
  allowNone?: boolean;
  noneLabel?: string;
  label?: string;
  required?: boolean;
}) {
  const [selected, setSelected] = useState<string>(defaultValue ?? '');

  return (
    <div className="field">
      <span className="label">
        {label}
        {required ? '' : ' (optional)'}
      </span>
      <input type="hidden" name={name} value={selected} />
      <div className="chip-row">
        {allowNone ? (
          <button
            type="button"
            className="chip"
            aria-pressed={selected === ''}
            onClick={() => setSelected('')}
          >
            {noneLabel}
          </button>
        ) : null}
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="chip"
            aria-pressed={selected === option.id}
            onClick={() => setSelected(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {options.length === 0 ? (
        <p className="hint mt-2">
          No properties yet. Add them under Places before logging against one.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Who did the work (§4).
 *
 * Defaults to whoever is signed in, but stays visible rather than implicit,
 * because the two spouses' hours cannot be pooled and a wrong attribution is
 * unrecoverable after the fact.
 */
export function ActorPicker({
  name = 'actorId',
  options,
  defaultValue,
}: {
  name?: string;
  options: Option[];
  defaultValue: string;
}) {
  const [selected, setSelected] = useState(defaultValue);

  if (options.length <= 1) {
    return <input type="hidden" name={name} value={selected} />;
  }

  return (
    <div className="field">
      <span className="label">Who did this?</span>
      <input type="hidden" name={name} value={selected} />
      <div className="chip-row">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="chip"
            aria-pressed={selected === option.id}
            onClick={() => setSelected(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="hint mt-2">
        Hours are counted per person and cannot be combined, so this has to be right.
      </p>
    </div>
  );
}

/** A plain select for lists too long to render as chips. */
export function SelectField({
  name,
  label,
  options,
  defaultValue,
  hint,
  required,
  placeholder = 'Choose…',
}: {
  name: string;
  label: string;
  options: Option[];
  defaultValue?: string | null;
  hint?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <select className="select" name={name} defaultValue={defaultValue ?? ''} required={required}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

/** Submit button that disables itself while the action is in flight. */
export function SubmitButton({
  children,
  pending,
}: {
  children: React.ReactNode;
  pending: boolean;
}) {
  return (
    <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
      {pending ? 'Saving…' : children}
    </button>
  );
}
