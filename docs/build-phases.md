# Build phases

Execution plan for `cpa-capture-spec.md`. Thirteen phases, strictly sequential. Each phase ends
with a green gate and a commit; nothing moves forward on a red gate.

**Working rules**

- No shortcuts, no bypass, no "fix it later". A blocker found in a phase is fixed in that phase.
- Sequential only. No parallel work, no partially-finished phase left behind.
- Every phase ends with its gate passing and a commit. A phase whose gate cannot pass is not done.
- `npm run typecheck` and `npm run test` must be green at every commit. `npm run build` from
  phase 7 onward, once there is UI to build.
- Target: production-ready POC. Real validation, real error handling, real constraints — not
  scaffolding.

**Gate legend** — `T` typecheck · `V` vitest · `B` next build · `M` migration applies · `C` db:check

---

## Phase 1 — Year-keyed rules foundation

The architecture change. Everything else depends on it, so it goes first.

| # | Task |
|---|---|
| 1.1 | `constants/thresholds.ts` → `THRESHOLDS_BY_YEAR`, `thresholdsFor()` throwing, `RULES_VERSION`, delete `SAFE_HARBOR_HOUR_TARGET` |
| 1.2 | `constants/captureLists.ts` — document sources, payment methods, in-service evidence, CPA figure kinds, reconciliation kinds, cost treatments |
| 1.3 | `rules/eligibility.ts` — `deriveShEligible(input, taxYear)`; `recomputeEligibilityForClassificationChange` threads the year |
| 1.4 | `rules/contractors.ts` — `contractorW9Warnings(totals, asOf, taxYear)`, `needsW9(paid, w9, taxYear)`; drop the `DEFAULT_THRESHOLDS` default arg |
| 1.5 | `totals/hours.ts` — `safeHarborProgress(totals, taxYear)` |
| 1.6 | `rules/trips.ts` — `buildTripDrafts(input, taxYear)` |
| 1.7 | `index.ts` exports |
| 1.8 | New suite `test/thresholds.test.ts`: unknown year throws; 2025 = $600 and 2026 = $2,000; **coverage test — the table must reach at least next calendar year**, so the gap fails CI a year before a user meets it |
| 1.9 | Update the 3 existing suites that call the changed signatures |
| 1.10 | Fix the 6 web call sites the signature change breaks (`reference/route.ts`, `settings/page.tsx`, `CategoryPicker.tsx`, `integrity.ts`, `people/page.tsx`, `dashboard.ts`, `reports.ts`, `timeEntries.ts`, `timer.ts`) |

**Gate:** T + V. **Commit:** `Phase 1: thresholds become year-keyed and rules take a tax year`

## Phase 2 — New domain rules

| # | Task |
|---|---|
| 2.1 | `rules/payments.ts` — `paidInYear`, `outstandingCents`, `scheduleRemainder`, `assertPaymentsWithinTotal` |
| 2.2 | `rules/placedInService.ts` — `costTreatmentFor(date, placedInServiceDate, override)` |
| 2.3 | `rules/reconciliation.ts` — `reconcileRent(receipts, reported, items)` |
| 2.4 | `rules/jobs.ts` — `rollUpJob(children, taxYear, placedInServiceDate)` |
| 2.5 | 4 new vitest suites; the payments fixture is the $8,244 invoice, the jobs fixture is the laptop errand |
| 2.6 | `index.ts` exports |

**Gate:** T + V. **Commit:** `Phase 2: payments, cost treatment, rent reconciliation, job rollups`

## Phase 3 — Validation schemas

| # | Task |
|---|---|
| 3.1 | `createPropertySchema` / `updatePropertySchema` gain the purchase, in-service, conversion, sale and §469 fields + `managedByActorId` |
| 3.2 | `createExpensePaymentSchema`, `updateExpensePaymentSchema` |
| 3.3 | `upsertLoanYearSchema` |
| 3.4 | `upsertRentReconciliationSchema`, `createReconciliationItemSchema` (signed amounts — the one place negative is legal) |
| 3.5 | `upsertCpaFigureSchema` (`sourceNote` required — provenance is not optional) |
| 3.6 | `createJobSchema`, `updateJobSchema`, `assignJobSchema` |
| 3.7 | Schema round-trip tests for the non-obvious ones: negative reconciliation amounts accepted, negative payments rejected |

**Gate:** T + V. **Commit:** `Phase 3: validation schemas for every new record type`

## Phase 4 — Database schema and migration

| # | Task |
|---|---|
| 4.1 | `properties` — 12 new columns + checks |
| 4.2 | `property_management_periods` |
| 4.3 | `expense_payments` |
| 4.4 | `property_loan_years` |
| 4.5 | `rent_reconciliations` + `rent_reconciliation_items` |
| 4.6 | `cpa_figures` |
| 4.7 | `jobs` + `job_id` on time_entries / trips / expenses |
| 4.8 | `time_entries.rules_version`; `cost_treatment_override` on expenses and trips |
| 4.9 | `documentTypeEnum` += `form_1098`, `closing_disclosure` |
| 4.10 | `npm run db:generate` — exactly one migration |
| 4.11 | Hand-append the identity-payment backfill to the generated SQL |
| 4.12 | `npm run db:migrate` against the live database |

