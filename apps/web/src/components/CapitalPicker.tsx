'use client';

import { useState } from 'react';

/** Mirrors the capital_classification enum, plus "not answered" as an option. */
export type CapitalChoice = 'repair' | 'improvement' | 'needs_review' | '';

const CHOICES: { id: CapitalChoice; title: string; helper: string }[] = [
  {
    id: 'repair',
    title: 'Repair',
    helper:
      'Kept the property in the condition it was already in. Deducted in full in the year it was paid.',
  },
  {
    id: 'improvement',
    title: 'Capital improvement',
    helper:
      'Bettered, restored, or adapted the property. Added to basis and depreciated rather than deducted, so it leaves the Schedule E deduction lines.',
  },
  {
    id: 'needs_review',
    title: 'Ask the CPA',
    helper: 'A real question rather than an oversight. Stays on the review list on purpose.',
  },
  {
    id: '',
    title: 'Not answered',
    helper:
      'Where an expense starts. It sits on the review list until answered, if its Schedule E line is one that asks.',
  },
];

/**
 * Repair or improvement (§5.3).
 *
 * This is the answer the Review badge is waiting for and the switch the Capital
 * badge reads, so it is the one field on the expense form that changes where
 * money lands: an improvement is basis, not a deduction, and reports.ts routes
 * it away from the Schedule E lines on the strength of this value alone.
 *
 * "Not answered" is offered rather than being only an absence. An improvement
 * set by mistake has to be retractable, and forcing a repair/improvement answer
 * to undo one would be trading a wrong answer for a different wrong answer.
 */
export function CapitalPicker({
  name = 'capitalClassification',
  defaultValue = null,
  /** True when this Schedule E line is one that asks the question unprompted. */
  lineAsks = false,
}: {
  name?: string;
  defaultValue?: string | null;
  lineAsks?: boolean;
}) {
  const [selected, setSelected] = useState<CapitalChoice>(asChoice(defaultValue));

  return (
    <div className="field">
      <span className="field-label">Repair or improvement</span>
      <input type="hidden" name={name} value={selected} />

      <div className="grid gap-2">
        {CHOICES.map((choice) => (
          <button
            key={choice.id || 'unanswered'}
            type="button"
            className="choice"
            aria-pressed={selected === choice.id}
            onClick={() => setSelected(choice.id)}
          >
            <span className="choice-mark" aria-hidden="true" />
            <span className="choice-body">
              <span className="choice-title">{choice.title}</span>
              <span className="hint">{choice.helper}</span>
            </span>
          </button>
        ))}
      </div>

      {selected === '' && lineAsks ? (
        <p className="note note-warn">
          This Schedule E line covers physical work, so leaving this unanswered
          keeps the expense on the review list.
        </p>
      ) : null}
    </div>
  );
}

function asChoice(value: string | null): CapitalChoice {
  return value === 'repair' || value === 'improvement' || value === 'needs_review' ? value : '';
}
