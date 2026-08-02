'use client';

import { useMemo, useState } from 'react';
import {
  deriveShEligible,
  getHourCategory,
  listHourCategories,
  type HourCategory,
} from '@rental/domain';

/**
 * The hour category picker (§5.1).
 *
 * Two design obligations beyond looking like a list:
 *
 * 1. Every option states its eligibility, because the user is choosing between
 *    "counts" and "does not count" whether or not the UI says so.
 * 2. The two confusable pairs point at each other. Confirming rent arrived and
 *    reading the manager's statement are one keystroke apart in the list and
 *    opposite in outcome, and the moment to catch that is at entry.
 */
export function CategoryPicker({
  name = 'category',
  defaultValue,
  onChange,
}: {
  name?: string;
  defaultValue?: string;
  onChange?: (categoryId: string) => void;
}) {
  const categories = useMemo(() => listHourCategories(), []);
  const [selected, setSelected] = useState<string>(defaultValue ?? '');

  const selectedCategory = selected ? safeGet(selected) : null;
  const contrast = selectedCategory?.contrastWith ? safeGet(selectedCategory.contrastWith) : null;

  function pick(id: string) {
    setSelected(id);
    onChange?.(id);
  }

  return (
    <div className="field">
      <span className="label">What were you doing?</span>
      <input type="hidden" name={name} value={selected} />

      <div className="grid gap-2">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className="cat-option"
            aria-pressed={selected === category.id}
            onClick={() => pick(category.id)}
          >
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-semibold">{category.label}</span>
                <EligibilityBadge eligible={category.shEligible} />
              </span>
              <span className="hint block">{category.helper}</span>
            </span>
          </button>
        ))}
      </div>

      {selectedCategory && contrast ? (
        <p className="hint mt-3 rounded-lg border border-[color:var(--color-flag-500)] bg-[color:var(--color-flag-50)] p-2.5 text-[color:var(--color-flag-700)]">
          Not this one? <strong>{contrast.label}</strong> — {contrast.helper} That one{' '}
          {contrast.shEligible ? 'counts' : 'does not count'} toward eligible hours.{' '}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => pick(contrast.id)}
          >
            Switch to it
          </button>
        </p>
      ) : null}

      {selectedCategory ? (
        <p className="hint mt-2">
          {deriveShEligible({ category: selectedCategory.id }).explanation}
        </p>
      ) : null}
    </div>
  );
}

export function EligibilityBadge({ eligible }: { eligible: boolean }) {
  return (
    <span className={eligible ? 'badge badge-eligible' : 'badge badge-not-eligible'}>
      {eligible ? 'Eligible' : 'Not eligible'}
    </span>
  );
}

function safeGet(id: string): HourCategory | null {
  try {
    return getHourCategory(id);
  } catch {
    return null;
  }
}
