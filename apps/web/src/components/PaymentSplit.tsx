'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { formatCents, formatCentsPlain, formatDateShort } from '@rental/domain';
import {
  correctPaymentAction,
  deletePaymentAction,
  planInstalmentsAction,
} from '@/app/actions/payments';
import { EMPTY_FORM_STATE } from '@/app/actions/formState';
import { DeleteButton } from './DeleteButton';
import { SubmitButton } from './Pickers';

export interface PaymentRow {
  id: string;
  paidDate: string;
  amountCents: number;
  isScheduled: boolean;
}

export interface PaymentSummaryView {
  expenseId: string;
  invoiceTotalCents: number;
  paidToDateCents: number;
  scheduledCents: number;
  /**
   * Still owed: the invoice less what has actually been PAID. Scheduled rows do
   * not reduce it, because money that has not moved is still owed.
   */
  outstandingCents: number;
  /**
   * The invoice less what is paid AND what is scheduled - the part of the
   * invoice nothing has been said about yet.
   *
   * This, not `outstandingCents`, is what gates the instalment form. Gating on
   * "still owed" would keep offering to spread money that is already scheduled,
   * and the service would refuse every attempt with "already fully accounted
   * for" - a form that can only ever fail.
   */
  unscheduledCents: number;
  isFullyPaid: boolean;
  isSplit: boolean;
  payments: PaymentRow[];
  /** A date in the next tax year, proposed by the domain rule. */
  suggestedFirstDate: string;
}

/**
 * The instalment UI, and the whole reason it is behind a link.
 *
 * An unsplit expense — one payment, matching the invoice, which is the ordinary
 * case — shows a single line and nothing else. The words "payment" and
 * "instalment" do not appear on the expense form at all, and they only appear
 * here once someone has gone looking.
 *
 * That asymmetry is deliberate. The child table exists for the two invoices a
 * year that straddle a year boundary; taxing the other seventy-three with it
 * would be exactly the complexity that gets a tracker abandoned.
 */
export function PaymentSplit({ summary }: { summary: PaymentSummaryView }) {
  const [open, setOpen] = useState(summary.isSplit);

  if (!summary.isSplit && !open) {
    const only = summary.payments[0];
    return (
      <section className="card card-pad">
        <h2 className="section-title">Payment</h2>
        <p className="tnum mt-1 text-lg font-semibold">
          {formatCents(summary.invoiceTotalCents)}
        </p>
        <p className="hint">
          {only
            ? `Paid in full on ${formatDateShort(only.paidDate)}.`
            : 'No payment recorded against this expense.'}
        </p>
        <button type="button" className="btn btn-ghost mt-3 text-xs" onClick={() => setOpen(true)}>
          Paid in instalments?
        </button>
      </section>
    );
  }

  return (
    <section className="card card-pad">
      <h2 className="section-title">Payments</h2>

      <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-4">
        <Figure label="Invoice" value={formatCents(summary.invoiceTotalCents)} />
        <Figure label="Paid" value={formatCents(summary.paidToDateCents)} />
        <Figure label="Scheduled" value={formatCents(summary.scheduledCents)} />
        {/*
          Two different questions, and conflating them is what made the earlier
          version wrong. "Still owed" counts scheduled money as owed, because it
          has not moved. "Unaccounted for" is the part nothing has been said
          about at all - and that is the only one that means there is work to do
          on this screen.
        */}
        <Figure
          label={summary.unscheduledCents > 0 ? 'Unaccounted' : 'Still owed'}
          value={formatCents(
            summary.unscheduledCents > 0 ? summary.unscheduledCents : summary.outstandingCents,
          )}
          alert={summary.unscheduledCents > 0}
        />
      </dl>

      <ul className="mt-3">
        {summary.payments.map((payment) => (
          <PaymentLine
            key={payment.id}
            payment={payment}
            expenseId={summary.expenseId}
            canDelete={summary.payments.length > 1}
          />
        ))}
      </ul>

      {summary.unscheduledCents > 0 ? (
        <details className="mt-3" open>
          <summary className="cursor-pointer text-sm font-semibold">
            Spread {formatCents(summary.unscheduledCents)} over instalments
          </summary>
          <div className="mt-3">
            <InstalmentForm summary={summary} />
          </div>
        </details>
      ) : (
        <p className="hint mt-3">
          Every cent of this invoice is accounted for
          {summary.scheduledCents > 0
            ? ` — ${formatCents(summary.paidToDateCents)} paid and ${formatCents(summary.scheduledCents)} scheduled. Confirm the scheduled rows on the year-end screen once the money moves.`
            : '.'}
        </p>
      )}
    </section>
  );
}

