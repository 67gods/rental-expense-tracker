import { describe, expect, it } from 'vitest';
import {
  deriveShEligible,
  recomputeEligibilityForClassificationChange,
} from '../src/rules/eligibility';
import {
  HOUR_CATEGORIES,
  UnknownHourCategoryError,
} from '../src/constants/hourCategories';
import { RULES_VERSION } from '../src/constants/thresholds';

/**
 * These suites cover category semantics, which do not vary by year today. The
 * year is passed once here rather than at ~20 call sites, so the assertions
 * below stay about eligibility rather than about plumbing.
 */
const TAX_YEAR = 2025;
const derive = (input: Parameters<typeof deriveShEligible>[0]) =>
  deriveShEligible(input, TAX_YEAR);
const recompute = (
  entries: Parameters<typeof recomputeEligibilityForClassificationChange>[0],
  classification: Parameters<typeof recomputeEligibilityForClassificationChange>[1],
) => recomputeEligibilityForClassificationChange(entries, classification, TAX_YEAR);

/**
 * Brief §5.1 - the category table is the authority on eligibility. This test
 * restates it independently so a typo in the source table fails here rather
 * than quietly changing every hours total in the app.
 */
const EXPECTED: Record<string, boolean> = {
  leasing: true,
  advertising_screening: true,
  rent_collection: true,
  repairs_maintenance: true,
  materials_purchase: true,
  contractor_management: true,
  market_survey_renewal: true,
  turn_cleaning: true,
  statement_review: false,
  capital_improvement: false,
  travel: false,
  acquisition: false,
  financing: false,
};

describe('§5.1 category eligibility', () => {
  it('covers every category in the brief and no others', () => {
    expect(HOUR_CATEGORIES.map((c) => c.id).sort()).toEqual(
      Object.keys(EXPECTED).sort(),
    );
  });

  for (const [category, expected] of Object.entries(EXPECTED)) {
    it(`derives sh_eligible=${expected} for "${category}"`, () => {
      const result = derive({ category });
      expect(result.shEligible).toBe(expected);
      expect(result.reason).toBe(
        expected ? 'category_eligible' : 'category_not_eligible',
      );
      expect(result.isProvisional).toBe(false);
    });
  }

  it('rejects an unknown category instead of defaulting to ineligible', () => {
    // A silent default would produce an hours total that looks real and is not.
    expect(() => derive({ category: 'gardening' })).toThrow(
      UnknownHourCategoryError,
    );
  });

  it('never lets the user override eligibility - it is not an input', () => {
    const input = { category: 'travel', shEligible: true } as never;
    expect(derive(input).shEligible).toBe(false);
  });
});

describe('§5.1 the two confusable pairs are distinct', () => {
  it('separates confirming rent arrived from reading the owner statement', () => {
    expect(derive({ category: 'rent_collection' }).shEligible).toBe(true);
    expect(derive({ category: 'statement_review' }).shEligible).toBe(false);
  });

  it('separates a renewal market survey from an acquisition market survey', () => {
    expect(derive({ category: 'market_survey_renewal' }).shEligible).toBe(true);
    expect(derive({ category: 'acquisition' }).shEligible).toBe(false);
  });

  it('points each confusable category at its counterpart for the picker', () => {
    const byId = new Map(HOUR_CATEGORIES.map((c) => [c.id, c]));
    expect(byId.get('rent_collection')?.contrastWith).toBe('statement_review');
    expect(byId.get('statement_review')?.contrastWith).toBe('rent_collection');
    expect(byId.get('market_survey_renewal')?.contrastWith).toBe('acquisition');
    expect(byId.get('acquisition')?.contrastWith).toBe('market_survey_renewal');
  });
});

