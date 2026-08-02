# Tax logic as implemented — review brief

Paste this whole file to a reviewer who knows the tax situation but has not seen
the code. It describes what the app actually does, not what it was supposed to
do, and it flags the judgment calls that could be wrong.

---

## 1. What you are reviewing

A record-keeping app for a two-person household with five single-family
rentals. Four have a property manager; one is self-managed. The owners do
everything the managers don't: lease review, rent verification, contractor
sourcing and supervision, materials runs, between-tenant turns, and renewal
market surveys.

**The app gives no tax advice and makes no filing decisions.** It classifies,
flags, and exports CSV. Anything uncertain is surfaced for a CPA rather than
resolved. Please review it on those terms — the question is whether the
*classification and flagging* are right, not whether it reaches correct
conclusions, because it deliberately reaches none.

Milestone 1 is built and running: web app, manual capture, dashboard, CSV
export. Later milestones are listed in §6.

---

## 2. The two things it exists to support

1. **A 250-hour documented-time test evaluated at "enterprise" level**, where an
   enterprise groups properties and residential cannot mix with commercial. The
   original brief did not name the provision. **Please confirm which one is
   meant and whether the mechanics below match it.**

2. **Repair vs. improvement classification** on spend tied to physical work,
   with three threshold checks surfaced as flags: a $2,500 per-invoice de
   minimis, a recurring-maintenance test, and a small-taxpayer test based on
   unadjusted basis. **The thresholds are stored but not yet applied — see §6.**

---

## 3. Hours eligibility, exactly as coded

Every time entry has a category. `sh_eligible` is **derived from the category**,
never entered by the user, never editable, and never accepted from a client —
it is computed on the server at write time.

| Category | Eligible | Helper text shown to the user |
|---|---|---|
| Repairs & maintenance | **yes** | Fixing or maintaining something that already exists. |
| Turn cleaning / make-ready | **yes** | Getting a unit ready between tenants. |
| Purchase of materials | **yes** | Time at the store buying supplies or parts. |
| Contractor sourcing & supervision | **yes** | Finding, negotiating with, scheduling, supervising. |
| Leasing & lease review | **yes** | Reviewing, negotiating, or signing a lease. |
| Advertising & tenant screening | **yes** | Listing, showings, applications, background checks. |
| Rent collection | **yes** | Confirming rent actually landed in the account. |
| Market survey — renewal pricing | **yes** | Comparable rents to set a renewal rate on a unit owned. |
| Statement & report review | **no** | Reading the manager's owner statement or a financial report. |
| Capital improvement work | **no** | Planning, managing, or building an improvement. |
| Travel / driving time | **no** | Time behind the wheel. |
| Acquisition search | **no** | Looking at properties to buy, incl. market survey for a purchase. |
| Financing & loan documentation | **no** | Mortgages, refinancing, loan paperwork. |

Two pairs are one tap apart in the picker and opposite in outcome. Each points
at the other with a one-tap switch:

- *Confirming rent hit the account* (eligible) vs *reviewing the manager's owner
  statement* (not eligible)
- *Market survey to set a renewal rent* (eligible) vs *market survey to evaluate
  a purchase* (not eligible)

**A description is mandatory** on every entry, enforced by a database CHECK
constraint, not just the form. A category alone cannot be stored as a record.

**Every record carries the person who did the work.** The attribution column is
NOT NULL with a foreign key on all five record types, verified by attempting a
raw SQL insert without one — it is rejected. Hours are reported per person and
are never summed across the two people anywhere in the app.

---

## 4. The cross-field rule

When time is linked to work classified as a **capital improvement**, eligibility
flips to **false regardless of category**. Sourcing a contractor for a roof
replacement is excluded; sourcing one for a drywall patch is not.

Reclassifying an expense re-derives eligibility on every time entry linked to
it, so the two can never disagree.

---

## 5. Judgment calls I want challenged

These are decisions not dictated by the source brief. Each could be wrong.

**5.1 — Time linked to work that is still unclassified.**
The brief covers `improvement` (excluded) and `repair` (unaffected) but not
"not yet answered." As coded: the hours **count as eligible** and are flagged
`provisional`, with the dashboard showing "X hours of that eligible total
depend on work not yet classified." The alternative was to exclude them until
answered. I chose counting-and-flagging because excluding felt like resolving a
classification the app is not allowed to resolve. **Is showing an eligible
total that may drop the right default, or should unresolved time be held out?**

