import Link from 'next/link';
import { formatCents, formatMinutes } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { getDashboardData } from '@/server/services/dashboard';
import { buildScheduleE } from '@/server/services/reports';
import { scheduledPayments } from '@/server/services/payments';
import { reconciliationsForYear } from '@/server/services/reconciliation';
import { listLoanYears } from '@/server/services/loanYears';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  Empty,
  KeyValues,
  Note,
  Panel,
  SectionTitle,
  SplitBar,
  StatStrip,
  Tag,
  TableBox,
  Th,
  Well,
} from '@/components/ui';
import { resolveTaxYear, withYear } from '@/lib/year';

export const metadata = { title: 'Overview' };

/**
 * The year in one screen.
 *
 * Ordered by what a person actually wants: the figures that describe the year,
 * then the same figures per property, then anything waiting on a decision.
 *
 * The per-property table is built to be RECONCILED AGAINST A FILED RETURN, not
 * just glanced at, which is why the deductible arrives in named parts rather
 * than as one total. Every column has a tooltip saying exactly what is in it,
 * because "Deductible $14,897.52" is unanswerable otherwise - paid or invoiced,
 * depreciation in or out, does this property's share of the portfolio software
 * count - and each of those questions changes the number.
 */
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const taxYear = resolveTaxYear(params.year, user.taxYear);

  const [data, scheduleE, scheduled, reconciliations, loans] = await Promise.all([
    getDashboardData(user.enterprise.id, taxYear),
    buildScheduleE(taxYear, { includePriorYear: false }),
    scheduledPayments(),
    reconciliationsForYear(taxYear),
    listLoanYears({ taxYear }),
  ]);

  // Closing costs count as activity in their own right. A property bought late
  // in December has no rent, no 1098 and nothing paid against it yet, and
  // dropping its row would take the one figure that year's return reports about
  // it - the settlement statement - off the screen with it.
  const withActivity = scheduleE.filter(
    (s) =>
      s.rentsReceivedCents !== 0 ||
      s.totalExpenseCents !== 0 ||
      s.capitalAdditionsCents !== 0 ||
      s.closingCostsCents !== null,
  );

  const total = (pick: (s: (typeof withActivity)[number]) => number) =>
    withActivity.reduce((sum, s) => sum + pick(s), 0);

  const rent = total((s) => s.rentsReceivedCents);
  const operating = total((s) => s.operatingExpenseCents);
  const shared = total((s) => s.sharedExpenseCents);
  const interest = total((s) => s.mortgageInterestCents);
  const propertyTax = total((s) => s.propertyTaxCents);
  const insurance = total((s) => s.insuranceCents);
  // Null is "did not close this year", which is not a figure to add. Every
  // other column here can be summed blind; this one cannot.
  const closingCosts = total((s) => s.closingCostsCents ?? 0);
  const depreciation = total((s) => s.depreciationCents);
  const deductible = total((s) => s.totalExpenseCents);
  const capital = total((s) => s.capitalAdditionsCents);
  const net = rent - deductible;

  const bySource = (source: 'ledger' | '1098' | 'cpa' | 'schedule') =>
    withActivity.reduce(
      (sum, summary) =>
        sum +
        summary.expenseLines
          .filter((line) => line.source === source && !line.isCapital)
          .reduce((subtotal, line) => subtotal + line.amountCents, 0),
      0,
    );

  const ledger = bySource('ledger');
  const from1098 = bySource('1098');
  const denominator = Math.max(1, ledger + from1098 + depreciation + capital);

  const unreconciled = reconciliations.filter(
    (view) => view.reportedGrossCents !== null && !view.isReconciled,
  );

  return (
    <>
      <PageHeader
        title="Overview"
        crumb={`${taxYear} · cash basis`}
        actions={
          <Link className="btn btn-primary" href={withYear('/log', taxYear)}>
            + Log
          </Link>
        }
      />
      <Well>
        <StatStrip
          stats={[
            {
              key: 'rent',
              label: 'Rent received',
              value: formatCents(rent),
              sub: `${data.taxYear} · banked, not invoiced`,
            },
            {
              key: 'deductible',
              label: 'Deductible',
              value: formatCents(deductible),
              sub: `incl. ${formatCents(depreciation)} depreciation`,
            },
            {
              key: 'net',
              label: 'Net',
              value: formatCents(net),
              sub: 'Schedule E line 21',
              tone: net >= 0 ? 'pos' : 'neg',
            },
            {
              key: 'capital',
              label: 'Capital additions',
              value: formatCents(capital),
              sub: 'not deducted here',
              tone: 'capital',
            },
            {
              key: 'hours',
              label: 'Hours logged',
              value: formatMinutes(data.hours.totalMinutes),
              sub: `${formatMinutes(data.hours.eligibleMinutes)} counting`,
              tone: data.hours.totalMinutes === 0 ? 'warn' : undefined,
            },
          ]}
        />

        {/*
          The table gets the whole width. Ten money columns in a 1fr column
          beside a 340px rail is ten money columns behind a horizontal scrollbar,
          and a figure you have to drag a table sideways to reach is a figure
          nobody checks. Everything that used to sit in that rail now sits under
          it, where it is read second anyway.
        */}
        <div className="mt-[18px]">
            <SectionTitle>Per property</SectionTitle>
            {withActivity.length === 0 ? (
              <Empty what="activity" year={taxYear} />
            ) : (
              <TableBox>
                <thead>
                  <tr>
                    <Th tip={`Opens the property, where every figure in this row is broken down line by line for ${taxYear}.`}>
                      Property
                    </Th>
                    <Th
                      nowrap
                      tip="The placed-in-service date: when it was ready to rent. Depreciation starts here and costs before it are acquisition rather than operating."
                    >
                      Available from
                    </Th>
                    <Th
                      numeric
                      tip={`Rent banked in ${taxYear}, from the receipts. What was owed but never arrived is not in here - this is cash basis.`}
                    >
                      Rent
                    </Th>
                    <Th
                      numeric
                      tip="Money that left the bank plus the 1098 figures, before depreciation. Paid in the year, not invoiced in it."
                    >
                      Expenses
                    </Th>
                    {/*
                      Four cuts of the column to their left, never addends to
                      it. The first three are the lines a filed return is
                      checked against one box at a time; the fourth answers a
                      different question about the same money, so an insurance
                      premium split five ways is inside two of these columns at
                      once. All four muted, for the same reason `of which
                      shared` always was.
                    */}
                    <Th
                      numeric
                      tip="Schedule E line 12, inside the expenses to the left. Every source added together - the 1098 figure and anything booked through the ledger - because the return has one box for it."
                    >
                      of which interest
                    </Th>
                    <Th
                      numeric
                      tip="Schedule E line 16, inside the expenses to the left. Property tax from the 1098's escrow block plus anything paid direct."
                    >
                      of which taxes
                    </Th>
                    <Th
                      numeric
                      tip="Schedule E line 9, inside the expenses to the left. Premiums paid from escrow plus policies paid direct."
                    >
                      of which insurance
                    </Th>
                    <Th
                      numeric
                      tip="Of the expenses to the left, the part that arrived as this property's share of a portfolio-wide cost rather than an invoice in its own name. Overlaps the three columns before it rather than adding to them."
                    >
                      of which shared
                    </Th>
                    <Th
                      numeric
                      tip="Schedule E line 18. Your CPA's figure where there is one; otherwise the flat schedule from the property's own start month and annual amount."
                    >
                      Depreciation
                    </Th>
                    <Th numeric tip="Schedule E line 20: expenses and depreciation together.">
                      Deductible
                    </Th>
                    <Th numeric tip="Schedule E line 21. Rent less the deductible total, depreciation included.">
                      Net
                    </Th>
                    <Th
                      numeric
                      tip="Improvements. Not deducted and not in the net - they are basis, and reach the return only through depreciation."
                    >
                      Capital
                    </Th>
                    <Th
                      numeric
                      tip={`From the settlement statement, and only against a property bought in ${taxYear} - blank everywhere else. Basis rather than a deduction, so it is in no total on this row; how much of it is depreciable is your CPA's call.`}
                    >
                      Closing costs
                    </Th>
                    <Th
                      numeric
                      tip="Deductible and capital added together: everything the property cost this year, whichever side of the line it fell on."
                    >
                      Total
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {withActivity.map((summary) => (
                    <tr key={summary.propertyId}>
                      <td>
                        <Link href={withYear(`/properties/${summary.propertyId}`, taxYear)}>
                          {summary.nickname}
                        </Link>
                      </td>
                      <td className="num muted">{summary.availableFrom ?? '—'}</td>
                      <td className="num">{formatCents(summary.rentsReceivedCents)}</td>
                      <td className="num">{formatCents(summary.operatingExpenseCents)}</td>
                      {/* Muted: each is a part of the column to its left, not a
                          figure to be added to it. */}
                      <td className="num muted">
                        {summary.mortgageInterestCents === 0
                          ? '—'
                          : formatCents(summary.mortgageInterestCents)}
                      </td>
                      <td className="num muted">
                        {summary.propertyTaxCents === 0
                          ? '—'
                          : formatCents(summary.propertyTaxCents)}
                      </td>
                      <td className="num muted">
                        {summary.insuranceCents === 0
                          ? '—'
                          : formatCents(summary.insuranceCents)}
                      </td>
                      <td className="num muted">
                        {summary.sharedExpenseCents === 0
                          ? '—'
                          : formatCents(summary.sharedExpenseCents)}
                      </td>
                      <td className="num">
                        {summary.depreciationCents === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          formatCents(summary.depreciationCents)
                        )}
                      </td>
                      <td className="num">{formatCents(summary.totalExpenseCents)}</td>
                      <td className={summary.netCents >= 0 ? 'num pos' : 'num neg'}>
                        {formatCents(summary.netCents)}
                      </td>
                      <td className="num capital">
                        {summary.capitalAdditionsCents === 0
                          ? '—'
                          : formatCents(summary.capitalAdditionsCents)}
                      </td>
                      {/* Capital-toned, not muted: like the column beside it
                          this is basis rather than a deduction, and it is the
                          tone that says so. */}
                      <td className="num capital">
                        {summary.closingCostsCents === null
                          ? '—'
                          : formatCents(summary.closingCostsCents)}
                      </td>
                      <td className="num">
                        {formatCents(
                          summary.totalExpenseCents + summary.capitalAdditionsCents,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Portfolio</td>
                    <td className="num">{formatCents(rent)}</td>
                    <td className="num">{formatCents(operating)}</td>
                    <td className="num">{formatCents(interest)}</td>
                    <td className="num">{formatCents(propertyTax)}</td>
                    <td className="num">{formatCents(insurance)}</td>
                    <td className="num">{formatCents(shared)}</td>
                    <td className="num">{formatCents(depreciation)}</td>
                    <td className="num">{formatCents(deductible)}</td>
                    <td className={net >= 0 ? 'num pos' : 'num neg'}>{formatCents(net)}</td>
                    <td className="num capital">{formatCents(capital)}</td>
                    <td className="num capital">
                      {closingCosts === 0 ? '—' : formatCents(closingCosts)}
                    </td>
                    <td className="num">{formatCents(deductible + capital)}</td>
                  </tr>
                </tfoot>
              </TableBox>
            )}

            {withActivity.length > 0 ? (
              <p className="hint mt-2">
                <strong>Expenses + Depreciation = Deductible</strong>, and{' '}
                <strong>Rent − Deductible = Net</strong>, which is Schedule E line 21 for that
                property. The four <strong>of which</strong> columns are all already inside
                Expenses and none of them adds to it — <strong>interest</strong>,{' '}
                <strong>taxes</strong> and <strong>insurance</strong> are lines 12, 16 and 9
                with every source summed, which is the shape a filed return is checked
                against, and <strong>shared</strong> cuts the same money a different way so a
                $5.97 line on a house can be traced back to the portfolio cost it came out
                of. A split insurance premium sits in two of those columns at once.{' '}
                <strong>Total</strong> is Deductible and Capital together — everything the
                property cost in {taxYear}, whichever side of the line it fell on.{' '}
                <strong>Closing costs</strong> are in no total at all: they show only against
                a property bought in {taxYear}, and they are basis rather than a deduction.
                Open any property to see every figure in its row broken out by Schedule E
                line.
                {withActivity.some((s) => s.depreciationSource === 'schedule') ? (
                  <>
                    {' '}
                    Depreciation shown against a property with no CPA figure yet is{' '}
                    <strong>your own schedule</strong>, from the start month and annual amount
                    on the property record.
                  </>
                ) : null}
              </p>
            ) : null}

        </div>

        {/*
          Directly under the table it describes, not off in the right rail. It
          is the same money broken up a second way - by where each figure came
          from rather than by which property it landed on - and reading one
          against the other meant scrolling between two columns that never
          lined up.
        */}
        <div className="cols-detail mt-[18px]">
          <div>
            <SectionTitle>Where the deductions come from</SectionTitle>
            <Panel>
              <div className={net >= 0 ? 'panel-figure pos' : 'panel-figure neg'}>
                {formatCents(net)}
              </div>
              <p className="muted">Rent banked less everything Schedule E lets you deduct.</p>
              <SplitBar
                parts={[
                  {
                    key: 'ledger',
                    label: `Ledger ${formatCents(ledger)}`,
                    pct: (ledger / denominator) * 100,
                    color: 'var(--accent)',
                  },
                  {
                    key: '1098',
                    label: `1098 ${formatCents(from1098)}`,
                    pct: (from1098 / denominator) * 100,
                    color: 'var(--pos)',
                  },
                  {
                    key: 'depreciation',
                    label: `Depreciation ${formatCents(depreciation)}`,
                    pct: (depreciation / denominator) * 100,
                    color: 'var(--warn)',
                  },
                  {
                    key: 'capital',
                    label: `Capital ${formatCents(capital)}`,
                    pct: (capital / denominator) * 100,
                    color: 'var(--plum)',
                  },
                ]}
              />
              <Note>
                Capital is shown alongside, never inside the net. An improvement is basis, and
                it reaches the return only through the depreciation band beside it — never as
                a deduction in the year it was spent.
              </Note>
            </Panel>

            <SectionTitle>Waiting on a decision</SectionTitle>
            <TableBox>
              <tbody>
                {data.needsReviewCount > 0 ? (
                  <tr>
                    <td className="nowrap">
                      <Tag tone="warn">Review</Tag>
                    </td>
                    <td>
                      <strong>{data.needsReviewCount}</strong> expenses on physical work with
                      no repair-or-improvement answer
                    </td>
                    <td className="num nowrap">
                      <Link className="btn" href={withYear('/entries?tab=expenses', taxYear)}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ) : null}
                {/* Its own row, not folded into the count above. This one is
                    money that HAS left the bank and is missing from the
                    Deductible figure at the top of this page, which is a
                    different and louder problem than an unanswered question. */}
                {data.missingPropertyCount > 0 ? (
                  <tr>
                    <td className="nowrap">
                      <Tag tone="neg">Property</Tag>
                    </td>
                    {/* The amount leads, because the amount is the problem. A
                        count says how many chores are open; the figure says
                        exactly how much the per-property table is short by,
                        which is the only form of this warning any use to
                        someone reconciling against a filed return. */}
                    <td>
                      <strong>{formatCents(data.missingPropertyCents)}</strong> paid across{' '}
                      {data.missingPropertyCount}{' '}
                      {data.missingPropertyCount === 1 ? 'expense' : 'expenses'} with no
                      property or split — not on Schedule E, and missing from every figure
                      above
                    </td>
                    <td className="num nowrap">
                      <Link className="btn" href={withYear('/entries?tab=expenses', taxYear)}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ) : null}
                {data.w9Warnings.map((warning) => (
                  <tr key={warning.actorId}>
                    <td className="nowrap">
                      <Tag tone={warning.isPersistent ? 'neg' : 'warn'}>W-9</Tag>
                    </td>
                    <td>
                      {warning.name} has been paid {formatCents(warning.paidCents)} with no W-9
                      on file
                    </td>
                    <td className="num nowrap">
                      <Link className="btn" href="/people">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
                {scheduled.length > 0 ? (
                  <tr>
                    <td className="nowrap">
                      <Tag tone="capital">Planned</Tag>
                    </td>
                    <td>
                      <strong>
                        {formatCents(
                          scheduled.reduce((t, row) => t + row.payment.amountCents, 0),
                        )}
                      </strong>{' '}
                      scheduled but not yet paid — deductible in no year until confirmed
                    </td>
                    <td className="num nowrap">
                      <Link className="btn" href={withYear('/year-end', taxYear)}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ) : null}
                {unreconciled.map((view) => (
                  <tr key={view.propertyId}>
                    <td className="nowrap">
                      <Tag tone="warn">1099</Tag>
                    </td>
                    <td>
                      {view.propertyNickname} is out by{' '}
                      {formatCents(view.residualCents ?? 0)} against the 1099
                    </td>
                    <td className="num nowrap">
                      <Link className="btn" href={withYear('/year-end', taxYear)}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
                {data.needsReviewCount === 0 &&
                data.missingPropertyCount === 0 &&
                data.w9Warnings.length === 0 &&
                scheduled.length === 0 &&
                unreconciled.length === 0 ? (
                  <tr>
                    <td className="muted">Nothing is waiting on you.</td>
                  </tr>
                ) : null}
              </tbody>
            </TableBox>
          </div>

          <div className="stack">
            <Panel title={`Closing ${taxYear}`}>
              <KeyValues
                rows={[
                  {
                    key: 'loans',
                    label: '1098s entered',
                    value: `${loans.length}`,
                    tone: loans.length > 0 ? 'pos' : 'muted',
                  },
                  {
                    key: 'rec',
                    label: 'Rent vs 1099',
                    value:
                      reconciliations.filter((r) => r.reportedGrossCents !== null).length === 0
                        ? 'not started'
                        : `${reconciliations.filter((r) => r.isReconciled).length} square`,
                    tone: unreconciled.length === 0 ? 'pos' : 'warn',
                  },
                  {
                    key: 'sched',
                    label: 'Scheduled payments',
                    value: scheduled.length === 0 ? 'none open' : `${scheduled.length} open`,
                    tone: scheduled.length === 0 ? 'pos' : 'warn',
                  },
                  {
                    key: 'hours',
                    label: 'Hours toward 250',
                    value: formatMinutes(data.hours.eligibleMinutes),
                    tone: data.hours.eligibleMinutes === 0 ? 'warn' : undefined,
                  },
                ]}
              />
              <Link
                className="btn btn-primary btn-block mt-3"
                href={withYear('/year-end', taxYear)}
              >
                Open year-end
              </Link>
            </Panel>
          </div>
        </div>
      </Well>
    </>
  );
}
