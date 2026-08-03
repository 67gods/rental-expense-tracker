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
   * Still owed: the invoice less what has actually been PAID. Scheduled rows
   * do not reduce it, because money that has not moved is still owed.
   */
  outstandingCents: number;
  /**
   * The invoice less what is paid AND what is scheduled - the part nothing has
   * been said about yet.
   *
   * This, not `outstandingCents`, gates the instalment form. Gating on "still
   * owed" would keep offering to spread money already scheduled, and the
   * service would refuse every attempt with "already fully accounted for" - a
   * form that can only ever fail.
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
 * An unsplit expense - one payment matching the invoice, which is the ordinary
 * case - shows a single line and nothing else. The words "payment" and
 * "instalment" never appear on the expense form, and they appear here only
 * once someone has gone looking.
 *
 * That asymmetry is deliberate. The payments table exists for the two invoices
 * a year that straddle a year boundary; taxing the other seventy-three with it
 * would be exactly the complexity that gets a tracker abandoned.
 */
export function PaymentSplit({ summary }: { summary: PaymentSummaryView }) {
  const [open, setOpen] = useState(summary.isSplit);

  if (!summary.isSplit && !open) {
    const only = summary.payments[0];
    return (
      <section className="panel">
        <div className="panel-head">Payment</div>
        <div className="panel-body">
          <div className="panel-figure">{formatCents(summary.invoiceTotalCents)}</div>
          <p className="muted">
            {only
              ? `Paid in full on ${formatDateShort(only.paidDate)}.`
              : 'No payment recorded against this expense.'}
          </p>
          <button
            type="button"
            className="btn"
            style={{ marginTop: 12 }}
            onClick={() => setOpen(true)}
          >
            Paid in instalments?
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">Payments</div>

      <div className="strip" style={{ border: 0, borderRadius: 0 }}>
        <Figure label="Invoice" value={formatCents(summary.invoiceTotalCents)} />
        <Figure label="Paid" value={formatCents(summary.paidToDateCents)} />
        <Figure label="Scheduled" value={formatCents(summary.scheduledCents)} />
        {/*
          Two different questions, and conflating them is what made an earlier
          version wrong. "Still owed" counts scheduled money as owed, because it
          has not moved. "Unaccounted for" is the part nothing has been said
          about at all - and only that one means there is work to do here.
        */}
        <Figure
          label={summary.unscheduledCents > 0 ? 'Unaccounted' : 'Still owed'}
          value={formatCents(
            summary.unscheduledCents > 0 ? summary.unscheduledCents : summary.outstandingCents,
          )}
          tone={summary.unscheduledCents > 0 ? 'warn' : undefined}
        />
      </div>

      <div className="panel-body">
        <ul>
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
          <>
            <p className="section-title" style={{ marginTop: 18 }}>
              Spread {formatCents(summary.unscheduledCents)} over instalments
            </p>
            <InstalmentForm summary={summary} />
          </>
        ) : (
          <p className="hint" style={{ marginTop: 12 }}>
            Every cent of this invoice is accounted for
            {summary.scheduledCents > 0
              ? ` — ${formatCents(summary.paidToDateCents)} paid and ${formatCents(
                  summary.scheduledCents,
                )} scheduled. Confirm the scheduled rows on the year-end screen once the money moves.`
              : '.'}
          </p>
        )}
      </div>
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

  if (editing) {
    return (
      <li className="kv" style={{ display: 'block' }}>
        <form action={formAction}>
          <input type="hidden" name="id" value={payment.id} />
          <input type="hidden" name="expenseId" value={expenseId} />
          {state.message ? <p className="error-text">{state.message}</p> : null}
          <div className="form-row">
            <label className="field">
              <span className="field-label">Amount</span>
              <input
                className="input num"
                name="amount"
                inputMode="decimal"
                defaultValue={formatCentsPlain(payment.amountCents)}
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span className="field-label">Date</span>
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
      </li>
    );
  }

  return (
    <li className="kv">
      <div>
        <div style={{ fontWeight: 500 }}>
          {formatDateShort(payment.paidDate)}{' '}
          {payment.isScheduled ? <span className="tag tag-warn">Scheduled</span> : null}
        </div>
        <div className="hint">
          {payment.isScheduled
            ? 'Planned. Deducted nowhere until you confirm it went out.'
            : 'Paid'}
        </div>
      </div>
      <div className="nowrap">
        <span className="num">{formatCents(payment.amountCents)}</span>{' '}
        <button type="button" className="btn" onClick={() => setEditing(true)}>
          Correct
        </button>{' '}
        {canDelete ? (
          <DeleteButton
            what={`the ${formatCents(payment.amountCents)} payment`}
            onDelete={async () => {
              await deletePaymentAction(payment.id, expenseId);
            }}
          />
        ) : null}
      </div>
    </li>
  );
}

function InstalmentForm({ summary }: { summary: PaymentSummaryView }) {
  const [state, formAction] = useActionState(planInstalmentsAction, EMPTY_FORM_STATE);

  return (
    <form action={formAction}>
      <input type="hidden" name="expenseId" value={summary.expenseId} />

      {state.message ? (
        <p className="error-text" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.saved ? <p className="note note-pos">{state.saved}</p> : null}

      <div className="form-row">
        <label className="field">
          <span className="field-label">How many</span>
          <input
            className="input num"
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
          <span className="field-label">First one due</span>
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

      <p className="note">
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
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warn';
}) {
  return (
    <div className="strip-cell">
      <div className="strip-key">{label}</div>
      <div className={tone ? `strip-value ${tone}` : 'strip-value'}>{value}</div>
    </div>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Saving…' : label}
    </button>
  );
}
