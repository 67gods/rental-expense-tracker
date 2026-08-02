# Review response — tax logic, measured against a real 2025 filing

Written after reconstructing this household's actual 2025 return from source documents
(four Form 1098s, a 1099-MISC, two AppFolio owner statements, two Closing Disclosures, a
MileIQ export, a bank ledger and the CPA's own organizer). Every figure below is from that
reconstruction, not from a worked example.

The build is careful. Eligibility derived server-side, actor NOT NULL with an FK, a
database CHECK on description, allocation reconciling to the penny across 2,000 tested
amounts — those are the right instincts and they are rare.

This is about what the model cannot represent, and one thing aimed at the wrong target.

---

## 1. The 250-hour test is real, correctly implemented, and worth $0 to this household

The mechanics in §2 identify the provision unambiguously. Enterprise grouping,
residential not mixing with commercial, triple-net excluded, personal use excluded — that
is **Rev. Proc. 2019-38**, the safe harbour that treats a rental enterprise as a trade or
business for the **§199A qualified business income deduction**. The app implements it
correctly.

The problem is what §199A pays.

> **QBI is 20% of qualified business INCOME. This portfolio has a loss.**
>
> 2025 Schedule E, reconstructed: **−$30,785** after depreciation and bonus.
> 20% of a loss is not a deduction. It is a negative QBI carryforward that reduces
> *future* QBI.

So 250 documented hours currently buys nothing. It is worth keeping — rents rise,
depreciation runs down, and the carryforward matters when the portfolio turns positive —
but it should not be the headline number on a dashboard.

### What is actually worth chasing

**Real Estate Professional Status, §469(c)(7).** Not 250 hours — **750 hours, plus more
than half of all personal services performed in real property trades or businesses.**

REPS makes rental losses **non-passive**. That releases the suspended loss against W-2
income:

| | |
|---|---|
| 2025 suspended passive loss | **$30,785** |
| Combined W-2 income | $324,603 |
| §469 special allowance at that income | **$0** — fully phased out above $150k MAGI |
| Value of the loss today | **nothing** |
| Value if REPS were met | ~**$8,700/year** at a 28.25% combined marginal rate |

That is roughly **six times** what the 250-hour test could ever return here, and the gap
persists every year the portfolio runs a loss.

### Why this is a data-model question, not just a strategy note

REPS is tested **per spouse and hours cannot be pooled** — which the app already gets
right, and is the single best decision in the schema. But three things are missing:

1. **The 750-hour threshold.** Only 250 is modelled.
2. **Non-rental hours.** The "more than half of personal services" test needs the
   *denominator* — hours worked in the day job. Without it the test cannot be evaluated
   at all. One spouse is a full-time software engineer at $228k and will not pass. The
   other is at $96,546 and **might**, depending on hours. That is the question this app
   should be able to answer and currently cannot.
3. **Material participation per property**, or the §469(g)(1) election to aggregate all
   rentals as a single activity. REPS gets you past the per-se passive rule; you still
   need material participation. The election is made by statement with the return and is
   binding on future years.

**Recommendation:** add `actors.non_rental_hours_ytd` (or a category for it), track both
the 250 and 750 thresholds, and show them separately per person. The 250-hour gauge is
not wrong — it is just not the one with money behind it.

---

## 2. `placed_in_service` is absent, and it is the most consequential date in the model

`properties.acquired_date` exists. Placed-in-service does not. They are different dates
and the difference decided more than any other single fact in the 2025 reconstruction.

Placed in service means **ready and available to rent** — not purchased, and not
occupied.

| Property | Acquired | Placed in service | First tenant |
|---|---|---|---|
| Creedmore | 2025-11-17 | **2025-12-02** (Zillow listing) | 2026-03-16 |
| Arbordale | 2025-01-28 | 2025-01-28 | 2025-04-23 |
| Kettlewell | 2018-05-10 | **2019-10-01** | — |
| Westmill | 2019-09-11 | **2023-02-01** | — |

Three consequences, each of which the app currently cannot express:

**Depreciation starts at placed-in-service**, not acquisition. Creedmore acquired in
November and placed in service on 2 December earns half a month of depreciation under the
mid-month convention — $459, against $11,011 for a full year. Getting the date wrong by
one entry is a $10,552 error on one property.

**Spending before that date is basis, not expense.** Costs to bring a property into the
condition needed for its intended use are capitalised. Roughly **$12,447** of Creedmore
spend fell on the wrong side of this line, and the boundary sits *inside* the tax year —
work on 26 November capitalises, cleaning on 15 December does not. An expense table with
no in-service date to compare against cannot make that call, and today the app would file
all of it to Schedule E.

**Bonus depreciation timing.** LVP flooring is 5-year property and gets 100% bonus under
OBBBA. Placed in service 2 December 2025 makes that a **2025** deduction; the first-tenant
date would have pushed $6,960 into 2026.

**Recommendation:** `properties.placed_in_service_date`, required before any expense on
that property can be filed to Schedule E, and a rule that flags expenses dated before it.
Also store what evidenced the date — a listing receipt is the usual proof and is worth a
`placed_in_service_evidence` text field.

---

## 3. Basis is one number where it needs to be four

`unadjusted_basis_cents` is a single field. Depreciation needs:

- **Land value** — land does not depreciate. A 20% land allocation on this portfolio's
  $1,289,900 of cost is $258,000 that must never enter a depreciation schedule. The
  county assessment is the source and it is free to look up.
- **Building basis** — the depreciable part.
- **Conversion-date fair market value** — for any property that was a home first.
- **Prior accumulated depreciation** — for anything already on a depreciation schedule.

The conversion point is not theoretical here. **Two of the five were personal residences
before they were rentals** — Kettlewell for 17 months, Westmill for 41. On conversion, the
depreciable basis is the **lesser of adjusted basis or fair market value at the conversion
date**. Cost is almost certainly lower given Charlotte's rise, but it has to be
established, and the app has nowhere to record either figure.

Note also: the CPA's asset listing carries Westmill at **$330,195** while the owner's own
figure is $324,000 — purchase price plus capitalised closing costs. The number already on
the preparer's depreciation schedule is the one that governs. A `basis_source` field would
stop that drift.

---

## 4. One expense date cannot represent a cash-basis payment

`expenses.date` is a single date and `amount_cents` a single amount. A cash-basis return
deducts when **paid**, and one invoice can straddle a year end:

> Invoice INV011307, dated 2025-11-18, total $8,244.
> Paid **$2,500 in 2025** and **$5,750 across six instalments in 2026**.
> The 2025 deduction is $2,500. Six of the payments belong to a different tax year.

The model cannot hold this. Nor can it hold the related fact that a cash payment does not
attach to particular line items — the $2,500 still has to be split between the invoice's
$3,327 of 5-year property and $4,917 of repairs, pro rata or otherwise.

**Recommendation:** split `expenses` into an invoice and its payments, or at minimum add
`incurred_date` alongside `paid_date` and let one expense carry several payments. This is
schema surgery, so it is better done before M2 than after.

---

## 5. The three largest deductions are entirely outside the app

| Schedule E line | 2025 amount | Where it lives today |
|---|---|---|
| 12 — Mortgage interest | **$16,213.35** | hand-typed from four 1098s |
| 16 — Taxes | **$10,727.97** | hand-typed |
| 9 — Insurance | **$2,968.19** | hand-typed |
| 18 — Depreciation | **~$26,581** | not calculated at all |
| | **$56,490** | |

That is more than the entire expense ledger the app is built to capture. §6 lists these as
"assumed the CPA handles it," which is defensible for the *calculation* — but not for the
*record*, and two traps make hand-entry unreliable:

**Box 10 was empty on all four 1098s.** Property tax and insurance were in a supplemental
escrow-disbursement block that a person reading the numbered boxes would miss entirely.
$10,728 of property tax was sitting there.

**What you pay into escrow is not the deduction.** What the servicer *disburses* is. Those
differ, and only the annual escrow statement shows the disbursement.

**Recommendation:** a `loans` table (lender, rate, term, origination, balance) and an
`escrow_disbursements` table (date, kind, amount, source). Not to compute depreciation —
to stop the largest numbers on the return being untracked. A reconciliation that recomputes
expected interest from rate and balance and compares it to Box 1 catches a missing 1098
after a servicing transfer, which is otherwise invisible.

---

## 6. Rulings on the §5 judgment calls

**5.1 — provisional hours. Your instinct is right; the label is not strong enough.**
Counting and flagging beats excluding, because excluding resolves a classification the app
is not allowed to resolve. But "X hours depend on work not yet classified" understates it
when the gauge is the point. Show the eligible total as a **range** — "312–340 eligible" —
so the uncertainty is in the number rather than in a footnote beside it.

**5.2 — hours on properties that left the enterprise. Correct as coded**, with one
addition: the exclusion is **for the year**, so the same property can be in the enterprise
in 2025 and out in 2026. Model it as a per-year fact, not a boolean on the property, or
next year's answer silently rewrites this year's.

**5.3 — `>= $600`. Right direction, and it is not a deviation.** The statute is "at least
$600." Over-flagging costs a glance; under-flagging costs a penalty. Keep it.

**5.4 — October is too late.** The W-9 is hardest to get *after* the relationship ends, and
a contractor who finished work in March is gone by October. Make it a warning **as soon as
a contractor crosses $600 without a W-9**, at any time of year. October should escalate,
not start. In this household one contractor reached **$11,904.53** with no W-9 on file.

**5.5 — trip splitting is well designed. The bank default is wrong.** A trip to a bank is
almost never rent collection in the eligible sense — rent arrives by ACH from a manager or
a tenant portal. In this household's actual mileage log, the one bank trip was "visiting
the bank for account closure information," which is administrative. Default it to **no
category, user must pick**, like "anything else."

The bigger gap: **there is no acquisition-versus-operating distinction on mileage.** Travel
to evaluate or acquire a property adds to basis; it is not a deduction. In the 2025 log,
**$181.72 of $876.75** was acquisition or pre-service travel — 21% of the total, on the
wrong side of the line. A trip needs a treatment field, and the classifier should key it
off the property's acquired and placed-in-service dates.

**5.6 — miles-only is right, but store the rate as a per-year table anyway.** Not to assert
it — to produce the dollar column the CPA needs without them retyping it. 2025 is $0.70.
Show it as "at the 2025 standard rate of $0.70, entered by you" rather than as the app's
assertion.

**5.7 — gross rent alone is not enough, and this is the one that bit hardest.**

You need **three** figures and they will not agree:

| | 2025 |
|---|---|
| Rent charges applied per the owner statements | $54,130.00 |
| 1099-MISC box 1 | $54,338.50 |
| Net actually disbursed to the owner | $51,889.00 |

Every difference had a distinct cause:

- **$2,449.50** between box 1 and net disbursed is *everything the manager withheld* —
  management fees, vendor payments they made, and an unexplained remainder. Not fees.
  Reporting it as management fees overstates line 11 by $859.50.
- **$208.50** between box 1 and applied rent is **rent received in 2025 for 2026 periods**.
  Advance rent is income in the year received on either accounting method, and receipt by
  an agent is receipt by the owner. It is 2025 income, and it must not be counted again in
  2026 when it is applied.
- **$2,250** was a **security deposit forfeited on a lease break** — income when retained,
  and it sat inside the manager's "cash in" looking like a pass-through.
- **$1,860** is a deposit **still held** — a liability, not income, and it reached the
  owner's bank account looking exactly like rent.

**Recommendation:** `rent_receipts` needs a `kind` — rent charge, advance rent, forfeited
deposit, deposit held, fee refund — and a separate `deposits` table with received,
returned and retained. Also store the manager's withheld total so line 11 is *fees paid*,
never the plug figure.

**5.8 — allocation bases are fine.** Square footage is worth adding; fair market value is
not, because it changes annually and would silently re-allocate prior years.

**5.9 — the contemporaneity trail is good and one field short.** Preserving `created_at`
separately, recording backdating on the row, and never relabelling an edit as same-day —
that is the right design. Missing: **what changed.** §6 lists "no audit trail of edits" as
a known gap; for the hours log specifically that gap is the weak point, because a duration
edited from 30 minutes to 3 hours with no record of the change is exactly what an examiner
probes. Log old and new values on `minutes`, `category` and `date` at minimum.

**5.11 — the trigger set is too narrow.** Repairs, cleaning and maintenance, supplies and
other all trigger the question, which is right. **Utilities should not, but "auto and
travel" should**, because acquisition travel capitalises. And any expense on a property
**before its placed-in-service date** should trigger regardless of category.

**5.12 — two of the three figures are right and one is wrong.**

- De minimis **$2,500 per invoice or item** — correct without an applicable financial
  statement ($5,000 with one). Not indexed. **It requires an annual election attached to
  the return** — the app should flag that the election is needed, because the threshold is
  useless without it.
- Small taxpayer: gross receipts ≤ **$10,000,000** (3-year average), building unadjusted
  basis ≤ **$1,000,000**, total repairs and improvements ≤ the **lesser of 2% of
  unadjusted basis or $10,000** — all correct, none indexed. Note it is applied **per
  building**, so a five-property portfolio runs the test five times.
- Routine maintenance: the brief says "expected more than once over the property's life."
  **Wrong for buildings.** The test is work expected to be performed **more than once
  during a 10-year period** (§1.263(a)-3(i)). "Property's life" is the standard for
  non-building property. On a 27.5-year building the difference is large.

---

## 7. The M2 questions

You said this was the highest-value thing to hand back. The classification rests on
§1.263(a)-3 and three ideas — **B**etterment, **A**daptation, **R**estoration. If any is
true it is an improvement. Ask them in that order, stopping at the first yes.

> **1. Did this replace an entire system, or a major component of one?**
> *Roof, HVAC, plumbing, electrical, windows, structure. Replacing all of something, not
> patching part of it.*
> → yes = **improvement** (restoration)
>
> **2. Is the property meaningfully better than before the work — bigger, stronger, or
> upgraded to a higher grade?**
> *A better version, not the same thing repaired. New quartz worktops where laminate was.
> Not: repainting the same walls the same colour.*
> → yes = **improvement** (betterment)
>
> **3. Is the property now used for something it was not used for before?**
> *A garage turned into a bedroom. A house split into two units.*
> → yes = **improvement** (adaptation)
>
> **4. Was this fixing or maintaining something that already worked, to keep it working?**
> → yes = **repair**. Anything reaching here without a yes = **needs_review**.

Two additions that matter more than a fourth question:

**Ask when the work was done, not just when it was paid.** A December invoice for November
work is a cash-basis timing question and an in-service question at once.

**Ask whether the property was available to rent at the time.** If not, the answer is
neither repair nor improvement — it is **basis**, and the repair/improvement question does
not arise. This is the single most common way a first-year landlord overstates a return,
and it is worth being question zero.

One more flag to run alongside the three thresholds: **the plan-of-rehabilitation
doctrine**. Individually small repairs done as part of one general renovation get
capitalised with it. Creedmore's cleaning invoices are only repairs if you ignore that they
sat inside a four-month rehab.

---

## 8. Roadmap order

**M2 before anything else — agreed, and it is more urgent than the brief suggests**,
because the cross-rule already exists and cannot fire. Today nothing can be marked an
improvement, so every improvement is silently sitting in the eligible-hours total.

**Move two things forward, both ahead of M3:**

1. **`placed_in_service` and the basis fields.** Cheap, and M2's classification is wrong
   without them — the guided prompt cannot ask "was it available to rent" against a date
   that does not exist.
2. **Prior-year comparison.** Listed under "known gaps, not on any milestone." It is the
   highest-yield gap-finder there is, and it needs nothing but last year's numbers. Run
   against this household's own 2024 figures it immediately surfaced:

| | 2024 | 2025 | |
|---|---|---|---|
| Westmill lawn care | $1,650 | $900 | −45% |
| Westmill TruGreen | $738 | $386 | −48% |
| Westmill cleaning | $1,435 | $730 | −49% |
| Kettlewell HOA | $2,363 | $1,800 | −$563 |
| Kettlewell utilities | $289 | $78 | −73% |
| Kettlewell plumbing | $1,965 | — | nothing |

Recurring services do not halve. That is roughly **$2,580** of probably-missing entries
found by subtraction, with no new data required.

**M5 geofencing can wait**, and the question you asked about it has a clear answer.

> **Does machine-captured mileage strengthen or weaken the record?**
>
> **Strengthens it, provided the purpose is still written by a person.** The regulations
> want a record made at or near the time of use, showing mileage, date, destination and
> business purpose. A geofence supplies the first three better than memory ever will. It
> cannot supply the fourth, and a log of trips with no stated purpose is weaker than a
> short handwritten one.
>
> Store the capture method on the row. "GPS-captured, purpose entered same day" is a
> stronger sentence than either half alone. And keep the raw arrival and departure
> timestamps — dwell time is what distinguishes a site visit from driving past.

---

## 9. Which known gaps actually matter

| Gap | Verdict |
|---|---|
| No depreciation tracking | **Matters most.** Not the calculation — the *inputs*. Placed-in-service, land split, conversion FMV, prior accumulated depreciation. Without them the CPA cannot compute it either. |
| No mortgage interest import | **Matters.** $16,213 hand-typed, and Box 10 is empty on every one of these 1098s. |
| No prior-year comparison | **Matters.** Highest yield per line of code in the whole list. |
| No audit trail of edits | **Matters for hours only.** An edited duration with no history is the weak point in a time log. |
| No mid-year acquisition or disposal | **Matters this year** — two properties were acquired in 2025 and the enterprise composition changed. |
| No 1099-NEC generation | **Correctly left out.** But add **payment method** — anything paid by card is reported by the processor on a 1099-K and must **not** also go on a 1099-NEC. Filing both duplicates the contractor's income. |
| No document storage | Correctly deferred. |

---

## 10. Missing entirely

1. **Security deposits.** Not income when received, income when retained, a liability while
   held. Two of the four deposit events in 2025 were misread on first pass.
2. **Advance rent.** Income when received regardless of method. Will be double-counted next
   year if not flagged.
3. **Acquisition and pre-service costs**, of any kind — mileage, courier, inspection.
   Different treatment, no field.
4. **The safe-harbour statement itself.** Rev. Proc. 2019-38 requires a signed statement
   attached to the return, per enterprise, every year. The app has the data and should
   produce the text.
5. **Non-rental hours**, per §1 above. Without them REPS cannot be evaluated.
6. **Fifth property.** The brief says five rentals; the 2025 return has four plus a primary
   residence. If the fifth is the primary residence it must never enter an enterprise, and
   its 1098 goes to Schedule A, not E. Worth confirming before the enterprise defaults are
   set.

---

## 11. If only three things get done

1. **`placed_in_service_date` and the land/building basis split**, before M2. Everything
   downstream is wrong without them, and they are a day's work.
2. **Track 750 hours and non-rental hours per person, alongside the 250.** The provision
   currently being tracked is worth $0 this year; the one that is not tracked is worth
   ~$8,700 a year.
3. **Prior-year comparison.** No new data, and it found $2,580 the first time it was run.
