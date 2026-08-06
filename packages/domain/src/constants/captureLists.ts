/**
 * Short picker lists for the capture and year-end screens.
 *
 * Each is an id / label / helper triple with a lookup that throws on an unknown
 * id, mirroring `hourCategories.ts`. They are grouped in one file because none
 * of them is big enough to earn its own, and every one of them is a plain
 * vocabulary - a set of names for things, with no rule attached.
 *
 * Nothing here decides anything. `deposit_forfeited` and `deposit_held` sit
 * side by side and the app never picks between them; the helper text says what
 * distinguishes them and the owner chooses.
 */

export interface PickList<Id extends string> {
  id: Id;
  label: string;
  helper: string;
}

function lookup<Id extends string>(
  name: string,
  items: readonly PickList<Id>[],
): {
  get: (id: string) => PickList<Id>;
  has: (id: string) => id is Id;
  ids: readonly Id[];
} {
  const byId = new Map(items.map((i) => [i.id, i]));
  return {
    get(id: string) {
      const found = byId.get(id as Id);
      if (!found) throw new Error(`Unknown ${name}: "${id}"`);
      return found;
    },
    has(id: string): id is Id {
      return byId.has(id as Id);
    },
    ids: items.map((i) => i.id),
  };
}

// --- Where a figure was found (§3.4) ---------------------------------------
// Box 10 was blank on all four of the household's 2025 Form 1098s and the tax
// and insurance figures sat in a supplemental escrow block below the numbered
// boxes. Recording which document a number came from is the difference between
// a figure that can be checked next year and one that has to be hunted again.

export type DocumentSource =
  | 'form_1098'
  | 'closing_disclosure'
  | 'escrow_statement'
  | 'county_bill'
  | 'not_found';

export const DOCUMENT_SOURCES: readonly PickList<DocumentSource>[] = [
  { id: 'form_1098', label: 'Form 1098', helper: 'Printed in one of the numbered boxes.' },
  {
    id: 'closing_disclosure',
    label: 'Closing disclosure',
    helper: 'From the settlement statement rather than the 1098.',
  },
  {
    id: 'escrow_statement',
    label: 'Escrow statement',
    helper: 'The annual escrow analysis, or a supplemental block on the 1098.',
  },
  { id: 'county_bill', label: 'County tax bill', helper: 'Straight from the taxing authority.' },
  {
    id: 'not_found',
    label: 'Not found yet',
    helper: 'Recorded as missing so it is chased rather than assumed to be zero.',
  },
] as const;

export const documentSource = lookup('document source', DOCUMENT_SOURCES);

// --- Where an interest figure was found -------------------------------------
// A separate list rather than more ids on DOCUMENT_SOURCES, because that list
// is offered on the Form 1098 screen and "December statement" is not an answer
// to where a mortgage escrow figure came from. A bank under the $10 reporting
// threshold issues no 1099-INT at all and the interest is still income, so
// "no form issued" has to be a recordable answer rather than a blank.

export type InterestSource = 'form_1099_int' | 'bank_statement' | 'no_form_issued' | 'not_found';

export const INTEREST_SOURCES: readonly PickList<InterestSource>[] = [
  { id: 'form_1099_int', label: 'Form 1099-INT', helper: 'Printed in one of the numbered boxes.' },
  {
    id: 'bank_statement',
    label: 'Bank statement',
    helper: 'The December or year-to-date statement.',
  },
  {
    id: 'no_form_issued',
    label: 'No form issued',
    helper: 'Under the $10 threshold. Still income, still reportable.',
  },
  {
    id: 'not_found',
    label: 'Not found yet',
    helper: 'Recorded as missing so it is chased rather than assumed to be zero.',
  },
] as const;

export const interestSource = lookup('interest source', INTEREST_SOURCES);

// --- What kind of thing was given away --------------------------------------
// Two ids, because two is what changes the return. Cash and non-cash are
// substantiated differently and a non-cash gift over $500 drags Form 8283 along
// with it; how the money moved - cheque, card, transfer - changes nothing the
// IRS asks about, and PAYMENT_METHODS already exists for anyone who wants to
// say so in the note.

export type DonationKind = 'cash' | 'non_cash';

export const DONATION_KINDS: readonly PickList<DonationKind>[] = [
  {
    id: 'cash',
    label: 'Money',
    helper: 'Cash, cheque, card or transfer. The IRS calls all of it a cash contribution.',
  },
  {
    id: 'non_cash',
    label: 'Goods',
    helper: 'Clothes, furniture, a car. The amount is fair market value, and over $500 needs Form 8283.',
  },
] as const;

export const donationKind = lookup('donation kind', DONATION_KINDS);

// --- How a payment was made (§3.3) -----------------------------------------

export type PaymentMethod = 'card' | 'check' | 'ach' | 'cash' | 'escrow' | 'other';

