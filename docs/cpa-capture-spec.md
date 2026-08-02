# CPA capture spec — schema, rules, and screens

Build spec for re-scoping this app into a **bookkeeping instrument that a tax process reads**.
Self-contained: everything needed to implement is in this document. Written 2026-08-02, following
`tax-logic-review.md` and `tax-logic-review-response.md`, and re-scoped by the owner's decisions
recorded in §1.

---

## 1. What the owner decided

Quoted, because every design choice below traces to one of these:

1. *"CPA will track depreciation and those records. This app's goal is to track all the
   time/expenses/receipts/miles/rent collected/dates from which property was listed for rent/
   purchased date/rental purchase price/whether managed by property manager or not/etc — and
   anything else that we will need to provide to CPA."*
2. *"We are not building for taxes/CPA purposes. Tax code changes time to time and we want to be
   agnostic of those rules that possibly could change. Our focus is data/book keeping, so we can
   use them per that year's rule."* Example given: the 1099-NEC/1099-MISC reporting threshold —
   $600 in 2025, $2,000 for payments after 31 Dec 2025 under OBBBA.
3. *"One expense date can't represent cash basis — we should be able to manage that and push the
   remaining to next year automatically."*
4. *"If 1098 has empty [boxes] we should have a way to enter or add a note like 'read closing
   docs'."*
5. *"Gross rent alone isn't enough — we manage that via a section where we received rent vs 1099
   issued."*
6. *"One transaction with a main header that tracks all activities at the core, and can
   split/dissect/bisect the way we need for tax purposes."* (the laptop errand: search time,
   travel + miles, negotiation time, payment + expense, travel home)
7. *"Moto is keep it simple and easy to use. It shouldn't be the case that I stop using it
   because of complexity/usability problem."*
8. 2025 is imported as a **live, editable working year** — a playground for finding what was
   never captured — not a frozen archive.

Out of scope by decision: findings/gap-detection engine, CPA packet screen, depreciation maths,
cost segregation and disposal modules. The app records, reconciles, and exports. It never says
"this is wrong" and never reaches a tax conclusion.

---

## 2. The two governing rules

### 2.1 Facts in rows, rules at read time

> Stored rows hold facts. Rules are applied at read time, keyed by tax year. No row ever encodes
> a rule.

A fact is true forever: a date, an amount, a vendor, miles, minutes, what a 1098 box said. A rule
is true for a year: $600 vs $2,000, 250 hours, $2,500 de minimis. A rule baked into a row is
wrong the year the rule moves, silently.

Concretely:

- `thresholds.ts` becomes year-keyed (§4.1). The accessor **throws on an unknown year** — a
  silent fallback to last year's figure is the exact failure this exists to prevent.
- Every rule function takes `taxYear`. Enforced by signature, not convention.
- `time_entries.sh_eligible` / `sh_eligible_reason` (currently written at insert time by
  `deriveShEligible()`) are demoted to a cache with a `rules_version` stamp (§4.4). Screens and
  exports recompute; the integrity audit flags drift.
- Cost treatment (operating vs acquisition) is **never stored** — it is a read-time comparison of
  a record's date against the property's placed-in-service date. Only an owner override is stored
  (§3.9).

### 2.2 Simplicity beats completeness

An abandoned tracker records nothing. The test for every item: **does it add a step to something
done weekly?** Daily capture — expense, trip, time, rent — does not change by a single field.
Everything added is invisible (thresholds, read-time derivation), once per property (purchase
facts), or once per year (the January sitting on one `/year-end` screen). No save is ever blocked
on a new field.

---

## 3. Schema

All changes in `apps/web/src/db/schema.ts`; one generated migration `0001_*.sql` plus the
hand-written backfill statements in §6. House rules preserved: attribution NOT NULL where a
person acts, `created_at` set by the database and never updated, category-like lists as text
validated against `@rental/domain`, pgEnums only for sets that cannot drift.

### 3.1 `properties` — new columns (all nullable unless noted)

