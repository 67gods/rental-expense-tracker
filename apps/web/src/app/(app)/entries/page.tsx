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
import {
  listActors,
  listProperties,
  listRentReceipts,
} from '@/server/services/reference';
import { deleteTimeEntryAction } from '@/app/actions/timeEntries';
import {
  deleteExpenseAction,
  deleteIncomeAction,
  deleteTripAction,
} from '@/app/actions/capture';
import { DeleteButton } from '@/components/DeleteButton';

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
 * Everything captured this year, for review and correction (§8.2: editing and
 * correcting anything captured in the field is a desk-side job).
 */
export default async function EntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; saved?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const tab: Tab = isTab(params.tab) ? params.tab : 'time';

  const [properties, actors] = await Promise.all([listProperties(), listActors()]);
  const propertyNames = new Map(properties.map((p) => [p.id, p.nickname]));
  const actorNames = new Map(actors.map((a) => [a.id, a.name]));

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-bold tracking-tight">Entries · {user.taxYear}</h1>

      {params.saved && SAVED_MESSAGES[params.saved] ? (
        <p
          role="status"
          className="rounded-lg border border-[color:var(--color-eligible-500)] bg-[color:var(--color-eligible-50)] p-3 text-sm text-[color:var(--color-eligible-700)]"
        >
          {SAVED_MESSAGES[params.saved]}
        </p>
      ) : null}

      <nav className="chip-row" aria-label="Entry type">
        {(
          [
            ['time', 'Time'],
            ['expenses', 'Expenses'],
            ['trips', 'Trips'],
            ['income', 'Rent'],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={`/entries?tab=${key}`}
            className={tab === key ? 'chip chip-on' : 'chip'}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="card">
        {tab === 'time' ? (
          <TimeList taxYear={user.taxYear} names={{ propertyNames, actorNames }} />
        ) : null}
        {tab === 'expenses' ? (
          <ExpenseList taxYear={user.taxYear} propertyNames={propertyNames} />
        ) : null}
        {tab === 'trips' ? <TripList taxYear={user.taxYear} propertyNames={propertyNames} /> : null}
        {tab === 'income' ? (
          <IncomeList taxYear={user.taxYear} propertyNames={propertyNames} />
        ) : null}
      </div>
    </div>
  );
}

async function TimeList({
  taxYear,
  names,
}: {
  taxYear: number;
  names: { propertyNames: Map<string, string>; actorNames: Map<string, string> };
}) {
  const entries = await listTimeEntries({ taxYear, limit: 300 });
  if (entries.length === 0) return <Empty what="time entries" href="/log/time" />;

  return (
    <ul>
      {entries.map((entry) => (
        <li key={entry.id} className="row">
          <div className="row-main">
            <p className="row-title">{entry.description}</p>
            <p className="row-meta">
              {formatDateShort(entry.date)} · {safeCategory(entry.category)} ·{' '}
              {names.actorNames.get(entry.actorId) ?? 'Unattributed'}
              {entry.propertyId ? ` · ${names.propertyNames.get(entry.propertyId) ?? ''}` : ''}
              {entry.isBackdated ? ' · logged later' : ''}
            </p>
            <p className="mt-1 flex flex-wrap gap-1.5">
              <span className={entry.shEligible ? 'badge badge-eligible' : 'badge badge-not-eligible'}>
                {entry.shEligible ? 'Eligible' : 'Not eligible'}
              </span>
              {entry.isProvisional ? (
                <span className="badge badge-flag">Depends on a classification</span>
              ) : null}
              {entry.source === 'timer' ? <span className="badge badge-not-eligible">Timer</span> : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="row-value">{formatMinutes(entry.minutes)}</span>
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
          </div>
        </li>
      ))}
    </ul>
  );
}

async function ExpenseList({
  taxYear,
  propertyNames,
}: {
  taxYear: number;
  propertyNames: Map<string, string>;
}) {
  const expenses = await listExpenses({ taxYear, limit: 300 });
  if (expenses.length === 0) return <Empty what="expenses" href="/log/expense" />;

  return (
    <ul>
      {expenses.map((expense) => {
        const line = safeScheduleE(expense.scheduleECategory);
        const needsAnswer =
          expense.capitalClassification === 'needs_review' ||
          (expense.capitalClassification == null && line.triggersCapitalPrompt);

        return (
          <li key={expense.id} className="row">
            <div className="row-main">
              <p className="row-title">{expense.vendor}</p>
              <p className="row-meta">
                {formatDateShort(expense.date)} · {line.label}
                {expense.propertyId
                  ? ` · ${propertyNames.get(expense.propertyId) ?? ''}`
                  : ' · split'}
              </p>
              <p className="mt-1 flex flex-wrap gap-1.5">
                {expense.capitalClassification === 'repair' ? (
                  <span className="badge badge-eligible">Repair</span>
                ) : null}
                {expense.capitalClassification === 'improvement' ? (
                  <span className="badge badge-not-eligible">Improvement</span>
                ) : null}
                {needsAnswer ? <span className="badge badge-flag">Needs review</span> : null}
                {expense.receiptKey ? (
                  <span className="badge badge-not-eligible">Receipt</span>
                ) : null}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="row-value">{formatCents(expense.amountCents)}</span>
              <DeleteButton
                what={`the ${formatCents(expense.amountCents)} expense from ${expense.vendor}`}
                onDelete={async () => {
                  'use server';
                  await deleteExpenseAction(expense.id);
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

async function TripList({
  taxYear,
  propertyNames,
}: {
  taxYear: number;
  propertyNames: Map<string, string>;
}) {
  const trips = await listTrips({ taxYear, limit: 300 });
  if (trips.length === 0) return <Empty what="trips" href="/log/trip" />;

  return (
    <ul>
      {trips.map((trip) => (
        <li key={trip.id} className="row">
          <div className="row-main">
            <p className="row-title">
              {trip.origin} → {trip.destination}
            </p>
            <p className="row-meta">
              {formatDateShort(trip.date)} · {trip.purpose}
              {trip.propertyId ? ` · ${propertyNames.get(trip.propertyId) ?? ''}` : ''}
            </p>
            <p className="mt-1 flex flex-wrap gap-1.5">
              {trip.driveTimeEntryId ? (
                <span className="badge badge-not-eligible">Drive time logged</span>
              ) : null}
              {trip.onsiteTimeEntryId ? (
                <span className="badge badge-eligible">On-site time logged</span>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="row-value">{Number(trip.miles)} mi</span>
            <DeleteButton
              what={`this ${Number(trip.miles)} mile trip and the time entries it created`}
              onDelete={async () => {
                'use server';
                await deleteTripAction(trip.id);
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

async function IncomeList({
  taxYear,
  propertyNames,
}: {
  taxYear: number;
  propertyNames: Map<string, string>;
}) {
  const receipts = await listRentReceipts({ taxYear, limit: 300 });
  if (receipts.length === 0) return <Empty what="rent records" href="/log/income" />;

  return (
    <ul>
      {receipts.map((receipt) => (
        <li key={receipt.id} className="row">
          <div className="row-main">
            <p className="row-title">{propertyNames.get(receipt.propertyId) ?? 'Unknown'}</p>
            <p className="row-meta">
              {formatDateShort(receipt.date)} · {receipt.source.replace(/_/g, ' ')}
              {receipt.notes ? ` · ${receipt.notes}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="row-value">{formatCents(receipt.amountCents)}</span>
            <DeleteButton
              what={`the ${formatCents(receipt.amountCents)} rent record`}
              onDelete={async () => {
                'use server';
                await deleteIncomeAction(receipt.id);
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Empty({ what, href }: { what: string; href: string }) {
  return (
    <div className="p-6 text-center">
      <p className="hint">No {what} yet this year.</p>
      <Link href={href} className="btn mt-3">
        Add one
      </Link>
    </div>
  );
}

function isTab(value: string | undefined): value is Tab {
  return value === 'time' || value === 'expenses' || value === 'trips' || value === 'income';
}

function safeCategory(id: string): string {
  try {
    return getHourCategory(id).label;
  } catch {
    return id;
  }
}

function safeScheduleE(id: string) {
  try {
    return getScheduleECategory(id);
  } catch {
    return { label: id, triggersCapitalPrompt: false } as const;
  }
}
