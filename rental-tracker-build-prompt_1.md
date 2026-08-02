# Build Prompt: Rental Property Operations Tracker

> Paste this whole file as your first message in Claude Code (VS Code). It is written to be read by the model as a working brief, not by a human as documentation.

---

## 1. Role and working style

You are building a production-quality app for a two-person household that owns five single-family rental properties. I am the owner, not a professional developer. Work accordingly:

- **Ask before assuming.** If a requirement below is ambiguous, ask me rather than picking a direction and building on it for an hour.
- **Build in the milestone order given in §9.** Do not scaffold all features at once. I want something usable after Milestone 1.
- **Explain tradeoffs in plain language** when a technical choice affects cost, reliability, or how much manual work I do later.
- **Write tests for the tax-logic layer** (§5). Everything else can be manually verified.
- **No tax advice in the UI.** The app classifies, flags, and exports. It never tells the user what to claim. Uncertain cases get flagged for CPA review, not auto-resolved.

---

## 2. The problem

Five single-family rentals. Four have a property manager, one is self-managed. The property managers do very little — sign leases, collect rent, forward tenant complaints. My wife and I do everything else: review leases, verify rent, find and negotiate with contractors, buy materials, supervise work, handle every between-tenant turn (cleaning, painting, repairs), and run market surveys at renewal.

Today none of this is recorded systematically. Four things are being lost:

1. **Expenses** — scattered across cards, receipts, and memory.
2. **Hours** — no log, so a tax provision that requires 250 documented hours/year is unusable.
3. **Mileage** — hundreds of untracked trips to properties, hardware stores, and contractor meetings.
4. **Time-on-site** — the productive time at each stop, which is what actually counts as work.

The app fixes all four with capture that is fast enough to actually happen.

---

## 3. Goals

**Primary**
- Capture expenses, hours, and mileage with low enough friction that both of us use it consistently.
- Produce audit-defensible records: contemporaneous, attributed to a person, with dates and descriptions.
- Export clean per-property Schedule E figures and a formatted time log at year end.

**Secondary**
- Flag repair-vs-improvement decisions at the moment of entry, while facts are fresh.
- Track cost-per-turnover as an operational metric.
- Surface contractors who need a W-9 before year end.

**Explicit non-goals (v1)**
- No accounting engine, no double-entry, no bank sync.
- No tenant portal, no rent collection, no maintenance ticketing.
- No multi-tenant SaaS. Two users, one household.
- No tax filing or form generation. Export CSV/PDF for the CPA.

---

## 4. Users

Two users, equal permissions, shared data. **Every record must be attributed to the person who performed the work.** Never write "household" as the actor. This matters because some tax tests count only one spouse's hours and spouses cannot pool them, so a merged log is unrecoverable after the fact.

Third parties (property managers, contractors) are also actors and can have hours logged against them, entered manually or imported from a PM statement.

---

## 5. Domain rules — implement these carefully

This is the part that makes the app worth building. Treat these as business logic with test coverage, not as UI copy.

### 5.1 Hours eligibility

Hours are logged in categories. Each category carries an `sh_eligible` boolean (safe-harbor eligible) that is **derived from the category, never entered by the user**. Two totals are always shown separately: **total hours logged** and **eligible hours**.

| Category | `sh_eligible` |
|---|---|
| Leasing / lease negotiation / lease review | true |
| Advertising, tenant screening | true |
| Rent collection (verifying deposits received) | true |
| Repairs & maintenance | true |
| Purchase of materials | true |
| Contractor sourcing, negotiation, supervision | true |
| Market survey for renewal pricing | true |
| Turn cleaning / make-ready | true |
| Financial statement / operations report review | **false** |
| Capital improvement — planning, managing, construction | **false** |
| Travel / driving time | **false** |
| Acquisition search, market survey for buying | **false** |
| Financing, refinancing, loan documentation | **false** |

Two pairs look identical and are not. Handle them distinctly in the picker with one-line helper text:
- *Confirming rent hit the account* (eligible) vs. *reviewing the PM's owner statement* (not eligible).
- *Market survey to set a renewal rent* (eligible) vs. *market survey to evaluate a purchase* (not eligible).