```ts
/** Ready and available to rent. NOT the purchase date, NOT first occupancy. */
placedInServiceDate: date('placed_in_service_date', { mode: 'string' }),
/** What proves the date: validated against PLACED_IN_SERVICE_EVIDENCE in @rental/domain. */
placedInServiceEvidence: text('placed_in_service_evidence'),   // listing | advertised | first_tenant | other
firstTenantDate: date('first_tenant_date', { mode: 'string' }),
purchasePriceCents: bigint('purchase_price_cents', { mode: 'number' }),
closingCostsCents: bigint('closing_costs_cents', { mode: 'number' }),
/** From the county tax card. Land does not depreciate; the CPA needs the split. */
landValueCents: bigint('land_value_cents', { mode: 'number' }),
wasPersonalResidence: boolean('was_personal_residence').notNull().default(false),
convertedToRentalDate: date('converted_to_rental_date', { mode: 'string' }),
/** Depreciable basis on conversion is the LESSER of adjusted basis or this. The app never computes that; it stores both inputs. */
fmvAtConversionCents: bigint('fmv_at_conversion_cents', { mode: 'number' }),
soldDate: date('sold_date', { mode: 'string' }),
salePriceCents: bigint('sale_price_cents', { mode: 'number' }),
/** §469 activity grouping — an election the owner made, recorded as a fact. NULL renders as the nickname (ungrouped). Render-time fallback, not a stored default. */
section469Activity: text('section_469_activity'),
```

`unadjusted_basis_cents` is untouched — the `basis` allocation rule and the small-taxpayer check
read it. Form hint: *"Purchase price is what you paid. Unadjusted basis is what your CPA
depreciates. They are not the same number, and only the CPA fills the second one in."*

Checks: `sold_date IS NULL OR acquired_date IS NULL OR sold_date >= acquired_date`; all new
cents columns `IS NULL OR >= 0`.

### 3.2 `property_management_periods` (new table)

```ts
id uuid PK defaultRandom
propertyId uuid NOT NULL → properties (cascade)
/** NULL = self-managed for this period. */
managerActorId uuid NULL → actors (restrict)
startDate date NOT NULL
endDate date NULL            -- NULL = current
notes text
createdAt / updatedAt
-- check: end_date IS NULL OR end_date >= start_date
-- index on property_id
```

No overlap constraint in SQL (needs an exclusion constraint Drizzle does not express); enforced
in the service and audited in `integrity.ts`. `properties.is_self_managed` survives untouched as
the display default when a property has no periods; periods win when present.

### 3.3 `expense_payments` (new table) — cash basis

An expense is an obligation; a payment is a cash event. Cash basis deducts in the year of
payment, so **reports sum payments, never expense amounts** (§8).

```ts
id uuid PK
expenseId uuid NOT NULL → expenses (cascade)
paidDate date NOT NULL
amountCents bigint NOT NULL          -- check > 0
/** Planned, not yet paid. Excluded from every export until flipped false. */
isScheduled boolean NOT NULL default false
method text NULL                     -- card | check | ach | cash | escrow | other (PAYMENT_METHODS in domain)
reference text NULL                  -- check number, confirmation id
receiptKey text NULL
notes text NULL
createdAt / updatedAt
-- index on expense_id; index on paid_date
```

Semantics shift on `expenses`: `date` = invoice date, `amount_cents` = invoice total. Neither
column changes shape, so nothing existing breaks; the backfill (§6) gives every current expense
exactly one payment row equal to itself, so no report changes its answer on migration day.

Worked example (must hold in tests): invoice total $8,244.00 — payment 2025-12-19 $2,500.00,
scheduled 2026 payments $5,750.00. The 2025 export shows $2,500.00.

Service invariants (not DB constraints): sum of payments ≤ invoice total; an expense always has
≥ 1 payment row; the last payment row cannot be deleted (edit it instead).

### 3.4 `property_loan_years` (new table) — the 1098 record

One row per lender per property per tax year, transcribed from the Form 1098 and, where the 1098
is silent, from whatever document actually carried the figure. On the owner's four 2025 1098s,
box 10 was blank on all four and the tax/insurance figures lived in a supplemental escrow block —
hence the `*_source` columns and `document_note`.

```ts
id uuid PK
propertyId uuid NOT NULL → properties (cascade)
taxYear bigint NOT NULL
lenderName text NOT NULL             -- name only. NO account numbers, NO TINs, masked or otherwise.
interestCents bigint NULL            -- box 1
pointsCents bigint NULL              -- box 6
mortgageInsuranceCents bigint NULL   -- box 5
propertyTaxCents bigint NULL         -- box 10, or wherever it was actually found
propertyTaxSource text NULL          -- form_1098 | closing_disclosure | escrow_statement | county_bill | not_found
insurancePaidFromEscrowCents bigint NULL
insuranceSource text NULL            -- same list
escrowBalanceCents bigint NULL
originationDate date NULL
originalPrincipalCents bigint NULL
interestRatePct numeric(6,4) NULL
documentNote text NULL               -- "Box 10 blank. Taxes in the supplemental block below the boxes."
createdAt / updatedAt
-- unique (property_id, tax_year, lender_name); index on tax_year
```