**5.2 — Hours on properties that left the enterprise.**
Triple-net lease or owner personal use during the year removes a property from
its enterprise. As coded, hours logged against such a property count in **total
logged** but not in **eligible**, reported as a separate figure. The brief said
to flag the conditions but not what happens to the hours. **Correct?**

**5.3 — W-9 threshold is at-or-above $600, not over $600.**
The brief said "over $600." I used `>= $600`, so a contractor sitting exactly on
$600.00 is flagged. Over-flagging costs a glance; under-flagging costs a missing
1099. **Deliberate deviation — confirm it is the right direction.**

**5.4 — W-9 warnings become persistent on 1 October.**
Before October the same condition shows as quiet info on the contractor record;
from 1 October it is a dashboard warning. **Is October the right trigger, or
should it be earlier given 1099 deadlines?**

**5.5 — Trip splitting.**
One trip produces up to three records: mileage (deductible), drive time
(logged, **always ineligible**, category pinned, not a user choice), and on-site
time (user-categorised, usually eligible). Travel is removed from the on-site
category picker entirely so on-site work cannot be filed as driving.

Destination defaults for on-site time: hardware store → *purchase of materials*;
a property → *repairs & maintenance*; contractor meeting → *contractor sourcing
& supervision*; bank → *rent collection*; anything else → **no default, user
must pick**. **The bank → rent collection default is mine, not from the brief.
Is a trip to deposit or verify rent properly "rent collection" time?**

**5.6 — Mileage carries no dollar figure.**
The log exports date, driver, start, destination, miles, and business purpose.
No rate, no dollar column — the app does not assert a mileage rate it cannot
verify. **Should it hold a per-year rate you enter, or is miles-only right?**

**5.7 — Income was added to the data model.**
The original spec had no income table, but the year-end export requires income
by Schedule E line per property, and the small-taxpayer test needs gross
receipts. Rent received is now recorded (date, property, amount, source:
manager / direct from tenant / other). **Is recording gross rent enough, or is
rent net of management fees also needed to reconcile against manager
statements?**

**5.8 — Shared expenses keep one parent record.**
An insurance premium covering several properties stays a single row matching a
single receipt. The split is derived at report time by one of: equal, by
unadjusted basis, by ownership percentage, or explicit custom percentages.
Splits reconcile to the parent amount to the penny (largest-remainder method,
tested across 2,000 amounts). **Are those the right allocation bases? Square
footage and fair market value are absent.**

**5.9 — Dates are anchored to a fixed household timezone, not UTC.**
Work logged at 8pm on 31 December stays in that tax year. `created_at` is a
separate, database-set, never-updated timestamp — the contemporaneity evidence.
Backdating is allowed and recorded as such on the row; editing an old entry
does not relabel it as written on the day. **Is the contemporaneity trail
sufficient as described?**

**5.10 — Timer entries take the date the session started**, which matters for
work running past midnight. A timer left running can be corrected to the time
actually worked; the correction changes the duration but not `created_at`.

**5.11 — Schedule E mapping.** Expenses are filed to lines 5–19 (advertising,
auto and travel, cleaning and maintenance, commissions, insurance, legal and
professional, management fees, mortgage interest, other interest, repairs,
supplies, taxes, utilities, depreciation, other). Income maps to line 3. Lines
flagged as triggering the repair-or-improvement question: repairs, cleaning and
maintenance, supplies, other. **Is that the right set to trigger on?**

**5.12 — Thresholds stored but not yet applied.** De minimis $2,500 per invoice;
small-taxpayer basis ceiling $1,000,000, 2% of basis or $10,000 whichever is
lower, gross receipts ceiling $10,000,000. **Confirm these figures and whether
any are indexed or have changed.**

---

## 6. What is not built yet, and what is planned

Milestone 1 shipped. Everything below is planned but absent. **Review this as
a roadmap** — if something here is in the wrong order, or something needed for
this tax year is scheduled too late, say so.

### M2 — Classification (next up, the biggest tax-logic gap)

This is the largest hole today. Currently an expense on physical work is
**flagged** as needing a repair-or-improvement answer and counted on the
dashboard, but there is no way to answer it. Planned:

