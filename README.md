# Rental Property Operations Tracker

Expenses, hours, mileage, and time on site for a five-property household portfolio.

Milestone 1: the web app with manual capture. Android field capture lands at M4.

---

## What this is

Four things were going unrecorded — expenses, hours, mileage, and the productive
time at each stop. This app captures all four fast enough that it actually
happens, and exports clean per-property figures at year end.

What it does **not** do: it never tells you what to claim. It classifies, flags,
and exports. Anything uncertain is flagged for your CPA rather than resolved
automatically.

---

## Setup

You need four free accounts. None require a paid developer plan. Budget about
30 minutes for the first run.

### 1. Install

```bash
npm install
cp .env.example .env.local
```

### 2. Database — Neon (free)

1. Create a project at [neon.tech](https://neon.tech).
2. From the dashboard, copy **both** connection strings into `.env.local`:
   - the **pooled** one → `DATABASE_URL`
   - the **direct / unpooled** one → `DATABASE_URL_UNPOOLED`

   Migrations need the direct connection; the pooled endpoint cannot run schema
   changes.

3. Create the tables:

   ```bash
   npm run db:migrate
   npm run db:seed      # optional: five placeholder properties to rename
   ```

### 3. Sign-in — Google OAuth (free)

1. In the [Google Cloud Console](https://console.cloud.google.com), create a
   project, then **APIs & Services → Credentials → Create OAuth client ID →
   Web application**.
2. Add these authorised redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://YOUR-APP.vercel.app/api/auth/callback/google` (after deploying)
3. Copy the client ID and secret into `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
4. Generate a session secret:

   ```bash
   npx auth secret
   ```

5. Put both of your Google addresses in `ALLOWED_EMAILS`, comma separated.
   **Nobody else can sign in.** That list is the entire access model, so an empty
   list locks everyone out rather than letting everyone in.

### 4. Receipt storage — AWS S3

1. Create a bucket. Keep **Block all public access ON** — these are tax records,
   and a guessable URL is not an access model. The app serves receipts through
   short-lived signed URLs.
2. Add a CORS rule so the browser can upload straight to the bucket:

   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedOrigins": ["http://localhost:3000", "https://YOUR-APP.vercel.app"],
       "ExposeHeaders": ["ETag"]
     }
   ]
   ```

3. Create an IAM user with `s3:PutObject` and `s3:GetObject` on that bucket only,
   and put its keys in `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.

### 5. Timezone

Set `APP_TIMEZONE` to your IANA zone, e.g. `America/New_York`.

Every business date is anchored to this zone. Work logged at 8pm on 31 December
has to stay in that tax year, which it would not if dates were stored as UTC
instants. **Set this once, before entering data** — changing it later moves
entries near midnight between days.

### 6. Run it

```bash
npm run dev          # http://localhost:3000
```

### 7. Deploy — Vercel (free)

Import the repo, set the root directory to `apps/web`, paste the same
environment variables, and deploy. Then update `AUTH_URL` to your Vercel URL and
add that URL to both the Google redirect URIs and the S3 CORS rule.

---

## Daily use

| You are | Use |
|---|---|
| At a property or a hardware store | **Log** → Time, Expense, or Trip |
| At a laptop doing desk work | **Start a timer** — it survives closing the tab |
| Reviewing what got captured | **Entries** — edit or delete anything |
| Year end | **Reports** — six CSVs for your CPA |

**Log a trip, not just mileage.** A trip records the miles, the drive time, and
the time you actually worked once you arrived. That third one is usually the
part that counts, and folding it into the drive loses it.

**Two accounts, never one.** Hours are counted per person and cannot be pooled
between spouses for some tests. A merged log cannot be separated afterwards, so
each of you signs in as yourself.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the web app |
| `npm test` | Run the tax-logic test suite |
| `npm run typecheck` | Typecheck both workspaces |
| `npm run build` | Production build |
| `npm run verify` | Typecheck, test, and build |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:generate` | Generate a migration after a schema change |
| `npm run db:seed` | Add placeholder properties |
| `npm run db:check` | Audit the data and report problems |

---

## How the code is arranged

```
packages/domain/     Tax and operations rules. No I/O, no framework.
                     The Android client imports this unchanged at M4.
  src/constants/     Hour categories, Schedule E lines, statutory thresholds
  src/rules/         Eligibility, enterprise grouping, allocation,
                     contractors, trips
  src/totals/        Hours rollups
  test/              143 tests covering every rule

apps/web/            The web UI and the shared backend
  src/app/(app)/     Signed-in screens
  src/app/api/v1/    REST surface the Android client reuses at M4
  src/server/        Services — the only place that writes
  src/db/            Schema, migrations, seed, integrity audit
```

**Every rule lives in `packages/domain` and nowhere else.** Eligibility is
derived at write time on the server and is never accepted from a client, so no
client can set it — correctly or otherwise. That is what will keep the phone and
the laptop agreeing on one number at year end.

---

## Decisions worth knowing

**Money is integer cents everywhere.** Never floating-point dollars. Amounts are
parsed off the decimal digits rather than multiplied by 100, because `1.005 *
100` is `100.49999…` in binary floating point and would read $1.005 as $1.00.

**`created_at` is set by the database and never updated.** `date` is what you say
happened; `created_at` is when you said it. Logging Saturday's work on Monday is
fine and is recorded as such — a contemporaneous record and a reconstructed one
are different evidence, and the difference has to survive.

**Eligible and total hours are never merged.** Not in the UI, not in the export,
not in the code. The rollup returns both figures together and has no single
"hours" field to grab by mistake.

**Shared expenses keep their parent record.** An insurance premium covering five
properties stays one row matching one receipt. The split is derived at report
time and reconciles to the penny.

**Mileage carries no dollar figure.** The log exports dates, endpoints, miles,
and business purpose. Your CPA applies the rate — the app does not assert one.

---

## What is not built yet

Deliberately, per the milestone plan:

- **M2** — the guided repair-vs-improvement questions and the three safe-harbor
  threshold flags. Expenses on physical work are currently flagged as needing an
  answer, so an unfinished entry does not look finished.
- **M3** — turns as a container, cost per turnover, days vacant. The table exists;
  there is no UI.
- **M4** — the Android client. `/api/v1` is already built against this.
- **M5** — geofencing and automatic trip capture.
- **M6** — PDF output. CSV works today.