`documentTypeEnum` gains `form_1098` and `closing_disclosure` (pgEnum ADD VALUE — see §6).

### 3.5 `rent_reconciliations` + `rent_reconciliation_items` (new tables)

The three rent figures never agree — received, 1099 box 1, disbursed — and every gap has a
different cause. This section makes the gap explicit and itemised.

```ts
rent_reconciliations:
  id uuid PK
  propertyId uuid NOT NULL → properties (cascade)
  taxYear bigint NOT NULL
  payerActorId uuid NULL → actors     -- the property manager who issued the 1099
  reportedGrossCents bigint NULL      -- 1099-MISC box 1 exactly as issued; NULL until it arrives
  documentNote text NULL
  createdAt / updatedAt
  unique (property_id, tax_year)

rent_reconciliation_items:
  id uuid PK
  reconciliationId uuid NOT NULL → rent_reconciliations (cascade)
  kind text NOT NULL      -- RECONCILIATION_KINDS: management_fee_withheld | repair_withheld
                          -- | advance_rent | deposit_forfeited | deposit_held | other
  amountCents bigint NOT NULL         -- SIGNED
  note text NULL
  createdAt / updatedAt
```

Invariant, computed at read time by `reconcileRent()` (§4.3):

```
residual = reportedGross − ( Σ rent_receipts for property/year + Σ item amounts )
reconciled ⇔ residual === 0
```

Signs: an amount the manager kept or reported that never reached the bank is **positive**
(fees withheld, forfeited deposit reported as income); money received that the 1099 does not
report is **negative** (a held deposit passed through). Helper text on the screen carries the one
distinction the app must not decide: **a forfeited deposit is income; a held deposit is not.**

### 3.6 `cpa_figures` (new table) — transcribed, never computed

Any figure the CPA's returned file needs recorded: per-property depreciation today, a cost-seg
component schedule or a suspended-loss carryforward if those ever exist, anything else later.
Row-shaped so no future figure needs a migration.

```ts
id uuid PK
propertyId uuid NULL → properties (cascade)   -- NULL = portfolio-level
taxYear bigint NOT NULL
kind text NOT NULL          -- CPA_FIGURE_KINDS: schedule_e_line | suspended_loss_carryforward
                            -- | depreciation_component | basis_component | other
categoryId text NULL        -- a Schedule E category id when kind = schedule_e_line
scheduleELine bigint NULL
label text NOT NULL         -- "27.5-year building", "suspended PAL brought forward"
recoveryYears numeric(4,1) NULL     -- 5 / 7 / 15 / 27.5 when a component schedule exists
amountCents bigint NOT NULL
sourceNote text NOT NULL    -- "2025 Form 4562, received 12 Apr 2026" — provenance is required
enteredByActorId uuid NOT NULL → actors (restrict)
createdAt / updatedAt
-- unique (property_id, tax_year, kind, label); index on tax_year
```

### 3.7 `jobs` (new table) + membership columns — the owner's transaction header

One header per real-world task; time, miles, and money are its line items. Generalises the
pattern `turns` already implements for make-readies. Named `jobs` because "activity" collides
with §469 activity and "transaction" with payments.

```ts
jobs:
  id uuid PK
  title text NOT NULL       -- check: length(btrim(title)) > 0
  propertyId uuid NULL → properties (set null)   -- NULL = portfolio; default for children
  notes text NULL
  createdAt / updatedAt

time_entries.jobId  uuid NULL → jobs (set null)   + index
trips.jobId         uuid NULL → jobs (set null)   + index
expenses.jobId      uuid NULL → jobs (set null)   + index
```

The header is **pure grouping fact** — no category, no amount, no tax field. Rollups (eligible
minutes, miles, spend, cost-treatment split) are derived at read time by `rollUpJob()` (§4.5).

Jobs are never mandatory and mostly invisible (§7.4): born only via "add related…" after a save
or "group these" on the list, so a zero-child job cannot be created. Deleting a job nulls
`job_id` on the children; the records survive.

Existing links untouched: `trips.driveTimeEntryId`/`onsiteTimeEntryId` (derivation) and
`time_entries.linkedExpenseId` (§5.2 eligibility dependency) are different relationships from
membership.

### 3.8 `time_entries.rules_version` (new column)

```ts
rulesVersion: text('rules_version'),   -- e.g. '2026.1'; NULL on legacy rows
```

