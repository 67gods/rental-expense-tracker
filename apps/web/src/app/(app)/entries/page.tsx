import Link from 'next/link';
import {
  formatCents,
  formatDateShort,
  formatMinutes,
  getHourCategory,
  getScheduleECategory,
} from '@rental/domain';
import { requireUser } from '@/lib/session';
import { listTimeEntries } from '@/server/services/timeEntries';
import { listExpenses } from '@/server/services/expenses';
import { listTrips } from '@/server/services/trips';
import { listActors, listProperties, listRentReceipts } from '@/server/services/reference';
import { paidByExpenseInYear } from '@/server/services/payments';
import { deleteTimeEntryAction } from '@/app/actions/timeEntries';
import {
  deleteExpenseAction,
  deleteIncomeAction,
  deleteTripAction,
} from '@/app/actions/capture';
import { DataTable, type DataRow } from '@/components/DataTable';
import { AddRelated } from '@/components/AddRelated';
import { GroupIntoJob } from '@/components/GroupIntoJob';
import { listJobs, jobTitlesById } from '@/server/services/jobs';

export const metadata = { title: 'Entries' };

const SAVED_MESSAGES: Record<string, string> = {
  time: 'Time entry saved.',
  expense: 'Expense saved.',
  trip: 'Trip saved, along with the time it produced.',
  income: 'Rent recorded.',
  timer: 'Timer stopped and the entry saved.',
};

type Tab = 'time' | 'expenses' | 'trips' | 'income';

/**
 * Everything captured in a year, as a table you can scan.
 *
 * Two things this page got wrong for a long time.
 *
 * It had NO YEAR PICKER, so it always showed the signed-in year. Load 2025 and
 * sign in during 2026 and the whole year is invisible - the data is right there
 * in the database and the only way to see it was to download a CSV. That is the
 * opposite of what a review screen is for.
 *
 * And it rendered every record as a three-line card, which is fine for five
 * rows and unusable for eighty. Tables now, dense, with the numbers right
 * aligned so a column can be scanned rather than read. `.table-wrap` scrolls
 * sideways on a narrow screen, so the phone keeps working without the desktop
 * being padded out to match it.
 */
export default async function EntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; saved?: string; kind?: string; id?: string; year?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const tab: Tab = isTab(params.tab) ? params.tab : 'expenses';

  const requested = Number(params.year);
  const taxYear =
    Number.isInteger(requested) && requested > 1900 && requested < 3000
      ? requested
      : user.taxYear;

  const [properties, actors, jobTitles] = await Promise.all([
    listProperties(),
    listActors(),
    jobTitlesById(),
  ]);
  const propertyNames = new Map(properties.map((p) => [p.id, p.nickname]));
  const actorNames = new Map(actors.map((a) => [a.id, a.name]));

  const justSaved = isGroupable(params.kind) && params.id ? params.kind : null;
  const years = [user.taxYear, user.taxYear - 1, user.taxYear - 2];
  if (!years.includes(taxYear)) years.unshift(taxYear);

  const link = (next: Partial<{ tab: string; year: number }>) =>
    `/entries?tab=${next.tab ?? tab}&year=${next.year ?? taxYear}`;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">Entries · {taxYear}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="chip-row" aria-label="Tax year">
            {years.map((year) => (
              <a
                key={year}
                href={link({ year })}
                className={year === taxYear ? 'chip chip-on' : 'chip'}
              >
                {year}
              </a>
            ))}
          </nav>
          <Link href="/jobs" className="btn btn-ghost">
            Jobs
          </Link>
        </div>
      </div>

      {params.saved && SAVED_MESSAGES[params.saved] ? (
        <p
          role="status"
          className="rounded-lg border border-[color:var(--color-eligible-500)] bg-[color:var(--color-eligible-50)] p-3 text-sm text-[color:var(--color-eligible-700)]"
        >
          {SAVED_MESSAGES[params.saved]}
        </p>
      ) : null}

      {justSaved && params.id ? <AddRelated kind={justSaved} recordId={params.id} /> : null}

      <nav className="chip-row" aria-label="Entry type">
        {(
          [
            ['expenses', 'Expenses'],
            ['income', 'Rent'],
            ['time', 'Time'],
            ['trips', 'Trips'],
          ] as const
        ).map(([key, label]) => (
          <a key={key} href={link({ tab: key })} className={tab === key ? 'chip chip-on' : 'chip'}>
            {label}
          </a>
        ))}
      </nav>

      {tab === 'expenses' ? (
        <ExpenseTable taxYear={taxYear} propertyNames={propertyNames} jobTitles={jobTitles} />
      ) : null}
      {tab === 'income' ? <IncomeTable taxYear={taxYear} propertyNames={propertyNames} /> : null}
      {tab === 'time' ? (
        <TimeTable
          taxYear={taxYear}
          propertyNames={propertyNames}
          actorNames={actorNames}
          jobTitles={jobTitles}
        />
      ) : null}
      {tab === 'trips' ? (
        <TripTable taxYear={taxYear} propertyNames={propertyNames} jobTitles={jobTitles} />
      ) : null}

      {tab === 'income' ? null : <Grouping tab={tab} taxYear={taxYear} />}
    </div>
  );
}

