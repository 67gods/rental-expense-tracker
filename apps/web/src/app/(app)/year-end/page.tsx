import Link from 'next/link';
import {
  documentSource,
  formatCents,
  getScheduleECategory,
  taxYearRange,
} from '@rental/domain';
import { requireUser } from '@/lib/session';
import { listLoanYears } from '@/server/services/loanYears';
import { reconciliationsForYear } from '@/server/services/reconciliation';
import { scheduledPayments } from '@/server/services/payments';
import { listCpaFigures } from '@/server/services/cpaFigures';
import { listActors, listProperties } from '@/server/services/reference';
import { LoanYearForm } from '@/components/LoanYearForm';
import { ReconciliationPanel } from '@/components/ReconciliationPanel';
import { CpaFigureForm } from '@/components/CpaFigureForm';
import { ConfirmPaymentButton } from '@/components/ConfirmPaymentButton';
import { DeleteButton } from '@/components/DeleteButton';
import { deleteCpaFigureAction, deleteLoanYearAction } from '@/app/actions/yearEnd';

export const metadata = { title: 'Year-end' };

/**
 * The January sitting.
 *
 * Four jobs on one page, because they are one task done in one week: transcribe
 * the 1098s, square the rent against the 1099, say which scheduled payments
 * actually went out, and type in what the CPA sent back. Four routes would be
 * four things to remember eleven months after the last time.
 *
 * Nothing on this page is computed for you. Every figure is copied off a
 * document, and the one number the app does work out - the unexplained residual
 * between rent banked and rent reported - is arithmetic, not a conclusion.
 */
