/**
 * Schedule E (Form 1040) expense lines.
 *
 * The line numbers are stable and are what the year-end export groups by, so
 * the CPA receives figures already lined up with the form (§10).
 */

export type ScheduleECategoryId =
  | 'advertising'
  | 'auto_travel'
  | 'cleaning_maintenance'
  | 'commissions'
  | 'insurance'
  | 'legal_professional'
  | 'management_fees'
  | 'mortgage_interest'
  | 'other_interest'
  | 'repairs'
  | 'supplies'
  | 'taxes'
  | 'utilities'
  | 'depreciation'
  | 'operating'
  | 'other';

export interface ScheduleECategory {
  id: ScheduleECategoryId;
  /** Schedule E line number, for the export header. */
  line: number;
  label: string;
  helper: string;
  /**
   * True when spend on this line is usually tied to physical work, which is
   * what triggers the repair-vs-improvement prompt (§5.3, built at M2).
   */
  triggersCapitalPrompt: boolean;
}

export const SCHEDULE_E_CATEGORIES: readonly ScheduleECategory[] = [
  {
    id: 'advertising',
    line: 5,
    label: 'Advertising',
    helper: 'Listing fees, signs, photos.',
    triggersCapitalPrompt: false,
  },
  {
    id: 'auto_travel',
    line: 6,
    label: 'Auto and travel',
    helper: 'Mileage and trip costs.',
    triggersCapitalPrompt: false,
  },
  {
    id: 'cleaning_maintenance',
    line: 7,
    label: 'Cleaning and maintenance',
    helper: 'Cleaners, landscaping, routine upkeep.',
    triggersCapitalPrompt: true,
  },
  {
    id: 'commissions',
    line: 8,
    label: 'Commissions',
    helper: 'Leasing commissions paid to an agent.',
    triggersCapitalPrompt: false,
  },
  {
    id: 'insurance',
    line: 9,
    label: 'Insurance',
    helper: 'Hazard, liability, umbrella policies.',
    triggersCapitalPrompt: false,
  },
  {
    id: 'legal_professional',
    line: 10,
    label: 'Legal and other professional fees',
    helper: 'Attorney, CPA, eviction filings.',
    triggersCapitalPrompt: false,
  },
  {
    id: 'management_fees',
    line: 11,
    label: 'Management fees',
    helper: 'What the property manager keeps.',
    triggersCapitalPrompt: false,
  },
  {
    id: 'mortgage_interest',
    line: 12,
    label: 'Mortgage interest paid to banks',
    helper: 'Interest portion only, from the 1098.',
    triggersCapitalPrompt: false,
  },
  {
    id: 'other_interest',
    line: 13,
    label: 'Other interest',
    helper: 'Interest not reported on a 1098.',
    triggersCapitalPrompt: false,
  },
  {
    id: 'repairs',
    line: 14,
    label: 'Repairs',
    helper: 'Fixing something that broke or wore out.',
    triggersCapitalPrompt: true,
  },
  {
    id: 'supplies',
    line: 15,
    label: 'Supplies',
    helper: 'Materials, parts, consumables.',
    triggersCapitalPrompt: true,
  },
  {
    id: 'taxes',
    line: 16,
    label: 'Taxes',
    helper: 'Property tax and local assessments.',
    triggersCapitalPrompt: false,
  },
  {
    id: 'utilities',
    line: 17,
    label: 'Utilities',
    helper: 'Water, sewer, gas, electric, trash.',
    triggersCapitalPrompt: false,
  },
  {
    id: 'depreciation',
    line: 18,
    label: 'Depreciation',
    helper: 'Entered by your CPA. Not calculated here.',
    triggersCapitalPrompt: false,
  },
  /*
   * TWO CATEGORIES SHARE LINE 19, AND THAT IS THE POINT.
   *
   * Line 19 is "Other" on the form and takes a list of descriptions, so more
   * than one row landing there is what the form asks for rather than a
   * collision. Nothing groups by line number alone - the ledger, the prior-year
   * comparison and the CSV all key on the category id - so the two stay apart
   * all the way to the export and reach the CPA as two named figures.
   *
   * They are split because they answer the repair-or-improvement question
   * differently. "Other" is the genuine unknown: spend that fits nowhere and
   * might well be physical work, so it asks. HOA dues and a storage
   * subscription are not physical work under any reading, and running them
   * through a prompt about bettering the property produced a review queue full
   * of $23 items nobody could act on - which teaches you to ignore the queue,
   * and the queue is where the real questions live.
   */
  {
    id: 'operating',
    line: 19,
    label: 'Operating expense',
    helper:
      'Recurring cost of running the rental that fits no line above - HOA dues, subscriptions and software, bank and filing fees. Never physical work.',
    triggersCapitalPrompt: false,
  },
  {
    id: 'other',
    line: 19,
    label: 'Other',
    helper:
      'Anything that fits nowhere above, including one-off spend on the property itself. Describe it in the notes.',
    triggersCapitalPrompt: true,
  },
] as const;

const BY_ID: ReadonlyMap<string, ScheduleECategory> = new Map(
  SCHEDULE_E_CATEGORIES.map((c) => [c.id, c]),
);

export class UnknownScheduleECategoryError extends Error {
  override readonly name = 'UnknownScheduleECategoryError';
  constructor(public readonly categoryId: string) {
    super(`Unknown Schedule E category: "${categoryId}"`);
  }
}

export function getScheduleECategory(id: string): ScheduleECategory {
  const category = BY_ID.get(id);
  if (!category) throw new UnknownScheduleECategoryError(id);
  return category;
}

export function isScheduleECategoryId(id: string): id is ScheduleECategoryId {
  return BY_ID.has(id);
}

export function listScheduleECategories(): readonly ScheduleECategory[] {
  return [...SCHEDULE_E_CATEGORIES].sort((a, b) => a.line - b.line);
}

export const SCHEDULE_E_CATEGORY_IDS: readonly ScheduleECategoryId[] =
  SCHEDULE_E_CATEGORIES.map((c) => c.id);

/** Schedule E line 3. Income is reported separately from the expense lines. */
export const SCHEDULE_E_RENTS_RECEIVED_LINE = 3;

/** How rent arrived. Kept for reconciliation against manager statements. */
export type RentSource = 'property_manager' | 'direct_from_tenant' | 'other';

export const RENT_SOURCES: readonly { id: RentSource; label: string }[] = [
  { id: 'property_manager', label: 'Property manager' },
  { id: 'direct_from_tenant', label: 'Direct from tenant' },
  { id: 'other', label: 'Other' },
] as const;