### 5.2 The capital-improvement interaction

When a time entry is linked to work classified as a capital improvement, `sh_eligible` flips to **false** regardless of category. Sourcing a contractor for a roof replacement is excluded; sourcing one for a drywall patch is not. This cross-field rule needs an explicit test.

### 5.3 Repair vs. improvement

Every expense tied to physical work gets classified at entry via a short guided prompt (3–4 questions, plain language, no tax jargon). Outcome is one of: `repair`, `improvement`, or `needs_review`.

When the result is `improvement`, run three checks and surface any that pass as a flag for the CPA — do not apply them automatically:
- Invoice amount at or under $2,500 (de minimis threshold)
- Work is recurring maintenance expected more than once over the property's life
- Small-taxpayer threshold based on the property's unadjusted basis

Store the user's answers to the guided questions alongside the classification. The reasoning trail is the point.

### 5.4 Enterprise grouping

Properties belong to an `enterprise`. The 250-hour test is evaluated at enterprise level, not per property. Residential and commercial cannot be mixed in one enterprise. Two conditions remove a property from an enterprise — flag them on the property record:
- Triple-net leased
- Personal use by the owner during the year

Default: all five properties in one residential enterprise. Make it changeable.

### 5.5 Trips

A trip generates up to three linked records:
1. **Mileage** — deductible, requires date, start, destination, miles, business purpose.
2. **Drive time** — logged, `sh_eligible = false`.
3. **On-site time** — categorized by the user, usually eligible.

A stop at a hardware store defaults to *Purchase of materials* (eligible). Do not let it default to travel.

### 5.6 Contractors

Contractor records carry a W-9-on-file boolean and a running total paid per calendar year. Any contractor over $600 in a year without a W-9 raises a persistent warning on the dashboard from October onward.

---

## 6. Data model

```
enterprises      id, name, property_type, tax_year_active
properties       id, enterprise_id, nickname, address, acquired_date,
                 unadjusted_basis, ownership_pct, is_self_managed,
                 is_triple_net, had_personal_use
actors           id, name, type (owner|spouse|pm|contractor|other),
                 w9_on_file, tax_id_collected
turns            id, property_id, vacancy_start, vacancy_end, status, notes
time_entries     id, date, property_id (nullable), enterprise_id, turn_id (nullable),
                 actor_id, minutes, category, description, sh_eligible (derived),
                 source (manual|geofence|imported), created_at
expenses         id, date, property_id, turn_id (nullable), amount, vendor,
                 schedule_e_category, capital_classification, classification_answers,
                 receipt_url, notes, allocation_rule (nullable)
trips            id, date, actor_id, origin, destination, miles, purpose,
                 property_id, drive_time_entry_id, onsite_time_entry_id
documents        id, property_id, type, file_url, effective_date
```

Notes:
- `time_entries.description` is required and must be free text. A category alone is not a record.
- `created_at` is the contemporaneity evidence. Never allow backdating without also preserving the true creation timestamp.
- Expenses shared across properties (insurance, umbrella policy) use `allocation_rule` to split. Keep the parent record intact.

---

## 7. Screens

1. **Dashboard** — enterprise hours gauge showing *eligible* hours against 250, with total-logged as a secondary number. YTD expenses. Count of items needing review. W-9 warnings in Q4.
2. **Quick log** — the app opens here on mobile. Three large buttons: Time, Expense, Trip. Target: a time entry in under 15 seconds.
3. **Inbox** — auto-captured trips awaiting categorization, receipts awaiting classification, `needs_review` items.
4. **Property detail** — ledger, hours, documents, contacts, open turn.
5. **Turn detail** — a container view. All expenses, hours, and trips for one make-ready, with running cost and days-vacant.
6. **Reports** — per-property Schedule E summary, time log grouped by actor and category, IRS-format mileage log, contractor payment summary. CSV and PDF.

**Design direction:** dense and fast, not decorative. Assume one-handed phone use in a parking lot or a hardware store aisle. Large tap targets, minimal typing, sensible defaults, no modal chains. Desktop view is for reports and cleanup.

---

## 8. Platform and technical direction

**Two clients, one backend. This is decided — do not re-litigate it.**

