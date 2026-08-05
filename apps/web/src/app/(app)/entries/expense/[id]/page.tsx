import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  costTreatmentFor,
  formatCents,
  formatDateShort,
  getScheduleECategory,
  needsPropertyOrSplit,
  taxYearOf,
  type AllocationRule,
} from '@rental/domain';
import { requireUser } from '@/lib/session';
import { getExpense } from '@/server/services/expenses';
import { paymentSummary, suggestRemainder } from '@/server/services/payments';
import { getProperty, listActors } from '@/server/services/reference';
import { openJob } from '@/server/services/jobs';
import { NotFoundError } from '@/server/errors';
import { PaymentSplit } from '@/components/PaymentSplit';
import { AddRelated } from '@/components/AddRelated';
import { ReceiptLinks } from '@/components/ReceiptLinks';
import { PageHeader } from '@/components/ui/PageHeader';
import { KeyValues, Note, Panel, Tag, Well } from '@/components/ui';
import { withYear } from '@/lib/year';

export const metadata = { title: 'Expense' };

/**
 * One expense, and the cash events against it.
 *
 * The expense is the obligation; the payments are what actually left the bank.
 * Cash basis deducts in the year of payment, so those are two different facts
 * and the page keeps them visibly apart - the invoice total on the left, what
 * was paid and when underneath it.
 */