Written on insert/update with `RULES_VERSION` from the domain package. The stored
`sh_eligible`/`sh_eligible_reason` become a cache: every screen and export **recomputes** via
`deriveShEligible(entry, taxYear)`; the integrity audit reports rows where stored ≠ recomputed.

### 3.9 `cost_treatment_override` on `expenses` and `trips` (new columns)

```ts
costTreatmentOverride: text('cost_treatment_override'),  -- 'operating' | 'acquisition' | NULL
```

NULL = derive at read time: `record.date < property.placed_in_service_date` → acquisition side,
else operating. A date comparison, not a judgement — the export labels the side; it never says
"capitalise this." The override exists for when the owner disagrees, and its presence is itself
a fact.

---

## 4. Domain package (`packages/domain/src`)

Pure, no I/O, vitest suites alongside the existing eight. **Every rule function takes
`taxYear`.**

### 4.1 `constants/thresholds.ts` — year-keyed

```ts
export interface ThresholdSet { /* unchanged fields, plus w9WarningStartMonth stays */ }

export const THRESHOLDS_BY_YEAR: Readonly<Record<number, ThresholdSet>> = {
  2025: { safeHarborHourTarget: 250, deMinimisInvoiceCents: 250_000,
          /* small-taxpayer figures unchanged */, w9ReportingThresholdCents: 60_000,
          w9WarningStartMonth: 10 },
  2026: { ...same, w9ReportingThresholdCents: 200_000 },   // OBBBA, payments after 2025-12-31
};

export class UnknownTaxYearError extends Error { ... }

/** Throws on an unknown year. Never falls back. */
export function thresholdsFor(taxYear: number): ThresholdSet;

export const RULES_VERSION = '2026.1';
```

**Delete `SAFE_HARBOR_HOUR_TARGET`** and fix every import site (grep: `HoursGauge`, dashboard
service, tests). Tests: unknown year throws; 2025 and 2026 W-9 thresholds differ.

### 4.2 `rules/payments.ts` (new)

```ts
export interface PaymentLike { paidDate: string; amountCents: number; isScheduled: boolean; }
export function paidInYear(payments: readonly PaymentLike[], taxYear: number): number;
export function outstandingCents(invoiceTotalCents: number, payments: readonly PaymentLike[]): number;
/** The "push the remaining to next year" helper: remainder as a scheduled draft dated Jan 15 of taxYear+1 (editable). */
export function scheduleRemainder(invoiceTotalCents: number, payments: readonly PaymentLike[], taxYear: number): { paidDate: string; amountCents: number; isScheduled: true } | null;
```

`paidInYear` counts only `isScheduled === false` rows inside `taxYearRange(taxYear)`. Reuse
`sumCents`, `taxYearRange`. Test fixture: the $8,244 invoice above.

### 4.3 `rules/reconciliation.ts` (new)

```ts
export function reconcileRent(
  receiptsCents: number, reportedGrossCents: number | null,
  items: readonly { kind: string; amountCents: number }[],
): { residualCents: number | null; isReconciled: boolean };
```

`reportedGrossCents === null` → residual null, not reconciled. Constants in
`constants/reconciliationKinds.ts` with labels and helper lines (forfeited vs held deposit
wording lives here, one source for web and CSV).

### 4.4 `rules/eligibility.ts` — gains `taxYear`

`deriveShEligible(input, taxYear)`. Behaviour for 2025 is unchanged — the existing tests keep
passing with the parameter added. The year is threaded now so a future category-eligibility
change is a data edit, not a signature hunt. `rules/contractors.ts`:
`contractorYearTotals(...)` already takes the year; `contractorW9Warnings(totals, now, taxYear)`
reads `thresholdsFor(taxYear)` for both the amount and the warning start month.

### 4.5 `rules/jobs.ts` (new)

```ts
export function rollUpJob(children: {
  timeEntries: readonly DomainTimeEntry[];
  trips: readonly { miles: number; date: string; costTreatmentOverride: string | null }[];
  expenses: readonly { amountCents: number; payments: readonly PaymentLike[] }[];
}, taxYear: number, placedInServiceDate: string | null): JobRollup;
```

Returns eligible/ineligible minutes (recomputed via §4.4), total miles, spend paid in year
(via §4.2), and the operating/acquisition split (via §4.6). Test fixture: the laptop errand —
search time Monday, trip Tuesday (drive + on-site + miles), expense — asserting each figure.

### 4.6 `rules/placedInService.ts` (new)

