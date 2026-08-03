import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  costTreatmentFor,
  formatCents,
  formatDateShort,
  getScheduleECategory,
  taxYearOf,
} from '@rental/domain';
import { requireUser } from '@/lib/session';
import { getExpense } from '@/server/services/expenses';
import { paymentSummary, suggestRemainder } from '@/server/services/payments';
import { getProperty, listActors } from '@/server/services/reference';
import { openJob } from '@/server/services/jobs';
import { NotFoundError } from '@/server/errors';
import { PaymentSplit } from '@/components/PaymentSplit';
import { AddRelated } from '@/components/AddRelated';

export const metadata = { title: 'Expense' };

/**
 * One expense, and the cash events against it.
 *
 * The expense is the obligation; the payments are what actually left the bank.
 * Cash basis deducts in the year of payment, so those are two different facts
 * and this page keeps them visibly apart - the invoice total at the top, what
 * was paid and when below it.
 */
export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  let expense;
  try {
    expense = await getExpense(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const [summary, actors, job, property] = await Promise.all([
    paymentSummary(id),
    listActors({ includeArchived: true }),
    openJob(expense.jobId),
    expense.propertyId ? getProperty(expense.propertyId) : Promise.resolve(null),
  ]);

  // The domain proposes a date in the next tax year for the remainder. Asking
  // it rather than computing a date here keeps the form and the rule agreeing.
  const suggestion = await suggestRemainder(id, taxYearOf(expense.date));

  const line = safeLine(expense.scheduleECategory);
  const contractor = expense.contractorActorId
    ? actors.find((a) => a.id === expense.contractorActorId)
    : null;

  // Which side of the placed-in-service line this fell on. A date comparison
  // and a label, never a recommendation - what to do with an acquisition-side
  // cost is the CPA's call.
  const treatment = costTreatmentFor(
    expense.date,
    property?.placedInServiceDate ?? null,
    asTreatment(expense.costTreatmentOverride),
  );

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <Link href="/entries?tab=expenses" className="btn btn-ghost">
          ← Entries
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{expense.vendor}</h1>
      </div>

      <section className="card card-pad">
        <p className="tnum text-2xl font-bold tracking-tight">
          {formatCents(expense.amountCents)}
        </p>
        <p className="hint">
          Invoiced {formatDateShort(expense.date)} · {line.label}
          {property ? ` · ${property.nickname}` : ' · split across properties'}
        </p>

        <p className="mt-2 flex flex-wrap gap-1.5">
          {expense.capitalClassification === 'repair' ? (
            <span className="badge badge-eligible">Repair</span>
          ) : null}
          {expense.capitalClassification === 'improvement' ? (
            <span className="badge badge-not-eligible">Improvement</span>
          ) : null}
          {expense.capitalClassification === 'needs_review' ? (
            <span className="badge badge-flag">Needs review</span>
          ) : null}
          <span
            className={
              treatment.treatment === 'acquisition'
                ? 'badge badge-flag'
                : 'badge badge-not-eligible'
            }
          >
            {treatment.treatment === 'acquisition' ? 'Acquisition side' : 'Operating'}
          </span>
          {expense.isBackdated ? (
            <span className="badge badge-not-eligible">Logged later</span>
          ) : null}
        </p>

        <p className="hint mt-2">{treatment.explanation}</p>

        {contractor ? <p className="hint mt-1">Paid to {contractor.name}.</p> : null}
        {expense.notes ? <p className="hint mt-1">{expense.notes}</p> : null}
      </section>

      <PaymentSplit
        summary={{
          expenseId: id,
          invoiceTotalCents: summary.invoiceTotalCents,
          paidToDateCents: summary.paidToDateCents,
          scheduledCents: summary.scheduledCents,
          outstandingCents: summary.outstandingCents,
          // The domain returns null once nothing is left unscheduled, which is
          // the same question the instalment form needs answered - so it is
          // asked once, here, rather than recomputed in the component.
          unscheduledCents: suggestion?.amountCents ?? 0,
          isFullyPaid: summary.isFullyPaid,
          isSplit: summary.isSplit,
          payments: summary.payments.map((p) => ({
            id: p.id,
            paidDate: p.paidDate,
            amountCents: p.amountCents,
            isScheduled: p.isScheduled,
          })),
          suggestedFirstDate: suggestion?.paidDate ?? `${taxYearOf(expense.date) + 1}-01-15`,
        }}
      />

      {job ? (
        <section className="card card-pad">
          <p className="row-title">Part of “{job.title}”</p>
          <p className="row-meta">
            The time and miles that went with this expense are grouped with it.
          </p>
          <Link href={`/jobs/${job.id}`} className="btn btn-ghost mt-2 text-xs">
            Open the job
          </Link>
        </section>
      ) : (
        <AddRelated kind="expense" recordId={id} />
      )}

      <p className="hint">Signed in as {user.actor.name}.</p>
    </div>
  );
}

function safeLine(id: string) {
  try {
    return getScheduleECategory(id);
  } catch {
    return { label: id, triggersCapitalPrompt: false } as const;
  }
}

function asTreatment(value: string | null): 'operating' | 'acquisition' | null {
  return value === 'operating' || value === 'acquisition' ? value : null;
}
