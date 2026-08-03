import Link from 'next/link';
import {
  formatCents,
  formatDateShort,
  formatMinutes,
  getHourCategory,
  getScheduleECategory,
  sumCents,
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
import { DeleteButton } from '@/components/DeleteButton';
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

/** A totals strip above each table, so the sum is visible without scrolling. */
function Totals({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="card card-pad grid gap-x-6 gap-y-1 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs text-[color:var(--color-muted)]">{item.label}</dt>
          <dd className="tnum text-base font-semibold">{item.value}</dd>
        </div>
      ))}
    </dl>
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
    listExpenses({ taxYear, limit: 1000 }),
    paidByExpenseInYear(taxYear),
  ]);

  if (expenses.length === 0) return <Empty what="expenses" href="/log/expense" year={taxYear} />;

  const invoiced = sumCents(expenses.map((e) => e.amountCents));
  const paidTotal = sumCents(expenses.map((e) => paid.get(e.id) ?? 0));

  return (
    <div className="grid gap-3">
      <Totals
        items={[
          { label: 'Rows', value: String(expenses.length) },
          { label: 'Invoiced', value: formatCents(invoiced) },
          { label: `Paid in ${taxYear}`, value: formatCents(paidTotal) },
          {
            label: 'Needs an answer',
            value: String(expenses.filter((e) => needsAnswer(e)).length),
          },
        ]}
      />

      <div className="table-wrap card">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Vendor</th>
              <th>Property</th>
              <th>Line</th>
              <th className="num">Invoiced</th>
              <th className="num">Paid</th>
              <th>Flags</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {expenses.map((expense) => {
              const paidCents = paid.get(expense.id) ?? 0;
              return (
                <tr key={expense.id}>
                  <td className="tnum whitespace-nowrap">{formatDateShort(expense.date)}</td>
                  <td>
                    <Link href={`/entries/expense/${expense.id}`}>{expense.vendor}</Link>
                  </td>
                  <td>
                    {expense.propertyId
                      ? (propertyNames.get(expense.propertyId) ?? '')
                      : 'Split'}
                  </td>
                  <td className="whitespace-nowrap">
                    {safeScheduleE(expense.scheduleECategory).label}
                  </td>
                  <td className="num">{formatCents(expense.amountCents)}</td>
                  {/* Different figures on purpose. They agree on most rows and
                      the ones where they do not are the point. */}
                  <td
                    className={
                      paidCents === expense.amountCents
                        ? 'num'
                        : 'num font-semibold text-[color:var(--color-flag-700)]'
                    }
                  >
                    {formatCents(paidCents)}
                  </td>
                  <td className="whitespace-nowrap">
                    {expense.capitalClassification === 'improvement' ? (
                      <span className="badge badge-not-eligible">Capital</span>
                    ) : null}
                    {needsAnswer(expense) ? (
                      <span className="badge badge-flag">Review</span>
                    ) : null}
                    {expense.jobId && jobTitles.get(expense.jobId) ? (
                      <Link href={`/jobs/${expense.jobId}`} className="badge badge-not-eligible">
                        Job
                      </Link>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap">
                    <Link href={`/entries/expense/${expense.id}`} className="btn btn-ghost text-xs">
                      Open
                    </Link>
                    <DeleteButton
                      what={`the ${formatCents(expense.amountCents)} expense from ${expense.vendor}`}
                      onDelete={async () => {
                        'use server';
                        await deleteExpenseAction(expense.id);
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function IncomeTable({
  taxYear,
  propertyNames,
}: {
  taxYear: number;
  propertyNames: Map<string, string>;
}) {
  const receipts = await listRentReceipts({ taxYear, limit: 1000 });
  if (receipts.length === 0) return <Empty what="rent records" href="/log/income" year={taxYear} />;

  return (
    <div className="grid gap-3">
      <Totals
        items={[
          { label: 'Rows', value: String(receipts.length) },
          {
            label: `Received in ${taxYear}`,
            value: formatCents(sumCents(receipts.map((r) => r.amountCents))),
          },
        ]}
      />
      <div className="table-wrap card">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Property</th>
              <th>Source</th>
              <th>Note</th>
              <th className="num">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {receipts.map((receipt) => (
              <tr key={receipt.id}>
                <td className="tnum whitespace-nowrap">{formatDateShort(receipt.date)}</td>
                <td>{propertyNames.get(receipt.propertyId) ?? ''}</td>
                <td className="whitespace-nowrap">{receipt.source.replace(/_/g, ' ')}</td>
                <td className="text-[color:var(--color-muted)]">{receipt.notes ?? ''}</td>
                <td className="num">{formatCents(receipt.amountCents)}</td>
                <td>
                  <DeleteButton
                    what={`the ${formatCents(receipt.amountCents)} rent record`}
                    onDelete={async () => {
                      'use server';
                      await deleteIncomeAction(receipt.id);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
  const entries = await listTimeEntries({ taxYear, limit: 1000 });
  if (entries.length === 0) return <Empty what="time entries" href="/log/time" year={taxYear} />;

  const total = entries.reduce((t, e) => t + e.minutes, 0);
  const eligible = entries.filter((e) => e.shEligible).reduce((t, e) => t + e.minutes, 0);

  return (
    <div className="grid gap-3">
      <Totals
        items={[
          { label: 'Entries', value: String(entries.length) },
          { label: 'Total logged', value: formatMinutes(total) },
          { label: 'Counts toward 250', value: formatMinutes(eligible) },
        ]}
      />
      <div className="table-wrap card">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>What</th>
              <th>Who</th>
              <th>Property</th>
              <th className="num">Time</th>
              <th>Counts</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="tnum whitespace-nowrap">{formatDateShort(entry.date)}</td>
                <td>
                  <Link href={`/entries/time/${entry.id}`}>{entry.description}</Link>
                  {entry.jobId && jobTitles.get(entry.jobId) ? (
                    <>
                      {' '}
                      <Link href={`/jobs/${entry.jobId}`} className="badge badge-not-eligible">
                        Job
                      </Link>
                    </>
                  ) : null}
                </td>
                <td className="whitespace-nowrap">
                  {actorNames.get(entry.actorId) ?? 'Unattributed'}
                </td>
                <td>{entry.propertyId ? (propertyNames.get(entry.propertyId) ?? '') : ''}</td>
                <td className="num">{formatMinutes(entry.minutes)}</td>
                <td className="whitespace-nowrap">
                  <span
                    className={entry.shEligible ? 'badge badge-eligible' : 'badge badge-not-eligible'}
                  >
                    {entry.shEligible ? 'Yes' : 'No'}
                  </span>
                </td>
                <td className="whitespace-nowrap">
                  <Link href={`/entries/time/${entry.id}`} className="btn btn-ghost text-xs">
                    Edit
                  </Link>
                  <DeleteButton
                    what={`this ${formatMinutes(entry.minutes)} entry`}
                    onDelete={async () => {
                      'use server';
                      await deleteTimeEntryAction(entry.id);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
  const trips = await listTrips({ taxYear, limit: 1000 });
  if (trips.length === 0) return <Empty what="trips" href="/log/trip" year={taxYear} />;

  const miles = trips.reduce((t, trip) => t + Number(trip.miles), 0);
  const acquisition = trips
    .filter((t) => t.costTreatmentOverride === 'acquisition')
    .reduce((t, trip) => t + Number(trip.miles), 0);

  return (
    <div className="grid gap-3">
      <Totals
        items={[
          { label: 'Trips', value: String(trips.length) },
          { label: 'Miles', value: miles.toFixed(1) },
          { label: 'Operating', value: (miles - acquisition).toFixed(1) },
          { label: 'Acquisition side', value: acquisition.toFixed(1) },
        ]}
      />
      <div className="table-wrap card">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Route</th>
              <th>Purpose</th>
              <th>Property</th>
              <th className="num">Miles</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {trips.map((trip) => (
              <tr key={trip.id}>
                <td className="tnum whitespace-nowrap">{formatDateShort(trip.date)}</td>
                <td className="whitespace-nowrap">
                  {trip.origin} → {trip.destination}
                </td>
                <td>
                  {trip.purpose}
                  {trip.jobId && jobTitles.get(trip.jobId) ? (
                    <>
                      {' '}
                      <Link href={`/jobs/${trip.jobId}`} className="badge badge-not-eligible">
                        Job
                      </Link>
                    </>
                  ) : null}
                </td>
                <td>{trip.propertyId ? (propertyNames.get(trip.propertyId) ?? '') : ''}</td>
                <td className="num">{Number(trip.miles).toFixed(1)}</td>
                <td>
                  <DeleteButton
                    what={`this ${Number(trip.miles)} mile trip and the time entries it created`}
                    onDelete={async () => {
                      'use server';
                      await deleteTripAction(trip.id);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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

/** Kept for the hour-category label if a future column needs it. */
export function safeCategory(id: string): string {
  try {
    return getHourCategory(id).label;
  } catch {
    return id;
  }
}