```ts
export function costTreatmentFor(recordDate: string, placedInServiceDate: string | null,
  override: 'operating' | 'acquisition' | null): 'operating' | 'acquisition';
```

Override wins; no in-service date → operating; else date comparison.

### 4.7 New constants

`constants/documentSources.ts` (`form_1098 | closing_disclosure | escrow_statement | county_bill
| not_found`), `constants/paymentMethods.ts`, `constants/placedInServiceEvidence.ts`,
`constants/cpaFigureKinds.ts` — each an id/label/helper list with a `get…` that throws on
unknown ids, mirroring `hourCategories.ts`.

---

## 5. Zod schemas (`packages/domain/src/schemas.ts`)

- `createPropertySchema` / `updatePropertySchema` gain the §3.1 fields (all
  optional/nullable) plus `managedByActorId: uuid | 'self' | null` (consumed by §7.2's period
  bookkeeping, not stored on the property).
- New: `createExpensePaymentSchema` (`expenseId`, `paidDate`, `amountCents > 0`, `isScheduled`,
  `method` from PAYMENT_METHODS, `reference`, `notes`), `updateExpensePaymentSchema`.
- New: `upsertLoanYearSchema` — all cents fields `>= 0` nullable; `lenderName` requiredText;
  sources validated against documentSources.
- New: `upsertRentReconciliationSchema`, `createReconciliationItemSchema` (signed
  `amountCents` — the one place negative is legal, so it gets its own bounds ±$10M).
- New: `upsertCpaFigureSchema` — `sourceNote` requiredText (provenance is not optional).
- New: `createJobSchema` (`title` requiredText, `propertyId` nullable),
  `assignJobSchema` (`jobId`, record type + id lists for "group these").

---

## 6. Migration and backfill order

One drizzle-kit generation, then hand-append the data statements to the same file so schema and
backfill land atomically:

1. `ALTER TYPE document_type ADD VALUE 'form_1098'; ADD VALUE 'closing_disclosure';`
2. All new tables and columns (generated).
3. Backfill — every existing expense gets its identity payment row:
   ```sql
   INSERT INTO expense_payments (expense_id, paid_date, amount_cents, is_scheduled)
   SELECT id, date, amount_cents, false FROM expenses;
   ```
4. Backfill — `rules_version` left NULL on existing time entries (legacy marker, intentional).

`npm run db:migrate` must apply clean over `0000` on the live database **and** onto a fresh one.

---

## 7. Services and screens (`apps/web`)

Service shape follows `reference.ts`: zod parse → validate → write → return row. New services:
`payments.ts`, `loanYears.ts`, `reconciliation.ts`, `cpaFigures.ts`, `jobs.ts`. `/api/v1/` routes
mirror them.

### 7.1 Expense create — payments stay invisible

`services/expenses.ts#createExpense` wraps insert + identity payment row in one transaction. The
form is byte-for-byte the form it is today. The expense detail page gains one link — *"paid in
instalments"* — opening an inline split UI: remaining balance pre-filled, date picker, "mark as
scheduled for next year" using `scheduleRemainder()`. The words payment/instalment appear nowhere
until that click.

### 7.2 Property form

New fields inside a collapsed `<details>` **"Purchase & CPA details"** — every field optional, no
save blocked. `Managed by` dropdown (Self-managed + each PM actor): on change the service closes
the open management period (`end_date = today`) and opens a new one (`start_date = today`).
History renders read-only under the dropdown when more than one period exists.

### 7.3 `/year-end` — the January sitting, one screen

`app/(app)/year-end/page.tsx`, year picker at top, four sections: **1098s** (one card per
property; blank-box sources and `document_note` inline), **Rent vs 1099** (per property:
received, box 1, items, live residual; "reconciled" appears only at zero), **Outstanding
instalments** (scheduled payments in the picked year, one-tap "confirm paid"), **CPA figures**
(table + add row). No other new routes.

### 7.4 Jobs UX — three touchpoints, nothing mandatory

1. After any successful save, next to the saved-confirmation: *"+ Add related time / trip /
   expense"*. First use silently creates the job (title from the record's description, property
   inherited); subsequent uses link to it. The target form opens pre-filled with date and
   property.
2. Entries list: a "Select" toggle exposes checkboxes → *"Group into job"* → title prompt.
3. Forms carry an optional job picker, collapsed by default, for the rare deliberate case.

Job detail view: header + children with read-time rollup (`rollUpJob`). Delete = children
survive with `job_id` null.

### 7.5 Integrity audit (`db/integrity.ts` — reports, never repairs)

