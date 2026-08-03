'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { formatCents, formatCentsPlain, RECONCILIATION_KINDS } from '@rental/domain';
import {
  addReconciliationItemAction,
  deleteReconciliationItemAction,
  saveReconciliationAction,
} from '@/app/actions/yearEnd';
import { EMPTY_FORM_STATE } from '@/app/actions/formState';
import { DeleteButton } from './DeleteButton';
import { SubmitButton, type Option } from './Pickers';

export interface ReconciliationItemView {
  id: string;
  kind: string;
  amountCents: number;
  note: string | null;
  isUnusualSign: boolean;
}

export interface ReconciliationView {
  propertyId: string;
  propertyNickname: string;
  reconciliationId: string | null;
  payerActorId: string | null;
  documentNote: string | null;
  receiptsCents: number;
  reportedGrossCents: number | null;
  itemsTotalCents: number;
  residualCents: number | null;
  isReconciled: boolean;
  items: ReconciliationItemView[];
}

/**
 * One property's rent, received against reported.
 *
 * The received figure is never typed in - it is summed from the rent receipts
 * already logged, so the two cannot drift. What is entered here is the 1099 box
 * 1 amount and, one at a time, the reasons the two differ.
 *
 * The app decides none of those reasons. A forfeited deposit is income and a
 * held one is not, and only the owner knows which happened.
 */
export function ReconciliationPanel({
  view,
  taxYear,
  managers,
}: {
  view: ReconciliationView;
  taxYear: number;
  managers: Option[];
}) {
  return (
    <section className="panel panel-body">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">{view.propertyNickname}</h3>
        <ResidualBadge view={view} />
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-3">
        <Figure label="Rent banked" value={formatCents(view.receiptsCents)} />
        <Figure
          label="1099 reported"
          value={
            view.reportedGrossCents === null ? 'not arrived' : formatCents(view.reportedGrossCents)
          }
        />
        <Figure
          label="Explained"
          value={view.items.length === 0 ? '—' : formatCents(view.itemsTotalCents)}
        />
      </dl>

      {view.items.length > 0 ? (
        <ul className="mt-3 grid gap-1">
          {view.items.map((item) => (
            <li key={item.id} className="kv">
              <span className="">
                <span style={{fontWeight:500}}>{kindLabel(item.kind)}</span>
                {item.note ? <span className="hint">{item.note}</span> : null}
                {item.isUnusualSign ? (
                  <span className="hint">
                    That sign is the opposite of what this kind usually carries. Left as
                    entered — check it is what you meant.
                  </span>
                ) : null}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="num text-sm font-semibold">
                  {formatCents(item.amountCents)}
                </span>
                <DeleteButton
                  what={`the ${kindLabel(item.kind).toLowerCase()} item`}
                  onDelete={async () => {
                    await deleteReconciliationItemAction(item.id);
                  }}
                />
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold">
          {view.reportedGrossCents === null ? 'Enter the 1099' : 'Edit the 1099'}
        </summary>
        <div className="mt-3">
          <ReportedForm view={view} taxYear={taxYear} managers={managers} />
        </div>
      </details>

      <details className="mt-2">
        <summary className="cursor-pointer text-sm font-semibold">Explain a difference</summary>
        <div className="mt-3">
          <ItemForm view={view} taxYear={taxYear} />
        </div>
      </details>
    </section>
  );
}

function ResidualBadge({ view }: { view: ReconciliationView }) {
  if (view.reportedGrossCents === null) {
    return <span className="tag tag-muted">Waiting on the 1099</span>;
  }
  if (view.isReconciled) {
    return <span className="tag tag-pos">Squares exactly</span>;
  }
  return (
    <span className="tag tag-warn num">
      {formatCents(view.residualCents ?? 0)} unexplained
    </span>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs muted">{label}</dt>
      <dd className="num text-sm font-semibold">{value}</dd>
    </div>
  );
}

function ReportedForm({
  view,
  taxYear,
  managers,
}: {
  view: ReconciliationView;
  taxYear: number;
  managers: Option[];
}) {
  const [state, formAction] = useActionState(saveReconciliationAction, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="grid gap-1">
      <input type="hidden" name="propertyId" value={view.propertyId} />
      <input type="hidden" name="taxYear" value={taxYear} />

      {state.message ? (
        <p role="alert" className="error-text mb-2">
          {state.message}
        </p>
      ) : null}

      <label className="field">
        <span className="field-label">Box 1, exactly as issued</span>
        <input
          className="input num"
          name="reportedGross"
          inputMode="decimal"
          defaultValue={
            view.reportedGrossCents === null ? '' : formatCentsPlain(view.reportedGrossCents)
          }
          autoComplete="off"
        />
        {state.fields?.reportedGross ? (
          <span className="error-text">{state.fields.reportedGross}</span>
        ) : null}
        <span className="hint">
          Leave blank if the form has not arrived. Blank is not zero, and the app keeps them
          apart.
        </span>
      </label>

      <label className="field">
        <span className="field-label">Who issued it</span>
        <select className="select" name="payerActorId" defaultValue={view.payerActorId ?? ''}>
          <option value="">Not recorded</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">Note</span>
        <textarea
          className="input"
          name="documentNote"
          rows={2}
          defaultValue={view.documentNote ?? ''}
        />
      </label>

      <Submit label="Save the 1099 figure" />
    </form>
  );
}

function ItemForm({ view, taxYear }: { view: ReconciliationView; taxYear: number }) {
  const [state, formAction] = useActionState(addReconciliationItemAction, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="grid gap-1">
      <input type="hidden" name="propertyId" value={view.propertyId} />
      <input type="hidden" name="taxYear" value={taxYear} />
      {view.reconciliationId ? (
        <input type="hidden" name="reconciliationId" value={view.reconciliationId} />
      ) : null}

      {state.message ? (
        <p role="alert" className="error-text mb-2">
          {state.message}
        </p>
      ) : null}

      <label className="field">
        <span className="field-label">What happened</span>
        <select className="select" name="kind" defaultValue="management_fee_withheld">
          {RECONCILIATION_KINDS.map((kind) => (
            <option key={kind.id} value={kind.id}>
              {kind.label}
            </option>
          ))}
        </select>
        <span className="hint">
          {RECONCILIATION_KINDS.map((k) => `${k.label}: ${k.helper}`).join(' ')}
        </span>
      </label>

      <label className="field">
        <span className="field-label">How much</span>
        <input
          className="input num"
          name="amount"
          inputMode="decimal"
          required
          placeholder="1247.50"
          autoComplete="off"
        />
        {state.fields?.amount ? <span className="error-text">{state.fields.amount}</span> : null}
        <span className="hint">
          Positive for money reported but never banked — a fee kept at source, a forfeited
          deposit. Negative for money banked but not reported, which usually means a deposit
          you are still holding.
        </span>
      </label>

      <label className="field">
        <span className="field-label">Note</span>
        <input className="input" name="note" maxLength={500} />
      </label>

      <Submit label="Add this" />
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <SubmitButton pending={pending}>{label}</SubmitButton>;
}

function kindLabel(id: string): string {
  return RECONCILIATION_KINDS.find((k) => k.id === id)?.label ?? id;
}