export default async function ExpenseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  await requireUser();

  let expense;
  try {
    expense = await getExpense(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const taxYear = taxYearOf(expense.date);

  const [summary, actors, job, property] = await Promise.all([
    paymentSummary(id),
    listActors({ includeArchived: true }),
    openJob(expense.jobId),
    expense.propertyId ? getProperty(expense.propertyId) : Promise.resolve(null),
  ]);

  // The domain proposes the date for the remainder, so the form and the rule
  // cannot disagree about what is left or when it falls due.
  const suggestion = await suggestRemainder(id, taxYear);

  const line = safeLine(expense.scheduleECategory);
  const contractor = expense.contractorActorId
    ? actors.find((actor) => actor.id === expense.contractorActorId)
    : null;
  const unresolved = needsPropertyOrSplit(
    expense.propertyId,
    expense.allocationRule as AllocationRule | null,
  );
  const propertyLabel = property
    ? property.nickname
    : unresolved
      ? 'Portfolio-wide'
      : 'Split across properties';

  // A date comparison and a label, never a recommendation. What to do with an
  // acquisition-side cost is the CPA's call.
  const treatment = costTreatmentFor(
    expense.date,
    property?.placedInServiceDate ?? null,
    asTreatment(expense.costTreatmentOverride),
  );

  return (
    <>
      <PageHeader
        title={expense.vendor}
        crumb={`${formatDateShort(expense.date)} · ${line.label}`}
        actions={
          <>
            <Link className="btn" href={withYear('/entries?tab=expenses', taxYear)}>
              Back to expenses
            </Link>
            <Link className="btn btn-primary" href={`/entries/expense/${id}/edit`}>
              Edit
            </Link>
          </>
        }
      />
      <Well>
        {saved ? (
          <p className="note note-pos" role="status">
            Expense saved.
          </p>
        ) : null}
        <div className="cols-detail">
          <div className="stack">
            <Panel title="Invoice">
              <div className="panel-figure">{formatCents(expense.amountCents)}</div>
              <p className="muted">
                {propertyLabel} · {line.line ? `Schedule E line ${line.line}` : line.label}
              </p>

              <p className="mt-2.5 flex flex-wrap gap-1.5">
                {expense.capitalClassification === 'repair' ? (
                  <Tag tone="pos">Repair</Tag>
                ) : null}
                {expense.capitalClassification === 'improvement' ? (
                  <Tag tone="capital">Capital improvement</Tag>
                ) : null}
                {expense.capitalClassification === 'needs_review' ? (
                  <Tag tone="warn">Needs review</Tag>
                ) : null}
                {unresolved ? <Tag tone="warn">Needs a property or split</Tag> : null}
                <Tag tone={treatment.treatment === 'acquisition' ? 'capital' : 'muted'}>
                  {treatment.treatment === 'acquisition' ? 'Acquisition side' : 'Operating'}
                </Tag>
                {expense.isBackdated ? <Tag tone="muted">Logged later</Tag> : null}
              </p>

              <Note>{treatment.explanation}</Note>
              {expense.notes ? <p className="hint">{expense.notes}</p> : null}
            </Panel>

            <PaymentSplit
              summary={{
                expenseId: id,
                invoiceTotalCents: summary.invoiceTotalCents,
                paidToDateCents: summary.paidToDateCents,
                scheduledCents: summary.scheduledCents,
                outstandingCents: summary.outstandingCents,
                unscheduledCents: suggestion?.amountCents ?? 0,
                isFullyPaid: summary.isFullyPaid,
                isSplit: summary.isSplit,
                payments: summary.payments.map((payment) => ({
                  id: payment.id,
                  paidDate: payment.paidDate,
                  amountCents: payment.amountCents,
                  isScheduled: payment.isScheduled,
                })),
                suggestedFirstDate: suggestion?.paidDate ?? `${taxYear + 1}-01-15`,
              }}
            />
          </div>

          <div className="stack">
            <Panel title="The record">
              <KeyValues
                rows={[
                  {
                    key: 'property',
                    label: 'Property',
                    value: propertyLabel,
                    tone: unresolved ? 'warn' : undefined,
                  },
                  { key: 'line', label: 'Schedule E line', value: line.label },
                  {
                    key: 'class',
                    label: 'Repair or improvement',
                    value: CLASSIFICATION_LABELS[expense.capitalClassification ?? ''] ?? 'Not answered',
                    tone: expense.capitalClassification ? undefined : 'warn',
                  },
                  {
                    key: 'treatment',
                    label: 'Cost treatment',
                    value: treatment.treatment,
                  },
                  {
                    key: 'contractor',
                    label: 'Contractor',
                    value: contractor?.name ?? '—',
                    tone: contractor ? undefined : 'muted',
                  },
                  {
                    key: 'receipt',
                    label: 'Receipt',
                    value: expense.receiptKey ? (
                      <ReceiptLinks receiptKey={expense.receiptKey} />
                    ) : (
                      'None'
                    ),
                    tone: expense.receiptKey ? 'pos' : 'muted',
                  },
                  {
                    key: 'recorded',
                    label: 'Recorded',
                    value: expense.isBackdated ? 'After the fact' : 'On the day',
                    tone: 'muted',
                  },
                ]}
              />
            </Panel>

            {job ? (
              <Panel title="Part of a job">
                <p className="rowtitle">{job.title}</p>
                <p className="hint">
                  The time and miles that went with this expense are grouped with it.
                </p>
                <Link
                  className="btn btn-block mt-2.5"
                  href={`/jobs/${job.id}`}
                >
                  Open the job
                </Link>
              </Panel>
            ) : (
              <Panel title="Related work">
                <AddRelated kind="expense" recordId={id} />
              </Panel>
            )}
          </div>
        </div>
      </Well>
    </>
  );
}

/** The stored enum is not the word for it. `needs_review` is a database value. */
const CLASSIFICATION_LABELS: Record<string, string> = {
  repair: 'Repair',
  improvement: 'Capital improvement',
  needs_review: 'Waiting on the CPA',
};

function safeLine(id: string): { label: string; line: number | null } {
  try {
    const category = getScheduleECategory(id);
    return { label: category.label, line: category.line };
  } catch {
    return { label: id, line: null };
  }
}

function asTreatment(value: string | null): 'operating' | 'acquisition' | null {
  return value === 'operating' || value === 'acquisition' ? value : null;
}