### 8.1 Android app (field capture)

Native Android only. **No iOS build, no App Store, no Play Store.** Distribution is a signed APK sideloaded onto two devices. Use Expo with a development/production build (not Expo Go, which cannot do background location).

This client owns:
- Background geofencing around the five properties plus hardware stores
- Activity recognition for drive start/stop detection
- Automatic mileage capture
- Dwell-time capture (arrival to departure at a geofenced location)
- Receipt photo capture
- Quick manual time entry

Constraints to handle explicitly:
- `ACCESS_BACKGROUND_LOCATION` is a separate permission from foreground since Android 11. Guide the user through granting "Allow all the time."
- OEM battery optimization kills background services. Detect this and prompt the user to set the app to Unrestricted. Motorola and Samsung are the aggressive offenders.
- One device is an older Moto — target a reasonable minimum SDK and degrade gracefully if activity recognition is unavailable, falling back to geofence-only detection.
- Use the Geofencing API rather than continuous location polling. Battery matters more than precision here.

### 8.2 Web app (desk work)

A responsive web client is a **first-class requirement, not an afterthought.** A large share of eligible hours happen at a laptop:

- Lease review and negotiation
- Verifying rent was received
- Market surveys for renewal pricing
- Bookkeeping and expense entry from statements
- Contractor sourcing and email negotiation

This client owns:
- Timer-based hour logging: start/stop with a category and description, running in a browser tab
- Bulk expense entry and receipt upload from desktop
- Editing and correcting anything captured in the field
- The inbox for reviewing auto-captured trips
- All reports and exports

The web timer is the primary entry method for desk work. Make it a persistent, visible element — a running timer the user forgets to stop is a worse failure than one they forget to start, so prompt on long-running timers and allow retroactive correction with the original `created_at` preserved.

Both spouses must be able to reach the web app from any device, including an iPhone browser, for viewing and light entry. Field capture is Android-only; everything else is platform-neutral.

### 8.3 Shared requirements

- One backend, one database. Both clients read and write the same records.
- Data exportable to CSV at any time. No lock-in.
- Receipt images stored durably alongside the expense record.
- Offline entry on Android with later sync. Properties have poor signal.
- Two-user auth, kept simple. No org/role hierarchy.
- Structure the code so domain logic (§5) lives in a shared layer used by both clients, not duplicated.

---

## 9. Milestones

**M1 — Web app, manual capture (build this first, ship it, I will use it)**
Backend and schema. Properties, actors, manual time entries with category and eligibility logic, the desk-work timer, manual expenses with receipt upload, manual mileage entry. Dashboard with the two hour totals. CSV export. Web only — no Android yet.

**M2 — Classification**
Repair-vs-improvement guided prompt, the three safe-harbor threshold flags, `needs_review` inbox, capital-improvement cross-rule on hours.

**M3 — Turns**
Turn as a container object, cost-per-turnover, days-vacant.

**M4 — Android client**
Signed APK, sideloaded. Manual entry parity with web, receipt camera, offline sync. No geofencing yet — prove the build and distribution pipeline first.

**M5 — Trip automation**
Geofencing, activity recognition, arrival/departure detection, the three-record trip split, hardware-store defaults, battery-optimization onboarding.

**M6 — Reports and year-end**
Schedule E per property, formatted time log, mileage log, contractor W-9 and payment summary, PDF output.

---

## 10. Acceptance criteria

- A time entry can be logged from the phone in under 15 seconds.
- Eligible and total hours never appear as a single merged number anywhere in the UI.
- No record exists without an attributed actor.
- Every expense linked to physical work has a capital classification or sits in `needs_review`.
- Year-end export produces, per property: income and expenses by Schedule E line; and per enterprise: a time log with date, hours, description, and person.
- All §5 rules have unit tests, including the capital-improvement cross-rule.

---

## 11. Start here

Read this brief, then before writing any code:
1. Propose a specific stack for the shared backend and the two clients, given §8. Keep ongoing cost low and avoid anything requiring a paid developer account.
2. List anything ambiguous that would change your design.
3. Propose the M1 file structure, with the shared domain layer separated so the Android client can reuse it at M4.

Then wait for my go-ahead.