function PaymentLine({
  payment,
  expenseId,
  canDelete,
}: {
  payment: PaymentRow;
  expenseId: string;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(correctPaymentAction, EMPTY_FORM_STATE);

  return (
    <li className="row">
      <div className="row-main">
        {editing ? (
          <form action={formAction} className="grid gap-1">
            <input type="hidden" name="id" value={payment.id} />
            <input type="hidden" name="expenseId" value={expenseId} />
            {state.message ? <p className="error-text">{state.message}</p> : null}
            <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
              <label className="field">
                <span className="label">Amount</span>
                <input
                  className="input tnum"
                  name="amount"
                  inputMode="decimal"
                  defaultValue={formatCentsPlain(payment.amountCents)}
                  autoComplete="off"
                />
              </label>
              <label className="field">
                <span className="label">Date</span>
                <input
                  className="input"
                  type="date"
                  name="paidDate"
                  defaultValue={payment.paidDate}
                />
              </label>
            </div>
            <Submit label="Save" />
          </form>
        ) : (
          <>
            <p className="row-title">{formatDateShort(payment.paidDate)}</p>
            <p className="row-meta">
              {payment.isScheduled
                ? 'Planned. Deducted nowhere until you confirm it went out.'
                : 'Paid'}
            </p>
            {payment.isScheduled ? (
              <span className="badge badge-flag mt-1">Scheduled</span>
            ) : null}
          </>
        )}
      </div>

      {editing ? null : (
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="row-value tnum">{formatCents(payment.amountCents)}</span>
          <button
            type="button"
            className="btn btn-ghost text-xs"
            onClick={() => setEditing(true)}
          >
            Correct
          </button>
          {canDelete ? (
            <DeleteButton
              what={`the ${formatCents(payment.amountCents)} payment`}
              onDelete={async () => {
                await deletePaymentAction(payment.id, expenseId);
              }}
            />
          ) : null}
        </div>
      )}
    </li>
  );
}

function InstalmentForm({ summary }: { summary: PaymentSummaryView }) {
  const [state, formAction] = useActionState(planInstalmentsAction, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="grid gap-1">
      <input type="hidden" name="expenseId" value={summary.expenseId} />

      {state.message ? (
        <p role="alert" className="error-text mb-2">
          {state.message}
        </p>
      ) : null}
      {state.saved ? (
        <p role="status" className="mb-2 text-sm text-[color:var(--color-eligible-700)]">
          {state.saved}
        </p>
      ) : null}

      <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
        <label className="field">
          <span className="label">How many</span>
          <input
            className="input tnum"
            name="count"
            inputMode="numeric"
            defaultValue="1"
            required
          />
          {state.fields?.count ? <span className="error-text">{state.fields.count}</span> : null}
          <span className="hint">
            {formatCents(summary.unscheduledCents)} to spread. Any odd cent lands on the first.
          </span>
        </label>

        <label className="field">
          <span className="label">First one due</span>
          <input
            className="input"
            type="date"
            name="firstDate"
            defaultValue={summary.suggestedFirstDate}
            required
          />
          <span className="hint">Monthly from there. Month-ends stay month-ends.</span>
        </label>
      </div>

      <p className="hint">
        Every row this writes is scheduled, not paid. It reaches no export until you confirm
        the money moved — which is what lets the rest of this invoice sit in next year without
        being deducted a year early.
      </p>

      <Submit label="Schedule them" />
    </form>
  );
}

function Figure({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-[color:var(--color-muted)]">{label}</dt>
      <dd
        className={
          alert ? 'tnum text-sm font-semibold text-[color:var(--color-flag-700)]' : 'tnum text-sm font-semibold'
        }
      >
        {value}
      </dd>
    </div>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <SubmitButton pending={pending}>{label}</SubmitButton>;
}