export default async function YearEndPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const requested = Number(params.year);
  const taxYear =
    Number.isInteger(requested) && requested > 1900 && requested < 3000
      ? requested
      : user.taxYear;

  const [properties, actors, loanYears, reconciliations, scheduled, figures] = await Promise.all([
    listProperties(),
    listActors(),
    listLoanYears({ taxYear }),
    reconciliationsForYear(taxYear),
    scheduledPayments(),
    listCpaFigures({ taxYear }),
  ]);

  const propertyOptions = properties.map((p) => ({ id: p.id, label: p.nickname }));
  const propertyNames = new Map(properties.map((p) => [p.id, p.nickname]));
  const managerOptions = actors
    .filter((a) => a.type === 'pm' || a.type === 'other')
    .map((a) => ({ id: a.id, label: a.name }));

  const years = [user.taxYear, user.taxYear - 1, user.taxYear - 2];
  if (!years.includes(taxYear)) years.unshift(taxYear);

  // A scheduled row dated inside the year being closed is one that either went
  // out and was never confirmed - so the deduction is missing - or did not, and
  // needs moving. Both need a decision before the books close.
  const endOfYear = taxYearRange(taxYear).end;
  const due = scheduled.filter((row) => row.payment.paidDate <= endOfYear);
  const upcoming = scheduled.filter((row) => row.payment.paidDate > endOfYear);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">Year-end · {taxYear}</h1>
        <nav className="seg" aria-label="Tax year">
          {years.map((year) => (
            <a
              key={year}
              href={`/year-end?year=${year}`}
              className={year === taxYear ? 'chip chip-accent' : 'chip'}
            >
              {year}
            </a>
          ))}
        </nav>
      </div>

      <p className="hint">
        Four things, once a year, in one place. Nothing here is worked out for you — every
        figure is copied off a document, and the app records where it came from.
      </p>

      {/* 1 --------------------------------------------------------------- */}
      <section>
        <h2 className="section-title mb-2">Mortgage &amp; escrow · from the 1098s</h2>

        {/*
          Grouped by PROPERTY, not listed by lender.

          A refinance leaves two 1098s on one house, and a flat list by bank
          makes you hold the mapping in your head to answer "what did Westmill
          cost me in interest". The property is the thing you think in; the
          lender is a detail underneath it.
        */}
        {properties.length > 0 ? (
          <div className="grid gap-3">
            {properties.map((property) => {
              const forProperty = loanYears.filter((l) => l.propertyId === property.id);
              const interest = forProperty.reduce((s, l) => s + (l.interestCents ?? 0), 0);
              const propertyTax = forProperty.reduce((s, l) => s + (l.propertyTaxCents ?? 0), 0);
              const insurance = forProperty.reduce(
                (s, l) => s + (l.insurancePaidFromEscrowCents ?? 0),
                0,
              );

              return (
                <section key={property.id} className="panel panel-body">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-base font-semibold">{property.nickname}</h3>
                    {forProperty.length === 0 ? (
                      <span className="tag tag-warn">No 1098 entered</span>
                    ) : (
                      <span className="hint">
                        {forProperty.length}{' '}
                        {forProperty.length === 1 ? 'lender' : 'lenders'}
                      </span>
                    )}
                  </div>

                  {/* The property-level totals first, because that is the
                      question being asked. The per-lender rows are the
                      evidence for it. */}
                  {forProperty.length > 1 ? (
                    <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-3">
                      <Figure label="Interest, all lenders" cents={interest} />
                      <Figure label="Property tax" cents={propertyTax} />
                      <Figure label="Insurance" cents={insurance} />
                    </dl>
                  ) : null}

                  {forProperty.map((row) => (
                    <div
                      key={row.id}
                      className="mt-3 border-t border-[color:var(--border)] pt-3"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p style={{fontWeight:500}}>{row.lenderName}</p>
                        <DeleteButton
                          what={`the ${row.lenderName} 1098 for ${taxYear}`}
                          onDelete={async () => {
                            'use server';
                            await deleteLoanYearAction(row.id);
                          }}
                        />
                      </div>

                <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-3">
                  <Figure label="Interest" cents={row.interestCents} />
                  <Figure
                    label="Property tax"
                    cents={row.propertyTaxCents}
                    note={sourceLabel(row.propertyTaxSource)}
                  />
                  <Figure
                    label="Insurance"
                    cents={row.insurancePaidFromEscrowCents}
                    note={sourceLabel(row.insuranceSource)}
                  />
                </dl>

                {row.documentNote ? <p className="hint mt-2">{row.documentNote}</p> : null}

                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold">Edit</summary>
                  <div className="mt-3">
                    <LoanYearForm
                      taxYear={taxYear}
                      properties={propertyOptions}
                      isEdit
                      defaults={{
                        propertyId: row.propertyId,
                        lenderName: row.lenderName,
                        interestCents: row.interestCents,
                        pointsCents: row.pointsCents,
                        mortgageInsuranceCents: row.mortgageInsuranceCents,
                        propertyTaxCents: row.propertyTaxCents,
                        propertyTaxSource: row.propertyTaxSource,
                        insurancePaidFromEscrowCents: row.insurancePaidFromEscrowCents,
                        insuranceSource: row.insuranceSource,
                        escrowBalanceCents: row.escrowBalanceCents,
                        originationDate: row.originationDate,
                        originalPrincipalCents: row.originalPrincipalCents,
                        interestRatePct: row.interestRatePct,
                        documentNote: row.documentNote,
                      }}
                    />
                  </div>
                </details>
              </div>
                  ))}

                  {forProperty.length === 0 ? (
                    <p className="hint mt-2">
                      Nothing entered for {taxYear}. Mortgage interest, property tax and
                      escrowed insurance are the largest deductions on the return and none
                      of them passes through the expense ledger.
                    </p>
                  ) : null}

                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-semibold">
                      {forProperty.length === 0
                        ? `Add the 1098 for ${property.nickname}`
                        : 'Add another lender (after a refinance)'}
                    </summary>
                    <div className="mt-3">
                      <LoanYearForm
                        taxYear={taxYear}
                        properties={propertyOptions}
                        defaults={{ propertyId: property.id }}
                      />
                    </div>
                  </details>
                </section>
              );
            })}
          </div>
        ) : (
          <p className="panel panel-body hint">No properties yet.</p>
        )}

        {/* No global "add a 1098" any more. Every 1098 belongs to a property,
            and adding one from inside that property's card means the property
            is already chosen rather than being the first question asked. */}
      </section>

      {/* 2 --------------------------------------------------------------- */}
      <section>
        <h2 className="section-title mb-2">Rent banked vs rent reported</h2>
        <p className="hint mb-2">
          Every property is listed, whether or not the 1099 has arrived — one waiting on a
          form must not look the same as one that was never checked.
        </p>

        {reconciliations.length > 0 ? (
          <div className="grid gap-2">
            {reconciliations.map((view) => (
              <ReconciliationPanel
                key={view.propertyId}
                taxYear={taxYear}
                managers={managerOptions}
                view={{
                  propertyId: view.propertyId,
                  propertyNickname: view.propertyNickname,
                  reconciliationId: view.reconciliation?.id ?? null,
                  payerActorId: view.reconciliation?.payerActorId ?? null,
                  documentNote: view.reconciliation?.documentNote ?? null,
                  receiptsCents: view.receiptsCents,
                  reportedGrossCents: view.reportedGrossCents,
                  itemsTotalCents: view.itemsCents,
                  residualCents: view.residualCents,
                  isReconciled: view.isReconciled,
                  items: view.items.map((item) => ({
                    id: item.id,
                    kind: item.kind,
                    amountCents: item.amountCents,
                    note: item.note,
                    isUnusualSign: item.isUnusualSign,
                  })),
                }}
              />
            ))}
          </div>
        ) : (
          <p className="panel panel-body hint">No properties yet.</p>
        )}
      </section>

      {/* 3 --------------------------------------------------------------- */}
      <section>
        <h2 className="section-title mb-2">Payments still only planned</h2>

        {scheduled.length === 0 ? (
          <p className="panel panel-body hint">
            Nothing scheduled. Every payment on file is a cash event that has happened.
          </p>
        ) : (
          <div className="grid gap-2">
            {due.length > 0 ? (
              <div className="tablebox">
                <p className="kv">
                  <span className="">
                    <span style={{fontWeight:500}}>Due in {taxYear} or earlier</span>
                    <span className="hint">
                      Each of these either went out and was never confirmed — so the
                      deduction is missing from {taxYear} — or did not, and needs moving.
                    </span>
                  </span>
                </p>
                {due.map((row) => (
                  <ScheduledRow
                    key={row.payment.id}
                    row={row}
                    propertyName={row.propertyId ? propertyNames.get(row.propertyId) : null}
                    flagged
                  />
                ))}
              </div>
            ) : null}

            {upcoming.length > 0 ? (
              <div className="tablebox">
                <p className="kv">
                  <span className="">
                    <span style={{fontWeight:500}}>Coming after {taxYear}</span>
                    <span className="hint">
                      Deductible in the year they are paid, not now. Listed so the invoice
                      they belong to is not forgotten.
                    </span>
                  </span>
                </p>
                {upcoming.map((row) => (
                  <ScheduledRow
                    key={row.payment.id}
                    row={row}
                    propertyName={row.propertyId ? propertyNames.get(row.propertyId) : null}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* 4 --------------------------------------------------------------- */}
      <section>
        <h2 className="section-title mb-2">Figures from your CPA</h2>

        {figures.length > 0 ? (
          <div className="tablebox">
            {figures.map((figure) => (
              <div key={figure.id} className="kv">
                <div className="">
                  <p style={{fontWeight:500}}>{figure.label}</p>
                  <p className="hint">
                    {figure.propertyId
                      ? (propertyNames.get(figure.propertyId) ?? 'Unknown property')
                      : 'Whole portfolio'}
                    {figure.categoryId ? ` · ${categoryLabel(figure.categoryId)}` : ''}
                    {figure.recoveryYears ? ` · ${figure.recoveryYears} year` : ''}
                  </p>
                  <p className="hint">{figure.sourceNote}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="num text-sm font-semibold">
                    {formatCents(figure.amountCents)}
                  </span>
                  <DeleteButton
                    what={`"${figure.label}"`}
                    onDelete={async () => {
                      'use server';
                      await deleteCpaFigureAction(figure.id);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="panel panel-body hint">
            Nothing entered for {taxYear} yet. Depreciation, a suspended loss carried
            forward, a component schedule — whatever came back, it goes here rather than
            being worked out.
          </p>
        )}

        <details className="panel panel-body" open={figures.length === 0}>
          <summary className="cursor-pointer text-sm font-semibold">Add a figure</summary>
          <div className="mt-4">
            <CpaFigureForm taxYear={taxYear} properties={propertyOptions} />
          </div>
        </details>
      </section>

      <Link href="/reports" className="btn btn-block">
        Reports &amp; export
      </Link>
    </div>
  );
}

function ScheduledRow({
  row,
  propertyName,
  flagged = false,
}: {
  row: {
    payment: { id: string; paidDate: string; amountCents: number };
    expenseId: string;
    vendor: string;
    invoiceDate: string;
    invoiceTotalCents: number;
  };
  propertyName?: string | null;
  flagged?: boolean;
}) {
  return (
    <div className="kv">
      <div className="">
        <p style={{fontWeight:500}}>{row.vendor}</p>
        <p className="hint">
          Planned for {row.payment.paidDate} · invoice {row.invoiceDate} for{' '}
          {formatCents(row.invoiceTotalCents)}
          {propertyName ? ` · ${propertyName}` : ''}
        </p>
        {flagged ? <span className="tag tag-warn mt-1">Needs a decision</span> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="num text-sm font-semibold">{formatCents(row.payment.amountCents)}</span>
        <ConfirmPaymentButton paymentId={row.payment.id} plannedDate={row.payment.paidDate} />
      </div>
    </div>
  );
}

function Figure({
  label,
  cents,
  note,
}: {
  label: string;
  cents: number | null;
  note?: string | null;
}) {
  return (
    <div>
      <dt className="text-xs muted">{label}</dt>
      <dd className="num text-sm font-semibold">
        {cents === null ? (
          <span className="font-normal muted">not recorded</span>
        ) : (
          formatCents(cents)
        )}
      </dd>
      {note ? <dd className="hint">{note}</dd> : null}
    </div>
  );
}

/** Guarded: an id the picker no longer offers reads as blank, not a crash. */
function sourceLabel(id: string | null): string | null {
  return id && documentSource.has(id) ? documentSource.get(id).label : null;
}

function categoryLabel(id: string): string {
  try {
    return getScheduleECategory(id).label;
  } catch {
    return id;
  }
}
