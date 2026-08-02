/**
 * Hour categories and their safe-harbor eligibility (brief §5.1).
 *
 * `shEligible` is a property of the CATEGORY. It is derived, never entered by
 * the user, and never editable in the UI. If this table is wrong, every hours
 * number in the app is wrong, so it is the single source of truth for both
 * clients.
 */

export type HourCategoryId =
  | 'leasing'
  | 'advertising_screening'
  | 'rent_collection'
  | 'repairs_maintenance'
  | 'materials_purchase'
  | 'contractor_management'
  | 'market_survey_renewal'
  | 'turn_cleaning'
  | 'statement_review'
  | 'capital_improvement'
  | 'travel'
  | 'acquisition'
  | 'financing';

export interface HourCategory {
  id: HourCategoryId;
  label: string;
  /** One line shown under the label in the picker. Plain language, no jargon. */
  helper: string;
  /** Derived safe-harbor eligibility. Never user-editable. */
  shEligible: boolean;
  /**
   * The category this one is most often confused with (§5.1). The picker shows
   * a "not this one?" pointer so the wrong pick gets caught at entry, not in
   * April.
   */
  contrastWith?: HourCategoryId;
  /** Sort order in the picker: eligible and common work first. */
  order: number;
}

export const HOUR_CATEGORIES: readonly HourCategory[] = [
  {
    id: 'repairs_maintenance',
    label: 'Repairs & maintenance',
    helper: 'Fixing or maintaining something that already exists.',
    shEligible: true,
    order: 10,
  },
  {
    id: 'turn_cleaning',
    label: 'Turn cleaning / make-ready',
    helper: 'Getting a unit ready between tenants.',
    shEligible: true,
    order: 20,
  },
  {
    id: 'materials_purchase',
    label: 'Purchase of materials',
    helper: 'Time at the store buying supplies or parts for a property.',
    shEligible: true,
    order: 30,
  },
  {
    id: 'contractor_management',
    label: 'Contractor sourcing & supervision',
    helper: 'Finding, negotiating with, scheduling, or supervising a contractor.',
    shEligible: true,
    order: 40,
  },
  {
    id: 'leasing',
    label: 'Leasing & lease review',
    helper: 'Reviewing, negotiating, or signing a lease.',
    shEligible: true,
    order: 50,
  },
  {
    id: 'advertising_screening',
    label: 'Advertising & tenant screening',
    helper: 'Listing the unit, showings, applications, background checks.',
    shEligible: true,
    order: 60,
  },
  {
    id: 'rent_collection',
    label: 'Rent collection',
    helper: 'Confirming rent actually landed in the account.',
    shEligible: true,
    contrastWith: 'statement_review',
    order: 70,
  },
  {
    id: 'market_survey_renewal',
    label: 'Market survey — renewal pricing',
    helper: 'Checking comparable rents to set a renewal rate on a unit you own.',
    shEligible: true,
    contrastWith: 'acquisition',
    order: 80,
  },
  {
    id: 'statement_review',
    label: 'Statement & report review',
    helper: "Reading the manager's owner statement or a financial report.",
    shEligible: false,
    contrastWith: 'rent_collection',
    order: 90,
  },
  {
    id: 'capital_improvement',
    label: 'Capital improvement work',
    helper: 'Planning, managing, or building an improvement rather than a repair.',
    shEligible: false,
    order: 100,
  },
  {
    id: 'travel',
    label: 'Travel / driving time',
    helper: 'Time behind the wheel. Logged, but never counts as eligible.',
    shEligible: false,
    order: 110,
  },
  {
    id: 'acquisition',
    label: 'Acquisition search',
    helper: 'Looking at properties to buy, including market surveys for a purchase.',
    shEligible: false,
    contrastWith: 'market_survey_renewal',
    order: 120,
  },
  {
    id: 'financing',
    label: 'Financing & loan documentation',
    helper: 'Mortgages, refinancing, loan paperwork.',
    shEligible: false,
    order: 130,
  },
] as const;

const CATEGORY_BY_ID: ReadonlyMap<string, HourCategory> = new Map(
  HOUR_CATEGORIES.map((c) => [c.id, c]),
);

export class UnknownHourCategoryError extends Error {
  override readonly name = 'UnknownHourCategoryError';
  constructor(public readonly categoryId: string) {
    super(`Unknown hour category: "${categoryId}"`);
  }
}

/** Looks up a category, throwing rather than silently defaulting to ineligible. */
export function getHourCategory(id: string): HourCategory {
  const category = CATEGORY_BY_ID.get(id);
  if (!category) throw new UnknownHourCategoryError(id);
  return category;
}

export function isHourCategoryId(id: string): id is HourCategoryId {
  return CATEGORY_BY_ID.has(id);
}

/** Categories in picker order. */
export function listHourCategories(): readonly HourCategory[] {
  return [...HOUR_CATEGORIES].sort((a, b) => a.order - b.order);
}

export const HOUR_CATEGORY_IDS: readonly HourCategoryId[] = HOUR_CATEGORIES.map(
  (c) => c.id,
);

/**
 * The categories that a trip's drive time may use. Drive time is always
 * ineligible (§5.5), so it is pinned rather than chosen.
 */
export const DRIVE_TIME_CATEGORY: HourCategoryId = 'travel';