New checks: expense with zero payment rows (error); payments exceeding invoice total (error);
overlapping management periods (error); `placed_in_service_date < acquired_date` warning with
the conversion-property exception noted in the message; unreconciled reconciliation with a
reported gross present (warning); job with no children (warning); stored `sh_eligible` differing
from recomputed (warning, counts by `rules_version`).

---

## 8. Exports (`server/services/reports.ts`)

All amounts on expense-derived lines come from **payments where `is_scheduled = false`**, never
from `expenses.amount_cents`.

| Report | Change |
|---|---|
| `schedule-e` | Amounts from payments. New `Source` column: `ledger` \| `1098` \| `cpa`. Merges `property_loan_years` → lines 9 (insurance from escrow), 12 (interest), 16 (property tax); `cpa_figures` with `kind = schedule_e_line` → their lines (18 for depreciation). New `Prior year` column (see note). |
| `expense-detail` | + `Invoice total`, `Paid in year`, `Outstanding`, `Cost treatment` (via `costTreatmentFor`), `Job` |
| `time-log` | + `Job`; eligibility column recomputed at export time |
| `mileage-log` | + `Job`, `Cost treatment` |
| `payments` (new) | Every cash event: date, vendor, amount, method, scheduled flag, expense ref, property |
| `rent-reconciliation` (new) | Per property/year: received, 1099 box 1, each item, residual |
| `property-facts` (new) | One row per property: address, acquired, placed in service + evidence, first tenant, purchase price, closing costs, land value, conversion facts, sold facts, manager history (periods flattened), §469 activity |
| `cpa-figures` (new) | Round-trip of §3.6: what they sent, back out in the same shape |
| `jobs` (new) | Title, property, rolled-up minutes/miles/spend from children |

**Flagged judgement call:** `Prior year` on `schedule-e` is data, not opinion, but it is the
closest this spec comes to the excluded findings layer. Drop the column if the owner says so;
nothing else depends on it.

CSV mechanics reuse `toCsv`/`withBom`/`escapeCsvField` unchanged.

---

## 9. Import 2025

Two scripts; the payload never crosses repo boundaries in git.

1. **Tax-Manager** `scripts/export-to-rental.ps1` — reads the reconciled
   `prototype/data/dataset.json`, writes `rental-import-2025.json`: 4 properties (with purchase,
   in-service, conversion, and manager-history facts), actors (JKN Realty as PM, contractors),
   75 expenses (+ identity payments; the split invoice gets its real payment rows), rent
   receipts, 107 trips, 4 loan-year rows, 2 rent reconciliations with items.
2. **rental-property** `apps/web/src/db/import-2025.ts` (`npm run db:import`) — idempotent:
   writes `app_settings key='import.2025'` on success and refuses to run again while it exists.
   Matches properties by nickname, creates missing actors, tags every imported row
   `source: 'imported'` where the column exists.

**Security, non-negotiable:** names, addresses, dates, amounts only. **No SSN, no DOB, no bank
or loan account numbers, no TINs — masked or otherwise.** Lenders and vendors are names only.
Before the file is ever generated, add `rental-import-2025.json` to `.gitignore` in **both**
repos.

2025 lands **live and editable** (owner decision 8). Back-filled hours will carry
`is_backdated = true` and a 2026 `created_at` — correct and kept: the log is honest about when
it was written, which is what makes the rest of it defensible.

---

## 10. Acceptance criteria

1. `npm run verify` clean; all eight existing domain suites still pass.
2. Exactly one new migration; applies clean over `0000` and onto a fresh database.
3. `npm run db:check` runs the §7.5 checks; zero errors on the imported dataset.
4. **Year-dimension test:** the contractor report over identical data flags a $1,400 contractor
   for 2025 and not for 2026. If both years agree, Step 0 is decoration — fail.
5. **Round trip:** after import, `schedule-e` per-property net for 2025 matches Tax-Manager's
   reconciled figures to the cent; the Westmill/Kettlewell reconciliation shows its $2,449.50 of
   items and residual $0.00; mileage splits $695.03 operating / $181.72 acquisition.
6. **Usability:** the expense form has the same five fields as today, with no mention of
   payments, instalments, or jobs. Split one expense with a 2026 scheduled payment; the 2025
   export shows only the 2025 amount.
7. **The laptop errand:** desk time → "add related trip" → "add related expense" produces one
   job, five records, two dates; the rollup matches the children; all three logs carry the job
   title; deleting the job leaves five intact records with `job_id` null.