/** Brief §5.2 - the cross-field rule the acceptance criteria call out by name. */
describe('§5.2 capital-improvement cross-rule', () => {
  it('excludes contractor sourcing when the work is a capital improvement', () => {
    // Sourcing a contractor for a roof replacement.
    const result = derive({
      category: 'contractor_management',
      linkedCapitalClassification: 'improvement',
    });
    expect(result.shEligible).toBe(false);
    expect(result.reason).toBe('linked_capital_improvement');
  });

  it('keeps contractor sourcing eligible when the work is a repair', () => {
    // Sourcing a contractor for a drywall patch. Same category, different answer.
    const result = derive({
      category: 'contractor_management',
      linkedCapitalClassification: 'repair',
    });
    expect(result.shEligible).toBe(true);
    expect(result.reason).toBe('category_eligible');
  });

  it('flips every otherwise-eligible category when linked to an improvement', () => {
    const eligibleCategories = HOUR_CATEGORIES.filter((c) => c.shEligible);
    expect(eligibleCategories.length).toBeGreaterThan(0);

    for (const category of eligibleCategories) {
      const result = derive({
        category: category.id,
        linkedCapitalClassification: 'improvement',
      });
      expect(result.shEligible, `${category.id} must flip to ineligible`).toBe(false);
      expect(result.reason).toBe('linked_capital_improvement');
    }
  });

  it('leaves already-ineligible categories ineligible, with the improvement as the reason', () => {
    const result = derive({
      category: 'travel',
      linkedCapitalClassification: 'improvement',
    });
    expect(result.shEligible).toBe(false);
    expect(result.reason).toBe('linked_capital_improvement');
  });

  it('treats a repair link as no different from no link at all', () => {
    for (const category of HOUR_CATEGORIES) {
      expect(
        derive({
          category: category.id,
          linkedCapitalClassification: 'repair',
        }).shEligible,
      ).toBe(derive({ category: category.id }).shEligible);
    }
  });

  it('marks eligible time as provisional while the linked work is unclassified', () => {
    const result = derive({
      category: 'repairs_maintenance',
      linkedCapitalClassification: 'needs_review',
    });
    // Counted, but flagged. Never auto-resolved (§1).
    expect(result.shEligible).toBe(true);
    expect(result.isProvisional).toBe(true);
  });

  it('does not mark ineligible time as provisional - nothing can change it', () => {
    const result = derive({
      category: 'financing',
      linkedCapitalClassification: 'needs_review',
    });
    expect(result.shEligible).toBe(false);
    expect(result.isProvisional).toBe(false);
  });

  it('gives every outcome a plain-language explanation with no tax advice', () => {
    const outcomes = [
      derive({ category: 'leasing' }),
      derive({ category: 'travel' }),
      derive({
        category: 'leasing',
        linkedCapitalClassification: 'improvement',
      }),
    ];
    for (const outcome of outcomes) {
      expect(outcome.explanation.length).toBeGreaterThan(10);
      expect(outcome.explanation).not.toMatch(/you should|we recommend|claim/i);
    }
  });
});

describe('§5.2 recomputation when a classification changes', () => {
  const entries = [
    { id: 'a', category: 'contractor_management', shEligible: true, isProvisional: false },
    { id: 'b', category: 'travel', shEligible: false, isProvisional: false },
    { id: 'c', category: 'materials_purchase', shEligible: true, isProvisional: false },
  ];

  it('returns only the entries whose stored eligibility is now stale', () => {
    const changed = recompute(entries, 'improvement');
    // Travel was already ineligible, so it does not need rewriting.
    expect(changed.map((c) => c.id)).toEqual(['a', 'c']);
    expect(changed.every((c) => c.shEligible === false)).toBe(true);
  });

  it('restores eligibility when an improvement is reclassified as a repair', () => {
    const afterImprovement = [
      { id: 'a', category: 'contractor_management', shEligible: false, isProvisional: false },
    ];
    const changed = recompute(afterImprovement, 'repair');
    expect(changed).toEqual([
      {
        id: 'a',
        shEligible: true,
        isProvisional: false,
        reason: 'category_eligible',
        // Carried through so the caller can stamp the row it is about to
        // rewrite, rather than writing a fresh value under an unknown ruleset.
        rulesVersion: RULES_VERSION,
      },
    ]);
  });

  it('returns nothing when the change affects no entry', () => {
    expect(recompute(entries, 'repair')).toEqual([]);
  });

  it('marks entries provisional when work moves back to needs_review', () => {
    const changed = recompute(entries, 'needs_review');
    expect(changed.map((c) => c.id)).toEqual(['a', 'c']);
    expect(changed.every((c) => c.shEligible && c.isProvisional)).toBe(true);
  });
});
