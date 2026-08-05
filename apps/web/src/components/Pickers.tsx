'use client';

import { useState } from 'react';

export interface Option {
  id: string;
  label: string;
  /** A second line under the label. Only the tile layout shows it. */
  hint?: string;
}

/**
 * Property selection as chips rather than a dropdown.
 *
 * Five properties fit on one screen, so a native select would add two taps and
 * a scroll wheel for no gain. Chips also make "portfolio-wide" a visible
 * option instead of something hidden at the top of a list.
 *
 * TWO LAYOUTS, ONE CONTROL. `seg` is the joined strip every capture form has
 * always used and is right for a question that sits among ten others. `tiles`
 * is for the one form where the property is half of what is being asked - the
 * expense - and gets targets big enough to hit one-handed, room for a line
 * saying when each was last used, and a portfolio-wide option that reads as a
 * decision rather than as the item somebody forgot to remove from the strip.
 */
export function PropertyPicker({
  name = 'propertyId',
  options,
  defaultValue,
  allowNone = true,
  noneLabel = 'Portfolio-wide',
  label = 'Which property?',
  required = false,
  layout = 'seg',
  noneHint,
  onChange,
}: {
  name?: string;
  options: Option[];
  defaultValue?: string | null;
  allowNone?: boolean;
  noneLabel?: string;
  label?: string;
  required?: boolean;
  layout?: 'seg' | 'tiles';
  /** The sub-line on the portfolio-wide tile. Tiles only. */
  noneHint?: string;
  /** For a caller that needs to react to the live choice - most don't. */
  onChange?: (value: string) => void;
}) {
  const [selected, setSelected] = useState<string>(defaultValue ?? '');

  function choose(value: string) {
    setSelected(value);
    onChange?.(value);
  }

  const empty =
    options.length === 0 ? (
      <p className="hint mt-2">
        No properties yet. Add them under Places before logging against one.
      </p>
    ) : null;

  if (layout === 'tiles') {
    return (
      <fieldset className="field prop-field">
        <legend className="field-label">
          {label}
          {required ? '' : ' (optional)'}
        </legend>
        <input type="hidden" name={name} value={selected} />
        <div className="prop-tiles">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className="prop-tile"
              aria-pressed={selected === option.id}
              onClick={() => choose(option.id)}
            >
              <span className="prop-tile-mark" aria-hidden="true" />
              <span className="prop-tile-body">
                <b>{option.label}</b>
                {option.hint ? <small>{option.hint}</small> : null}
              </span>
            </button>
          ))}
          {allowNone ? (
            <button
              type="button"
              className="prop-tile prop-tile-wide"
              aria-pressed={selected === ''}
              onClick={() => choose('')}
            >
              <span className="prop-tile-mark" aria-hidden="true" />
              <span className="prop-tile-body">
                <b>{noneLabel}</b>
                {noneHint ? <small>{noneHint}</small> : null}
              </span>
            </button>
          ) : null}
        </div>
        {empty}
      </fieldset>
    );
  }

  return (
    <div className="field">
      <span className="field-label">
        {label}
        {required ? '' : ' (optional)'}
      </span>
      <input type="hidden" name={name} value={selected} />
      <div className="seg">
        {allowNone ? (
          <button
            type="button"
            aria-pressed={selected === ''}
            onClick={() => choose('')}
          >
            {noneLabel}
          </button>
        ) : null}
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected === option.id}
            onClick={() => choose(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {empty}
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
      <span className="field-label">Who did this?</span>
      <input type="hidden" name={name} value={selected} />
      <div className="seg">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
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
      <span className="field-label">{label}</span>
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
  blocked = false,
  blockedLabel,
}: {
  children: React.ReactNode;
  pending: boolean;
  /**
   * Something else on the form has not finished yet, so submitting now would
   * post it half-filled. Distinct from `pending`, which is the save itself.
   */
  blocked?: boolean;
  blockedLabel?: string;
}) {
  return (
    <button type="submit" className="btn btn-primary btn-block" disabled={pending || blocked}>
      {pending ? 'Saving…' : blocked ? (blockedLabel ?? children) : children}
    </button>
  );
}