async function ExpenseTable({
  taxYear,
  propertyNames,
  jobTitles,
}: {
  taxYear: number;
  propertyNames: Map<string, string>;
  jobTitles: Map<string, string>;
}) {
  const [expenses, paid] = await Promise.all([
    listExpenses({ taxYear, limit: 5000 }),
    paidByExpenseInYear(taxYear),
  ]);

  if (expenses.length === 0) return <Empty what="expenses" href="/log/expense" year={taxYear} />;

  // Shaped on the server into plain rows: display text, sort keys and the
  // figures the totals sum. The client component stays dumb and fast, and
  // nothing but serialisable data crosses the boundary.
  const rows: DataRow[] = expenses.map((e) => {
    const paidCents = paid.get(e.id) ?? 0;
    const line = safeScheduleE(e.scheduleECategory);
    const property = e.propertyId ? (propertyNames.get(e.propertyId) ?? '') : 'Split';
    const badges = [];
    if (e.capitalClassification === 'improvement') badges.push({ label: 'Capital', tone: 'muted' as const });
    if (needsAnswer(e)) badges.push({ label: 'Review', tone: 'flag' as const });
    if (e.jobId && jobTitles.get(e.jobId)) {
      badges.push({ label: 'Job', tone: 'muted' as const, href: `/jobs/${e.jobId}` });
    }

    return {
      id: e.id,
      href: `/entries/expense/${e.id}`,
      cells: {
        date: e.date,
        vendor: e.vendor,
        property,
        line: line.label,
        invoiced: formatCents(e.amountCents),
        paid: formatCents(paidCents),
      },
      sort: {
        date: e.date,
        vendor: e.vendor.toLowerCase(),
        property,
        line: line.label,
        invoiced: e.amountCents,
        paid: paidCents,
      },
      numeric: { invoiced: e.amountCents, paid: paidCents },
      search: [e.vendor, property, line.label, e.notes ?? ''].join(' ').toLowerCase(),
      badges,
      // The one row where the two disagree is the one worth seeing.
      highlight: paidCents === e.amountCents ? [] : ['paid'],
      deleteLabel: `the ${formatCents(e.amountCents)} expense from ${e.vendor}`,
    };
  });

  return (
    <DataTable
      rows={rows}
      searchPlaceholder="Vendor, note, category…"
      columns={[
        { key: 'date', header: 'Date', nowrap: true },
        { key: 'vendor', header: 'Vendor', isLink: true },
        { key: 'property', header: 'Property' },
        { key: 'line', header: 'Line', nowrap: true },
        { key: 'invoiced', header: 'Invoiced', numeric: true },
        { key: 'paid', header: `Paid in ${taxYear}`, numeric: true },
      ]}
      facets={[
        { key: 'property', label: 'Property' },
        { key: 'line', label: 'Schedule E line' },
      ]}
      totals={[
        { key: '_count', label: 'Rows', count: true },
        { key: 'invoiced', label: 'Invoiced', money: true },
        { key: 'paid', label: `Paid in ${taxYear}`, money: true },
      ]}
      onDelete={deleteExpenseAction}
    />
  );
}