- **A guided prompt of 3–4 plain-language questions** shown at the moment of
  entry, while the facts are fresh. No tax jargon. Outcome is one of `repair`,
  `improvement`, or `needs_review`.
- **The user's answers are stored alongside the classification.** The reasoning
  trail is the point, not just the verdict.
- **Three threshold checks run when the outcome is `improvement`**, each
  surfaced as a flag for the CPA and never applied automatically:
  - invoice at or under $2,500 (de minimis)
  - work is recurring maintenance expected more than once over the property's life
  - small-taxpayer test against the property's unadjusted basis
- **A `needs_review` inbox** to work through unanswered items.
- The capital-improvement cross-rule already exists and is tested; M2 is what
  finally lets it fire, because today nothing can be marked an improvement
  through the UI.

**Questions for you:** Are 3–4 questions enough to separate repair from
improvement reliably? What should they actually ask? Is there a fourth
threshold check that belongs here?

### M3 — Turns

A between-tenant make-ready as a container object: all expenses, hours, and
trips for one turn, with running cost and days vacant. The database table
exists; there is no UI. Cost-per-turnover is an operational metric, not a tax
one — **flag if it has tax relevance I have missed.**

### M4 — Android client

Signed APK sideloaded onto two phones. No Play Store. Manual entry parity with
the web app, receipt camera, offline entry with later sync. The REST API it
will call is already built and in use by the web app, so the two clients cannot
drift apart on the rules.

### M5 — Trip automation

Background geofencing around the five properties plus hardware stores, drive
start/stop detection, automatic mileage capture, dwell-time capture at each
stop. Feeds the same three-record trip split that exists today.

**Question for you:** automatically captured mileage is machine-generated rather
than contemporaneously written by a person. **Does that strengthen or weaken the
record compared with a manual log?** It changes what M5 should store.

### M6 — Reports and year-end

PDF output alongside today's CSV, and a formatted year-end pack. CSV export of
all six reports works now.

### Known gaps not currently on any milestone

Flag any of these that matter, because nothing is scheduled to address them:

- **No depreciation tracking.** Schedule E line 18 exists as a category, but the
  app calculates nothing — it is assumed the CPA handles it.
- **No mortgage interest import.** Line 12 is entered by hand from the 1098.
- **No 1099-NEC generation.** The app tracks who needs one and flags missing
  W-9s; it does not produce forms.
- **No document storage for leases or insurance policies.** The table exists,
  there is no UI.
- **No handling of a property sold or acquired mid-year**, or of the enterprise
  composition changing partway through a year.
- **No prior-year comparison or carryforward** of any kind.
- **No audit trail of edits.** A record shows when it was created and that it
  was later modified, but not what changed or what the previous value was.

---

## 7. Year-end output

Six CSVs: Schedule E summary by property; the full time log (date, person,
hours, category, eligible yes/no, property, description, how recorded, recorded-
at timestamp, logged-after-the-fact flag); IRS-style mileage log; contractor
payments with W-9 status; every expense; every rent receipt.

The time log exports eligibility as a **column rather than a filter** — the CPA
receives the whole log and the basis for each inclusion, not a subset the app
pre-selected.

---

## 8. What I want back

1. **Anything in §3 that is miscategorised**, with the reason.
2. **A ruling on each judgment call in §5**, especially 5.1, 5.2, 5.3, 5.5, 5.7.
3. **Confirmation of which provision the 250-hour test refers to**, and whether
   anything in the mechanics — enterprise grouping, the residential/commercial
   split, the triple-net and personal-use exclusions — is wrong or incomplete.
4. **Whether the contemporaneity trail** (§5.9) would hold up, and what else
   should be captured that is not.
5. **The actual wording of the M2 questions** (§6). Three or four plain-language
   questions that reliably separate a repair from an improvement is the single
   highest-value thing you could hand back, because it is the next thing built
   and I would otherwise be guessing at it.
6. **Whether the roadmap order in §6 is wrong for this tax year.** If something
   scheduled for M5 or M6 is needed before the next filing, it should move.
7. **Which of the "known gaps" at the end of §6 actually matter**, and which are
   correctly left to the CPA.
8. **Anything missing entirely** that this household would need at year end.

Be specific about what is wrong rather than generally cautious. This is a
record-keeping tool, so a category that is quietly mislabelled is worse than one
that is obviously missing.