export const PAYMENT_METHODS: readonly PickList<PaymentMethod>[] = [
  { id: 'card', label: 'Card', helper: 'Credit or debit.' },
  { id: 'check', label: 'Check', helper: 'Note the check number in the reference.' },
  { id: 'ach', label: 'Bank transfer', helper: 'ACH, Zelle, wire.' },
  { id: 'cash', label: 'Cash', helper: 'Keep the receipt - there is no bank record.' },
  { id: 'escrow', label: 'Paid from escrow', helper: 'The lender paid it on your behalf.' },
  { id: 'other', label: 'Something else', helper: 'Describe it in the notes.' },
] as const;

export const paymentMethod = lookup('payment method', PAYMENT_METHODS);

// --- What proves the placed-in-service date (§3.1) --------------------------
// Placed in service means ready and available to rent. It is not the purchase
// date and not the first tenant's move-in. Creedmore was acquired 17 November,
// listed 2 December, and first occupied the following March - three dates, and
// the middle one is the one that matters.

export type PlacedInServiceEvidence = 'listing' | 'advertised' | 'first_tenant' | 'other';

export const PLACED_IN_SERVICE_EVIDENCE: readonly PickList<PlacedInServiceEvidence>[] = [
  {
    id: 'listing',
    label: 'Listed for rent',
    helper: "A dated listing - Zillow, the MLS, the manager's site.",
  },
  {
    id: 'advertised',
    label: 'Advertised',
    helper: 'A sign, a post, an email to a list. Dated evidence it was offered.',
  },
  {
    id: 'first_tenant',
    label: 'First tenant moved in',
    helper: 'Weakest of the four - it is usually later than the date that counts.',
  },
  { id: 'other', label: 'Something else', helper: 'Say what it was in the property notes.' },
] as const;

export const placedInServiceEvidence = lookup(
  'placed-in-service evidence',
  PLACED_IN_SERVICE_EVIDENCE,
);

// --- What kind of figure the CPA sent back (§3.6) ---------------------------

export type CpaFigureKind =
  | 'schedule_e_line'
  | 'suspended_loss_carryforward'
  | 'depreciation_component'
  | 'basis_component'
  | 'other';

export const CPA_FIGURE_KINDS: readonly PickList<CpaFigureKind>[] = [
  {
    id: 'schedule_e_line',
    label: 'A Schedule E line',
    helper: 'Goes straight onto the numbered line. Depreciation is line 18.',
  },
  {
    id: 'suspended_loss_carryforward',
    label: 'Suspended loss carried forward',
    helper: 'The balance carried into next year. Not deducted this year.',
  },
  {
    id: 'depreciation_component',
    label: 'Depreciation component',
    helper: 'One bucket of a component schedule - 5, 15, or 27.5 year.',
  },
  {
    id: 'basis_component',
    label: 'Basis component',
    helper: 'Land, building, or improvements as the CPA split them.',
  },
  { id: 'other', label: 'Something else', helper: 'Describe it in the label.' },
] as const;

export const cpaFigureKind = lookup('CPA figure kind', CPA_FIGURE_KINDS);

// --- Why received rent and the 1099 disagree (§3.5) -------------------------

export type ReconciliationKind =
  | 'management_fee_withheld'
  | 'repair_withheld'
  | 'advance_rent'
  | 'deposit_forfeited'
  | 'deposit_held'
  | 'other';

export const RECONCILIATION_KINDS: readonly PickList<ReconciliationKind>[] = [
  {
    id: 'management_fee_withheld',
    label: 'Management fee kept',
    helper: 'The manager reported the gross rent and kept their fee out of it. Add it back.',
  },
  {
    id: 'repair_withheld',
    label: 'Repair paid out of rent',
    helper: 'A repair the manager settled before sending the balance on. Add it back.',
  },
  {
    id: 'advance_rent',
    label: 'Rent paid in advance',
    helper: "Next year's rent received this year. Income when received, on either method.",
  },
  {
    id: 'deposit_forfeited',
    label: 'Deposit forfeited',
    helper: 'A deposit the tenant lost. This IS income in the year it was kept.',
  },
  {
    id: 'deposit_held',
    label: 'Deposit still held',
    helper: 'A refundable deposit you are holding. This is NOT income - usually negative.',
  },
  { id: 'other', label: 'Something else', helper: 'Explain it in the note.' },
] as const;

export const reconciliationKind = lookup('reconciliation kind', RECONCILIATION_KINDS);

// --- Which side of the placed-in-service line a cost fell on (§3.9) ---------

export type CostTreatment = 'operating' | 'acquisition';

export const COST_TREATMENTS: readonly PickList<CostTreatment>[] = [
  {
    id: 'operating',
    label: 'Operating',
    helper: 'Spent while the property was available to rent.',
  },
  {
    id: 'acquisition',
    label: 'Acquisition',
    helper: 'Spent before it was available to rent. Your CPA decides what to do with it.',
  },
] as const;

export const costTreatment = lookup('cost treatment', COST_TREATMENTS);
