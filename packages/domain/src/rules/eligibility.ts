/**
 * Safe-harbor eligibility derivation (brief §5.1 and §5.2).
 *
 * This is the single place eligibility is decided. Both clients call it; the
 * server calls it before writing; nothing else may set `sh_eligible`.
 */

import {
  getHourCategory,
  type HourCategoryId,
} from '../constants/hourCategories';
import type { CapitalClassification } from '../types';

export type EligibilityReason =
  /** The category is eligible and nothing overrode it. */
  | 'category_eligible'
  /** The category itself is not eligible work. */
  | 'category_not_eligible'
  /** Eligible category, but the linked work is a capital improvement (§5.2). */
  | 'linked_capital_improvement';

export interface EligibilityInput {
  category: HourCategoryId | string;
  /**
   * Classification of the physical work this time is linked to, if any.
   * `null` means the time is not tied to classified work at all - which is the
   * normal case for leasing, rent verification, and market surveys.
   */
  linkedCapitalClassification?: CapitalClassification | null;
}

export interface EligibilityResult {
  shEligible: boolean;
  reason: EligibilityReason;
  /**
   * True when this entry's eligibility depends on work that has not been
   * classified yet. The entry still counts, but the dashboard surfaces the
   * count so it can be resolved rather than quietly relied on (§1: flag, do
   * not auto-resolve).
   */
  isProvisional: boolean;
  /** Plain-language sentence for the UI. Contains no tax advice. */
  explanation: string;
}

/**
 * Derives `sh_eligible` from the category, then applies the capital-improvement
 * cross-rule.
 *
 * §5.2: when time is linked to work classified as a capital improvement,
 * eligibility flips to false no matter how eligible the category looks on its
 * own. Sourcing a contractor for a roof replacement is excluded; sourcing one
 * for a drywall patch is not. Same category, different answer.
 */
export function deriveShEligible(input: EligibilityInput): EligibilityResult {
  // Throws on an unknown category rather than defaulting. A typo must not
  // silently produce a number that looks like a real hours total.
  const category = getHourCategory(input.category);
  const linked = input.linkedCapitalClassification ?? null;

  if (linked === 'improvement') {
    return {
      shEligible: false,
      reason: 'linked_capital_improvement',
      isProvisional: false,
      explanation:
        'Not counted as eligible: this time is linked to work classified as a capital improvement.',
    };
  }

  if (!category.shEligible) {
    return {
      shEligible: false,
      reason: 'category_not_eligible',
      isProvisional: false,
      explanation: `Not counted as eligible: "${category.label}" is logged but does not qualify.`,
    };
  }

  // Eligible category with linked work that is still unclassified. Counted for
  // now, flagged so it gets resolved before year end.
  const isProvisional = linked === 'needs_review';

  return {
    shEligible: true,
    reason: 'category_eligible',
    isProvisional,
    explanation: isProvisional
      ? `Counted as eligible for now: "${category.label}". The linked work still needs a repair-or-improvement answer, which could change this.`
      : `Counted as eligible: "${category.label}".`,
  };
}

/**
 * Recomputes eligibility for entries attached to work whose classification just
 * changed. Returns only the entries whose stored values are now stale, so the
 * caller writes the minimum number of rows.
 */
export function recomputeEligibilityForClassificationChange<
  T extends { id: string; category: string; shEligible: boolean; isProvisional: boolean },
>(
  entries: readonly T[],
  newClassification: CapitalClassification | null,
): { id: string; shEligible: boolean; isProvisional: boolean; reason: EligibilityReason }[] {
  const changed: {
    id: string;
    shEligible: boolean;
    isProvisional: boolean;
    reason: EligibilityReason;
  }[] = [];

  for (const entry of entries) {
    const next = deriveShEligible({
      category: entry.category,
      linkedCapitalClassification: newClassification,
    });
    if (
      next.shEligible !== entry.shEligible ||
      next.isProvisional !== entry.isProvisional
    ) {
      changed.push({
        id: entry.id,
        shEligible: next.shEligible,
        isProvisional: next.isProvisional,
        reason: next.reason,
      });
    }
  }

  return changed;
}
