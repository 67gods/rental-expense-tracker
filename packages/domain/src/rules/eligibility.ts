/**
 * Safe-harbor eligibility derivation (brief §5.1 and §5.2).
 *
 * This is the single place eligibility is decided. Both clients call it; the
 * server calls it before writing; nothing else may set `sh_eligible`.
 *
 * WHY IT TAKES A TAX YEAR
 *
 * Eligibility is a rule, not a fact, and a rule is only true for a year. What a
 * safe harbor counts as qualifying work can be amended, and a value derived
 * under one year's reading must never be silently reused under another's. The
 * year is threaded now, so the day a category's treatment changes it is a data
 * edit here rather than a hunt through every call site.
 *
 * The result is also stamped with `RULES_VERSION`. Callers that cache it - the
 * `sh_eligible` column exists precisely so lists do not recompute per row - can
 * then tell a stale cache from a current one instead of trusting it.
 *
 * Deliberately does NOT call `thresholdsFor()`: a category's treatment is not a
 * threshold, and blocking someone from logging their hours because nobody has
 * filled in next year's figures yet would be a usability failure. Year coverage
 * is enforced by a test, not by refusing the entry.
 */

import {
  getHourCategory,
  type HourCategoryId,
} from '../constants/hourCategories';
import { RULES_VERSION } from '../constants/thresholds';
import { assertTaxYear } from '../dates';
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
  /** The rule set this answer was derived under. Stamped onto cached copies. */
  rulesVersion: string;
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
export function deriveShEligible(
  input: EligibilityInput,
  taxYear: number,
): EligibilityResult {
  // Rejects 0, 12.5, and NaN. The year has to be a real one for the answer to
  // mean anything, even though today every year reads the same table.
  assertTaxYear(taxYear);

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
      rulesVersion: RULES_VERSION,
    };
  }

  if (!category.shEligible) {
    return {
      shEligible: false,
      reason: 'category_not_eligible',
      isProvisional: false,
      explanation: `Not counted as eligible: "${category.label}" is logged but does not qualify.`,
      rulesVersion: RULES_VERSION,
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
    rulesVersion: RULES_VERSION,
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
  taxYear: number,
): {
  id: string;
  shEligible: boolean;
  isProvisional: boolean;
  reason: EligibilityReason;
  rulesVersion: string;
}[] {
  const changed: {
    id: string;
    shEligible: boolean;
    isProvisional: boolean;
    reason: EligibilityReason;
    rulesVersion: string;
  }[] = [];

  for (const entry of entries) {
    const next = deriveShEligible(
      {
        category: entry.category,
        linkedCapitalClassification: newClassification,
      },
      taxYear,
    );
    if (
      next.shEligible !== entry.shEligible ||
      next.isProvisional !== entry.isProvisional
    ) {
      changed.push({
        id: entry.id,
        shEligible: next.shEligible,
        isProvisional: next.isProvisional,
        reason: next.reason,
        rulesVersion: next.rulesVersion,
      });
    }
  }

  return changed;
}
