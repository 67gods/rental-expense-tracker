import Link from 'next/link';
import { formatCents, formatMinutes, sumCents } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { getDashboardData } from '@/server/services/dashboard';
import { buildScheduleE, type SchedulePropertySummary } from '@/server/services/reports';
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
  Tip,
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
 * just glanced at, and it runs VERTICALLY for that reason: one column per
 * property, rent at the top, each row subtracting, landing on Schedule E line
 * 21 at the bottom. That is the direction the sum runs, so every step of it is
 * checkable by eye against the figure above it.
 *
 * The version before this one laid the same figures out as a row per property
 * and could not be read. It carried four `of which` columns that overlapped
 * each other AND overlapped the column to their left, so no row on the screen
 * added up to anything - the reader had no way to tell which numbers were
 * addends and which were re-cuts of money already counted.
 *
 * So the rule here is: EVERY ROW EITHER ADDS OR IS FENCED OFF AND SAID TO. The
 * five expense rows are mutually exclusive and sum to `Cash out`; that plus
 * depreciation is line 20; rent less line 20 is line 21. Below the result sit
 * the memo rows - capital, closing costs - which subtract from nothing, and
 * are under their own band saying so.
 *
 * Every row still carries a tooltip, because "Total expenses $14,897.52" is
 * unanswerable without one - paid or invoiced, depreciation in or out, does
 * this property's share of the portfolio software count - and each of those
 * questions changes the number.
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

  /*
   * The five expense rows have to be MUTUALLY EXCLUSIVE or the column does not
   * add up, and a column that does not add up is the thing this table exists
   * to fix.
   *
   * `sharedExpenseCents` cannot be subtracted alongside the three named lines
   * to get there. It is a second CUT of the same money rather than a fifth
   * pile of it: a portfolio insurance premium split five ways sits inside both
   * it and `insuranceCents`, and taking both off would deduct that premium
   * twice. So the shared row is only the shared spend NOT already on one of
   * the three named lines, and `everything else` is whatever survives all four.
   *
   * Which makes the invariant, per property and in the portfolio column:
   *
   *   interest + tax + insurance + everythingElse + sharedOther === operating
   */
  const NAMED_LINES = new Set(['mortgage_interest', 'taxes', 'insurance']);

  const sharedOtherCents = (s: SchedulePropertySummary) =>
    sumCents(
      s.expenseLines
        .filter(
          (line) =>
            line.isShared &&
            !line.isCapital &&
            line.categoryId !== 'depreciation' &&
            !NAMED_LINES.has(line.categoryId),
        )
        .map((line) => line.amountCents),
    );

  const everythingElseCents = (s: SchedulePropertySummary) =>
    s.operatingExpenseCents -
    s.mortgageInterestCents -
    s.propertyTaxCents -
    s.insuranceCents -
    sharedOtherCents(s);

  const total = (pick: (s: (typeof withActivity)[number]) => number) =>
    withActivity.reduce((sum, s) => sum + pick(s), 0);

  const rent = total((s) => s.rentsReceivedCents);
  const operating = total((s) => s.operatingExpenseCents);
  const sharedOther = total(sharedOtherCents);
  const everythingElse = total(everythingElseCents);
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

  /*
   * The calculation, as data.
   *
   * One list rather than hand-written rows because the arithmetic only READS
   * as arithmetic when every row is laid out identically - a row that decides
   * for itself where the dash goes or how the label sits is a row you have to
   * stop and re-check, which defeats reading the column straight down.
   */
  type LedgerEntry =
    | { kind: 'band'; key: string; label: string }
    | {
        kind: 'row';
        key: string;
        /** The gutter glyph. Absent on a memo row, which neither adds nor subtracts. */
        op?: string;
        label: string;
        /** The Schedule E box, worn as a chip beside the label. */
        line?: string;
        sub?: string;
        tip: string;
        pick: (s: SchedulePropertySummary) => number | null;
        portfolio: number | null;
        /**
         * On most rows a zero means "nothing here" and reads better as a dash.
         * On a subtotal or a result it is a real answer and has to be shown.
         */
        zeroIsReal?: boolean;
        tone?: 'signed' | 'capital';
        rowClass?: string;
      };

  const ledgerRows: LedgerEntry[] = [
    { kind: 'band', key: 'in', label: 'Money in' },
    {
      kind: 'row',
      key: 'rent',
      label: 'Rent received',
      line: 'line 3',
      tip: `Rent banked in ${taxYear}, from the receipts. What was owed but never arrived is not in here - this is cash basis.`,
      pick: (s) => s.rentsReceivedCents,
      portfolio: rent,
    },

    { kind: 'band', key: 'out', label: 'Money out — paid from the bank' },
    {
      kind: 'row',
      key: 'interest',
      op: '−',
      label: 'Mortgage interest',
      line: 'line 12',
      tip: 'Every source added together - the 1098 figure and anything booked through the ledger - because the return has one box for it.',
      pick: (s) => s.mortgageInterestCents,
      portfolio: interest,
    },
    {
      kind: 'row',
      key: 'tax',
      op: '−',
      label: 'Property tax',
      line: 'line 16',
      tip: "Property tax from the 1098's escrow block plus anything paid direct.",
      pick: (s) => s.propertyTaxCents,
      portfolio: propertyTax,
    },
    {
      kind: 'row',
      key: 'insurance',
      op: '−',
      label: 'Insurance',
      line: 'line 9',
      tip: 'Premiums paid out of escrow plus policies paid direct.',
      pick: (s) => s.insuranceCents,
      portfolio: insurance,
    },
    {
      kind: 'row',
      key: 'else',
      op: '−',
      label: 'Everything else',
      line: 'lines 5–19',
      sub: 'Repairs, cleaning, supplies, utilities, advertising, other.',
      tip: 'Every remaining deductible line, added together. Open the property to see which ones and how much each.',
      pick: everythingElseCents,
      portfolio: everythingElse,
    },
    {
      kind: 'row',
      key: 'shared',
      op: '−',
      label: 'Shared portfolio costs',
      line: 'within 19',
      sub: "This property's slice of a bill that never carried its name.",
      tip: 'Portfolio-wide costs split across properties - and only the part not already counted in the three lines above, so this column still adds up.',
      pick: sharedOtherCents,
      portfolio: sharedOther,
    },
    {
      kind: 'row',
      key: 'cash-out',
      op: '=',
      label: 'Cash out',
      rowClass: 'subtotal-soft',
      tip: 'The five rows above, added. Every cent of this one has a receipt behind it.',
      pick: (s) => s.operatingExpenseCents,
      portfolio: operating,
      zeroIsReal: true,
    },

    { kind: 'band', key: 'noncash', label: 'Money out — no cheque written' },
    {
      kind: 'row',
      key: 'depreciation',
      op: '−',
      label: 'Depreciation',
      line: 'line 18',
      sub: 'Blank means none on file yet, not nothing to claim.',
      tip: "Your CPA's figure where there is one; otherwise the flat schedule from the property's own start month and annual amount.",
      pick: (s) => s.depreciationCents,
      portfolio: depreciation,
    },
    {
      kind: 'row',
      key: 'total-expenses',
      op: '=',
      label: 'Total expenses',
      line: 'line 20',
      rowClass: 'subtotal',
      tip: 'Cash out and depreciation together. This is the box the return totals to.',
      pick: (s) => s.totalExpenseCents,
      portfolio: deductible,
      zeroIsReal: true,
    },
    {
      kind: 'row',
      key: 'net',
      op: '=',
      label: 'Net — rent less total expenses',
      line: 'line 21',
      rowClass: 'result',
      tip: 'What the return reports for this property. Capital additions are not in it and never will be.',
      pick: (s) => s.netCents,
      portfolio: net,
      zeroIsReal: true,
      tone: 'signed',
    },

    { kind: 'band', key: 'memo', label: 'Memo — on no line of the return' },
    {
      kind: 'row',
      key: 'cash-left',
      label: 'Cash left after the bills',
      sub: 'Rent less cash out, before depreciation.',
      rowClass: 'memo',
      tip: 'What the year did to the bank balance, ignoring the one deduction no cheque was written for. On no return, but it is the figure that says whether a property is paying for itself.',
      pick: (s) => s.rentsReceivedCents - s.operatingExpenseCents,
      portfolio: rent - operating,
      zeroIsReal: true,
      tone: 'signed',
    },
    {
      kind: 'row',
      key: 'capital',
      label: 'Capital additions',
      sub: 'Improvements. Basis, not a deduction.',
      rowClass: 'memo',
      tip: 'Not deducted and not in the net above - they are basis, and reach the return only through depreciation, spread over the recovery period.',
      pick: (s) => s.capitalAdditionsCents,
      portfolio: capital,
      tone: 'capital',
    },
    {
      kind: 'row',
      key: 'closing',
      label: 'Closing costs',
      sub: `Only against a property bought in ${taxYear}.`,
      rowClass: 'memo',
      tip: 'From the settlement statement. Basis rather than a deduction, so it is in no total here; how much of it is depreciable is your CPA’s call.',
      pick: (s) => s.closingCostsCents,
      portfolio: closingCosts === 0 ? null : closingCosts,
      tone: 'capital',
    },
  ];

  // A figure that is absent and a figure that is genuinely zero are the same
  // dash everywhere except on the rows where zero is the answer.
  const isBlank = (row: Extract<LedgerEntry, { kind: 'row' }>, value: number | null) =>
    value === null || (value === 0 && !row.zeroIsReal);

  const cellClass = (row: Extract<LedgerEntry, { kind: 'row' }>, value: number | null) => {
    if (isBlank(row, value)) return 'num muted';
    if (row.tone === 'signed') return value! >= 0 ? 'num pos' : 'num neg';
    if (row.tone === 'capital') return 'num capital';
    return 'num';
  };

  const cellText = (row: Extract<LedgerEntry, { kind: 'row' }>, value: number | null) =>
    isBlank(row, value) ? '—' : formatCents(value!);

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
          The table gets the whole width. Turned vertical it needs less of it
          than the row-per-property version did - two label columns and one
          column per property - but the calculation still has to be readable
          without dragging anything sideways, and a figure you have to scroll
          to reach is a figure nobody checks. Everything that used to sit in a
          right rail now sits under it, where it is read second anyway.
        */}
        <div className="mt-[18px]">
          <SectionTitle>Per property</SectionTitle>
          {withActivity.length === 0 ? (
            <Empty what="activity" year={taxYear} />
          ) : (
            <TableBox variant="ledger">
              <thead>
                <tr>
                  {/* The operator gutter has no heading. It is punctuation. */}
                  <th className="op" aria-hidden="true" />
                  <th>{taxYear} · cash basis</th>
                  {withActivity.map((summary) => (
                    <th className="num" key={summary.propertyId}>
                      <Link href={withYear(`/properties/${summary.propertyId}`, taxYear)}>
                        {summary.nickname}
                      </Link>
                      {/* The placed-in-service date: when it was ready to rent.
                          Depreciation starts there, and it is the line every
                          figure in the column falls one side or the other of. */}
                      <span className="when">
                        {summary.availableFrom ? `avail. ${summary.availableFrom}` : 'no date'}
                      </span>
                    </th>
                  ))}
                  <th className="num total-col">
                    Portfolio
                    <span className="when">
                      {withActivity.length}{' '}
                      {withActivity.length === 1 ? 'property' : 'properties'}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((row) =>
                  row.kind === 'band' ? (
                    <tr className="band" key={row.key}>
                      <td colSpan={withActivity.length + 3}>{row.label}</td>
                    </tr>
                  ) : (
                    <tr className={row.rowClass} key={row.key}>
                      <td className="op">{row.op ?? ''}</td>
                      <td className="item">
                        <Tip body={row.tip}>{row.label}</Tip>
                        {row.line ? <span className="ln">{row.line}</span> : null}
                        {row.sub ? <span className="item-sub">{row.sub}</span> : null}
                      </td>
                      {withActivity.map((summary) => {
                        const value = row.pick(summary);
                        return (
                          <td className={cellClass(row, value)} key={summary.propertyId}>
                            {cellText(row, value)}
                          </td>
                        );
                      })}
                      <td className={`${cellClass(row, row.portfolio)} total-col`}>
                        {cellText(row, row.portfolio)}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </TableBox>
          )}

          {withActivity.length > 0 ? (
            <p className="hint mt-2">
              <strong>Read a column downwards.</strong> Start at rent, subtract each row as
              you meet it, and the figure at the double rule is{' '}
              <strong>Schedule E line 21</strong> for that property. The five rows under{' '}
              <strong>money out</strong> are mutually exclusive and add up to{' '}
              <strong>cash out</strong> — nothing is counted twice and nothing is left over
              — and cash out plus <strong>depreciation</strong> is{' '}
              <strong>line 20</strong>, the box the return totals to. Everything under the
              last band subtracts from nothing: <strong>capital additions</strong> and{' '}
              <strong>closing costs</strong> are basis rather than deductions, and reach a
              return only later, through depreciation. Open any property to see a row broken
              out line by line.
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
