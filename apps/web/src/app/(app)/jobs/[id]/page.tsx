import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  formatCents,
  formatDateShort,
  formatMinutes,
  getHourCategory,
  getScheduleECategory,
} from '@rental/domain';
import { requireUser } from '@/lib/session';
import { getJobWithChildren } from '@/server/services/jobs';
import { listProperties } from '@/server/services/reference';
import { NotFoundError } from '@/server/errors';
import { AddToJob } from '@/components/AddRelated';
import { DeleteButton } from '@/components/DeleteButton';
import { deleteJobAction, removeFromJobAction } from '@/app/actions/jobs';

export const metadata = { title: 'Job' };

/**
 * One job, its records, and a rollup derived at read time.
 *
 * NOTHING IN THE ROLLUP IS STORED. Ask for 2025 and 2026 and the same five
 * records can answer differently, which is the entire reason the job header
 * carries no category, no amount, and no tax field. Everything tax-shaped lives
 * on the children, so the dissection is free.
 */
export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; saved?: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const query = await searchParams;

  const requested = Number(query.year);
  const taxYear =
    Number.isInteger(requested) && requested > 1900 && requested < 3000 ? requested : undefined;

  let job;
  try {
    job = await getJobWithChildren(id, taxYear);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const properties = await listProperties();
  const propertyNames = new Map(properties.map((p) => [p.id, p.nickname]));
  const { rollup } = job;

  const years = [rollup.taxYear - 1, rollup.taxYear, rollup.taxYear + 1];

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <Link href="/jobs" className="btn">
          ← Jobs
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{job.job.title}</h1>
      </div>

      {query.saved ? (
        <p
          role="status"
          className="rounded-lg border border-[color:var(--color-eligible-500)] bg-[color:var(--color-eligible-50)] p-3 text-sm pos"
        >
          Saved and added to this job.
        </p>
      ) : null}

      <p className="hint">
        {job.job.propertyId
          ? (propertyNames.get(job.job.propertyId) ?? 'Unknown property')
          : 'Portfolio-wide'}{' '}
        · {rollup.recordCount} {rollup.recordCount === 1 ? 'record' : 'records'}
      </p>

      <div className="panel panel-body">
        <p style={{fontWeight:500}}>Add to this job</p>
        <p className="hint">Opens the ordinary form with the job carried across.</p>
        <div className="mt-3">
          <AddToJob jobId={job.job.id} />
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Rolled up under {rollup.taxYear} rules</h2>
          <nav className="seg" aria-label="Tax year">
            {years.map((year) => (
              <a
                key={year}
                href={`/jobs/${job.job.id}?year=${year}`}
                className={year === rollup.taxYear ? 'chip chip-accent' : 'chip'}
              >
                {year}
              </a>
            ))}
          </nav>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="panel panel-body">
            <h3 className="section-title">Time</h3>
            <p className="num mt-1 text-xl font-bold">
              {formatMinutes(rollup.eligibleMinutes)}
            </p>
            <p className="hint">eligible</p>
            <p className="num mt-2 text-sm font-semibold">
              {formatMinutes(rollup.totalMinutes)}
            </p>
            <p className="hint">total logged</p>
          </div>

          <div className="panel panel-body">
            <h3 className="section-title">Miles</h3>
            <p className="num mt-1 text-xl font-bold">{rollup.totalMiles}</p>
            <p className="hint">
              {rollup.acquisitionMiles > 0
                ? `${rollup.operatingMiles} operating · ${rollup.acquisitionMiles} acquisition`
                : 'all operating'}
            </p>
          </div>

          <div className="panel panel-body">
            <h3 className="section-title">Money</h3>
            <p className="num mt-1 text-xl font-bold">
              {formatCents(rollup.paidInYearCents)}
            </p>
            <p className="hint">paid in {rollup.taxYear}</p>
            <p className="num mt-2 text-sm font-semibold">
              {formatCents(rollup.invoicedCents)}
            </p>
            <p className="hint">
              invoiced
              {rollup.outstandingCents > 0
                ? ` · ${formatCents(rollup.outstandingCents)} outstanding`
                : ''}
            </p>
          </div>
        </div>

        <p className="hint mt-2">
          None of this is stored. Change the year above and the same records answer
          differently, which is why the job itself carries no figures.
        </p>
      </section>

      {/* ------------------------------------------------------------- */}
      {job.timeEntries.length > 0 ? (
        <section>
          <h2 className="section-title">Time</h2>
          <ul className="tablebox">
            {job.timeEntries.map((entry) => (
              <li key={entry.id} className="kv">
                <div className="">
                  <p style={{fontWeight:500}}>{entry.description}</p>
                  <p className="hint">
                    {formatDateShort(entry.date)} · {safeHour(entry.category)}
                  </p>
                  <p className="mt-1">
                    <span
                      className={
                        entry.shEligible ? 'tag tag-pos' : 'tag tag-muted'
                      }
                    >
                      {entry.shEligible ? 'Eligible' : 'Not eligible'}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="num">{formatMinutes(entry.minutes)}</span>
                  <RemoveButton kind="time" id={entry.id} label={entry.description} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {job.trips.length > 0 ? (
        <section>
          <h2 className="section-title">Trips</h2>
          <ul className="tablebox">
            {job.trips.map((trip) => (
              <li key={trip.id} className="kv">
                <div className="">
                  <p style={{fontWeight:500}}>
                    {trip.origin} → {trip.destination}
                  </p>
                  <p className="hint">
                    {formatDateShort(trip.date)} · {trip.purpose}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="num">{Number(trip.miles)} mi</span>
                  <RemoveButton kind="trip" id={trip.id} label={`the ${trip.miles} mile trip`} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {job.expenses.length > 0 ? (
        <section>
          <h2 className="section-title">Money</h2>
          <ul className="tablebox">
            {job.expenses.map((expense) => (
              <li key={expense.id} className="kv">
                <div className="">
                  <p style={{fontWeight:500}}>{expense.vendor}</p>
                  <p className="hint">
                    {formatDateShort(expense.date)} · {safeLine(expense.scheduleECategory)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="num">{formatCents(expense.amountCents)}</span>
                  <Link
                    href={`/entries/expense/${expense.id}`}
                    className="btn"
                  >
                    Open
                  </Link>
                  <RemoveButton kind="expense" id={expense.id} label={expense.vendor} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {rollup.recordCount === 0 ? (
        <p className="panel panel-body muted">
          Nothing is in this job any more. Its records were deleted or moved out — they are
          not gone with it, and the header is safe to remove.
        </p>
      ) : null}

      {/* ------------------------------------------------------------- */}
      <div className="panel panel-body">
        <p style={{fontWeight:500}}>Delete this job</p>
        <p className="hint">
          Only the grouping goes. All {rollup.recordCount}{' '}
          {rollup.recordCount === 1 ? 'record' : 'records'} above stay exactly where they are —
          the grouping was a convenience and the records are the evidence.
        </p>
        <div className="mt-3">
          <DeleteButton
            label="Delete the job, keep the records"
            what={`the job "${job.job.title}"`}
            onDelete={async () => {
              'use server';
              await deleteJobAction(job.job.id);
            }}
          />
        </div>
      </div>

      <p className="hint">
        Signed in as {user.actor.name}. Job created{' '}
        {formatDateShort(job.job.createdAt.toISOString().slice(0, 10))}.
      </p>
    </div>
  );
}

function RemoveButton({
  kind,
  id,
  label,
}: {
  kind: 'time' | 'trip' | 'expense';
  id: string;
  label: string;
}) {
  return (
    <DeleteButton
      label="Remove"
      what={`${label} from this job (the record itself stays)`}
      onDelete={async () => {
        'use server';
        await removeFromJobAction(kind, id);
      }}
    />
  );
}

function safeHour(id: string): string {
  try {
    return getHourCategory(id).label;
  } catch {
    return id;
  }
}

function safeLine(id: string): string {
  try {
    return getScheduleECategory(id).label;
  } catch {
    return id;
  }
}