**Gate:** T + M. **Commit:** `Phase 4: schema and migration 0001 with the payment backfill`

## Phase 5 — Services

| # | Task |
|---|---|
| 5.1 | `services/payments.ts` — list/create/update/delete + invariants (≥1 row, sum ≤ total) |
| 5.2 | `services/expenses.ts` — create/update wrap the identity payment row in one transaction |
| 5.3 | `services/loanYears.ts` |
| 5.4 | `services/reconciliation.ts` — header + items + live residual |
| 5.5 | `services/cpaFigures.ts` |
| 5.6 | `services/jobs.ts` — create-from-record, assign, rollup, delete-nulls-children |
| 5.7 | `services/reference.ts` — property fields + management period transitions (close old, open new, no overlap) |
| 5.8 | `timeEntries.ts` / `timer.ts` write `rules_version` |

**Gate:** T. **Commit:** `Phase 5: services for payments, loans, reconciliation, CPA figures, jobs`

## Phase 6 — API routes

`/api/v1/` for each new service, mirroring the existing route shape and error handling.
Payments, loan-years, reconciliations, cpa-figures, jobs.

**Gate:** T + B. **Commit:** `Phase 6: /api/v1 surface for the new record types`

## Phase 7 — Property form and management history

| # | Task |
|---|---|
| 7.1 | `PropertyForm.tsx` — collapsed "Purchase & CPA details", all optional, no save blocked |
| 7.2 | `Managed by` dropdown; period transition handled server-side |
| 7.3 | `actions/admin.ts` parses the new fields |
| 7.4 | Property detail renders facts + management history read-only |

**Gate:** T + B. **Commit:** `Phase 7: property purchase facts and management history`

## Phase 8 — The year-end screen

One route, four sections, one year picker: 1098s · rent vs 1099 · outstanding instalments ·
CPA figures. Plus the TabBar entry.

**Gate:** T + B. **Commit:** `Phase 8: one year-end screen for the January sitting`

## Phase 9 — Jobs and instalments in the UI

| # | Task |
|---|---|
| 9.1 | "+ Add related time / trip / expense" after every save — creates the job silently |
| 9.2 | Expense detail "paid in instalments" → inline split UI using `scheduleRemainder` |
| 9.3 | Job detail view with read-time rollup |
| 9.4 | "Group into job" on the entries list |
| 9.5 | **Usability check: the expense form still has exactly its original five fields** |

**Gate:** T + B. **Commit:** `Phase 9: jobs connect time, miles and money without touching capture`

## Phase 10 — Exports

Nine reports: `schedule-e` (payments + 1098 + CPA sources, prior-year column), `expense-detail`,
`time-log`, `mileage-log` (job columns), and new `payments`, `rent-reconciliation`,
`property-facts`, `cpa-figures`, `jobs`.

**Gate:** T + B. **Commit:** `Phase 10: the CPA hand-off - nine reports`

## Phase 11 — Integrity audit

Seven new checks in `db/integrity.ts`: paymentless expense, payments over total, overlapping
management periods, in-service before acquired, unreconciled year, childless job, stored-vs-
recomputed eligibility drift.

**Gate:** T + C. **Commit:** `Phase 11: integrity checks for the new invariants`

## Phase 12 — Import 2025

| # | Task |
|---|---|
| 12.1 | `.gitignore` `rental-import-2025.json` in **both** repos — before anything is generated |
| 12.2 | Tax-Manager `scripts/export-to-rental.ps1` |
| 12.3 | `apps/web/src/db/import-2025.ts` + `npm run db:import`, idempotent via `app_settings` |
| 12.4 | Run it; 2025 lands live and editable |

**Security gate, non-negotiable:** names, addresses, dates, amounts only. No SSN, no DOB, no bank
or loan account numbers, no TINs — masked or otherwise. Verified with `git check-ignore` and by
grepping the payload before it is written.

**Gate:** M + C + the payload security check. **Commit** in both repos.

## Phase 13 — Verification

| # | Task |
|---|---|
| 13.1 | `npm run verify` — typecheck, all vitest suites, next build |
| 13.2 | **Year-dimension test** — contractor report over identical data flags a $1,400 contractor for 2025, not for 2026 |
| 13.3 | **Round trip** — `schedule-e` per-property net for 2025 matches Tax-Manager to the cent; reconciliation items $2,449.50 with residual $0.00; mileage $695.03 operating / $181.72 acquisition |
| 13.4 | **Usability test** — expense form field count unchanged; split expense; 2025 export shows only the 2025 payment |
| 13.5 | **Laptop errand** — one job, five records, two dates; rollup matches; job title on all three logs; deleting the job leaves the records intact |
| 13.6 | `npm run db:check` clean |

**Gate:** all six. **Commit:** `Phase 13: verification`