async function IncomeTable({
  taxYear,
  propertyNames,
}: {
  taxYear: number;
  propertyNames: Map<string, string>;
}) {
  const receipts = await listRentReceipts({ taxYear, limit: 5000 });
  if (receipts.length === 0) return <Empty what="rent records" href="/log/income" year={taxYear} />;

  const rows: DataRow[] = receipts.map((r) => {
    const property = propertyNames.get(r.propertyId) ?? '';
    const source = r.source.replace(/_/g, ' ');
    return {
      id: r.id,
      cells: {
        date: r.date,
        property,
        source,
        note: r.notes ?? '',
        amount: formatCents(r.amountCents),
      },
      sort: { date: r.date, property, source, note: r.notes ?? '', amount: r.amountCents },
      numeric: { amount: r.amountCents },
      search: [property, source, r.notes ?? ''].join(' ').toLowerCase(),
      deleteLabel: `the ${formatCents(r.amountCents)} rent record`,
    };
  });

  return (
    <DataTable
      rows={rows}
      searchPlaceholder="Property, source, note…"
      columns={[
        { key: 'date', header: 'Date', nowrap: true },
        { key: 'property', header: 'Property' },
        { key: 'source', header: 'Source', nowrap: true },
        { key: 'note', header: 'Note' },
        { key: 'amount', header: 'Amount', numeric: true },
      ]}
      facets={[
        { key: 'property', label: 'Property' },
        { key: 'source', label: 'Source' },
      ]}
      totals={[
        { key: '_count', label: 'Rows', count: true },
        { key: 'amount', label: `Received in ${taxYear}`, money: true },
      ]}
      onDelete={deleteIncomeAction}
    />
  );
}

async function TimeTable({
  taxYear,
  propertyNames,
  actorNames,
  jobTitles,
}: {
  taxYear: number;
  propertyNames: Map<string, string>;
  actorNames: Map<string, string>;
  jobTitles: Map<string, string>;
}) {
  const entries = await listTimeEntries({ taxYear, limit: 5000 });
  if (entries.length === 0) return <Empty what="time entries" href="/log/time" year={taxYear} />;

  const rows: DataRow[] = entries.map((e) => {
    const who = actorNames.get(e.actorId) ?? 'Unattributed';
    const property = e.propertyId ? (propertyNames.get(e.propertyId) ?? '') : '';
    const category = safeCategory(e.category);
    const counts = e.shEligible ? 'Yes' : 'No';
    const badges =
      e.jobId && jobTitles.get(e.jobId)
        ? [{ label: 'Job', tone: 'muted' as const, href: `/jobs/${e.jobId}` }]
        : [];

    return {
      id: e.id,
      href: `/entries/time/${e.id}`,
      cells: {
        date: e.date,
        description: e.description,
        who,
        property,
        category,
        time: formatMinutes(e.minutes),
        counts,
      },
      // Sorted on MINUTES, not on the formatted string - otherwise "1h 30m"
      // sorts before "45m" because it starts with a one.
      sort: {
        date: e.date,
        description: e.description.toLowerCase(),
        who,
        property,
        category,
        time: e.minutes,
        counts,
      },
      numeric: { minutes: e.minutes, eligible: e.shEligible ? e.minutes : 0 },
      search: [e.description, who, property, category].join(' ').toLowerCase(),
      badges,
      deleteLabel: `this ${formatMinutes(e.minutes)} entry`,
    };
  });

  return (
    <DataTable
      rows={rows}
      searchPlaceholder="What you did, who, property…"
      columns={[
        { key: 'date', header: 'Date', nowrap: true },
        { key: 'description', header: 'What', isLink: true },
        { key: 'who', header: 'Who', nowrap: true },
        { key: 'property', header: 'Property' },
        { key: 'category', header: 'Category', nowrap: true },
        { key: 'time', header: 'Time', numeric: true },
        { key: 'counts', header: 'Counts', nowrap: true },
      ]}
      facets={[
        { key: 'who', label: 'Who' },
        { key: 'property', label: 'Property' },
        { key: 'category', label: 'Category' },
        { key: 'counts', label: 'Counts toward 250' },
      ]}
      totals={[
        { key: '_count', label: 'Entries', count: true },
        { key: 'minutes', label: 'Minutes logged' },
        { key: 'eligible', label: 'Minutes counting' },
      ]}
      onDelete={deleteTimeEntryAction}
    />
  );
}

