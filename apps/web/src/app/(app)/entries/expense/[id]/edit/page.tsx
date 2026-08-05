import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDateLong, taxYearOf, todayInZone } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { captureHints, getExpense } from '@/server/services/expenses';
import { propertyOptions } from '@/lib/captureOptions';
import { paymentSummary } from '@/server/services/payments';
import { listContractors, listPeople, listProperties } from '@/server/services/reference';
import { ExpenseForm } from '@/components/ExpenseForm';
import { NotFoundError } from '@/server/errors';
import { PageHeader } from '@/components/ui/PageHeader';
import { Well } from '@/components/ui';
import { withYear } from '@/lib/year';

export const metadata = { title: 'Edit expense' };

/**
 * One expense, reopened.
 *
 * The detail page next door shows what an expense IS - the invoice, the cash
 * against it, the job it belongs to. This one changes it, and stays a plain
 * form rather than turning the detail page into an editable one: the payments
 * on that page are separately editable already, and a screen where some figures
 * are live and others are drafts is a screen where nobody knows what is saved.
 */
export default async function EditExpensePage({
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

  const [properties, people, contractors, summary, hints] = await Promise.all([
    listProperties(),
    listPeople(),
    listContractors(),
    paymentSummary(id),
    captureHints(),
  ]);

  // Whether the payments have a life of their own. One row that still mirrors
  // the invoice follows an edited total automatically; anything else does not,
  // and the form has to say so before the total is changed rather than after.
  const hasOwnPayments =
    summary.payments.length > 1 ||
    (summary.payments.length === 1 &&
      summary.payments[0]?.amountCents !== expense.amountCents);

  const taxYear = taxYearOf(expense.date);

  return (
    <>
      <PageHeader
        title="Edit expense"
        crumb={expense.vendor}
        actions={
          <Link href={`/entries/expense/${id}`} className="btn">
            ← Back
          </Link>
        }
      />
      <Well>
        {/* The same honesty the time entry edit page keeps: correcting a record
            does not make the correction contemporaneous with the work. */}
        <p className="hint mb-4">
          Originally written {formatDateLong(expense.createdAt.toISOString().slice(0, 10))}.
          That timestamp does not change when you edit this.{' '}
          <Link className="link" href={withYear('/entries?tab=expenses', taxYear)}>
            All {taxYear} expenses
          </Link>
        </p>

        <ExpenseForm
          today={expense.date}
          actorId={user.actor.id}
          properties={propertyOptions(properties, hints, todayInZone(user.timeZone))}
          people={people.map((p) => ({ id: p.id, label: p.name }))}
          contractors={contractors.map((c) => ({ id: c.id, label: c.name }))}
          defaults={{
            id: expense.id,
            date: expense.date,
            actorId: expense.actorId,
            propertyId: expense.propertyId,
            amountCents: expense.amountCents,
            vendor: expense.vendor,
            scheduleECategory: expense.scheduleECategory,
            capitalClassification: expense.capitalClassification,
            contractorActorId: expense.contractorActorId,
            receiptKey: expense.receiptKey,
            receiptSha256: expense.receiptSha256,
            notes: expense.notes,
            isSplit: expense.allocationRule != null,
            hasOwnPayments,
          }}
        />
      </Well>
    </>
  );
}