async function TripTable({
  taxYear,
  propertyNames,
  jobTitles,
}: {
  taxYear: number;
  propertyNames: Map<string, string>;
  jobTitles: Map<string, string>;
}) {
  const trips = await listTrips({ taxYear, limit: 5000 });
  if (trips.length === 0) return <Empty what="trips" href="/log/trip" year={taxYear} />;

  const rows: DataRow[] = trips.map((t) => {
    const miles = Number(t.miles);
    const property = t.propertyId ? (propertyNames.get(t.propertyId) ?? '') : 'Portfolio';
    const treatment = t.costTreatmentOverride === 'acquisition' ? 'Acquisition' : 'Operating';
    const badges =
      t.jobId && jobTitles.get(t.jobId)
        ? [{ label: 'Job', tone: 'muted' as const, href: `/jobs/${t.jobId}` }]
        : [];

    return {
      id: t.id,
      cells: {
        date: t.date,
        route: `${t.origin} → ${t.destination}`,
        purpose: t.purpose,
        property,
        treatment,
        miles: miles.toFixed(1),
      },
      sort: {
        date: t.date,
        route: t.origin.toLowerCase(),
        purpose: t.purpose.toLowerCase(),
        property,
        treatment,
        miles,
      },
      numeric: {
        miles,
        operating: treatment === 'Operating' ? miles : 0,
        acquisition: treatment === 'Acquisition' ? miles : 0,
      },
      search: [t.origin, t.destination, t.purpose, property].join(' ').toLowerCase(),
      badges,
      deleteLabel: `this ${miles.toFixed(1)} mile trip and the time entries it created`,
    };
  });

  return (
    <DataTable
      rows={rows}
      searchPlaceholder="Where you went, why…"
      columns={[
        { key: 'date', header: 'Date', nowrap: true },
        { key: 'route', header: 'Route', nowrap: true },
        { key: 'purpose', header: 'Purpose' },
        { key: 'property', header: 'Property' },
        { key: 'treatment', header: 'Side', nowrap: true },
        { key: 'miles', header: 'Miles', numeric: true },
      ]}
      facets={[
        { key: 'property', label: 'Property' },
        { key: 'treatment', label: 'Cost treatment' },
      ]}
      totals={[
        { key: '_count', label: 'Trips', count: true },
        { key: 'miles', label: 'Miles' },
        { key: 'operating', label: 'Operating' },
        { key: 'acquisition', label: 'Acquisition side' },
      ]}
      onDelete={deleteTripAction}
    />
  );
}

async function Grouping({ tab, taxYear }: { tab: Exclude<Tab, 'income'>; taxYear: number }) {
  const jobs = await listJobs({ limit: 100 });
  const existingJobs = jobs.map((j) => ({ id: j.id, title: j.title }));

  if (tab === 'time') {
    const entries = await listTimeEntries({ taxYear, limit: 100 });
    if (entries.length === 0) return null;
    return (
      <GroupIntoJob
        field="timeEntryIds"
        existingJobs={existingJobs}
        records={entries.map((e) => ({
          id: e.id,
          title: e.description,
          meta: `${formatDateShort(e.date)} · ${formatMinutes(e.minutes)}`,
        }))}
      />
    );
  }

  if (tab === 'expenses') {
    const rows = await listExpenses({ taxYear, limit: 100 });
    if (rows.length === 0) return null;
    return (
      <GroupIntoJob
        field="expenseIds"
        existingJobs={existingJobs}
        records={rows.map((e) => ({
          id: e.id,
          title: e.vendor,
          meta: `${formatDateShort(e.date)} · ${formatCents(e.amountCents)}`,
        }))}
      />
    );
  }

  const rows = await listTrips({ taxYear, limit: 100 });
  if (rows.length === 0) return null;
  return (
    <GroupIntoJob
      field="tripIds"
      existingJobs={existingJobs}
      records={rows.map((t) => ({
        id: t.id,
        title: `${t.origin} → ${t.destination}`,
        meta: `${formatDateShort(t.date)} · ${Number(t.miles)} mi`,
      }))}
    />
  );
}

function Empty({ what, href, year }: { what: string; href: string; year: number }) {
  return (
    <div className="card p-6 text-center">
      <p className="hint">No {what} in {year}.</p>
      <p className="hint mt-1">
        If you were expecting some, check the year above — records live in the year they
        happened, not the year you are signed in to.
      </p>
      <Link href={href} className="btn mt-3">
        Add one
      </Link>
    </div>
  );
}

function needsAnswer(expense: {
  capitalClassification: string | null;
  scheduleECategory: string;
}): boolean {
  return (
    expense.capitalClassification === 'needs_review' ||
    (expense.capitalClassification == null &&
      safeScheduleE(expense.scheduleECategory).triggersCapitalPrompt)
  );
}

function isTab(value: string | undefined): value is Tab {
  return value === 'time' || value === 'expenses' || value === 'trips' || value === 'income';
}

/** The three kinds a job can hold. Rent is deliberately not one of them. */
function isGroupable(value: string | undefined): value is 'time' | 'trip' | 'expense' {
  return value === 'time' || value === 'trip' || value === 'expense';
}

function safeScheduleE(id: string) {
  try {
    return getScheduleECategory(id);
  } catch {
    return { label: id, triggersCapitalPrompt: false } as const;
  }
}

/**
 * Not exported: a route file may only export the handful of names Next
 * recognises, and anything else fails the build with a type error about an
 * index signature rather than saying so.
 */
function safeCategory(id: string): string {
  try {
    return getHourCategory(id).label;
  } catch {
    return id;
  }
}
