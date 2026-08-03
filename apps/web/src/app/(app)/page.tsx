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
  Well,
} from '@/components/ui';
import { resolveTaxYear, withYear } from '@/lib/year';

export const metadata = { title: 'Overview' };

/**
 * The year in one screen.
 *
 * Ordered by what a person actually wants: the five figures that describe the
 * year, then the same figures per property, then anything waiting on a
 * decision. Nothing here computes a tax position - the net is rent banked less
 * what left the bank, and depreciation is absent because the CPA supplies it.
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

  const withActivity = scheduleE.filter(
    (s) => s.rentsReceivedCents !== 0 || s.totalExpenseCents !== 0 || s.capitalAdditionsCents !== 0,
  );

  const rent = withActivity.reduce((t, s) => t + s.rentsReceivedCents, 0);
  const deductible = withActivity.reduce((t, s) => t + s.totalExpenseCents, 0);
  const capital = withActivity.reduce((t, s) => t + s.capitalAdditionsCents, 0);
  const net = rent - deductible;

  const bySource = (source: 'ledger' | '1098' | 'cpa') =>
    withActivity.reduce(
      (total, summary) =>
        total +
        summary.expenseLines
          .filter((line) => line.source === source && !line.isCapital)
          .reduce((sum, line) => sum + line.amountCents, 0),
      0,
    );

  const ledger = bySource('ledger');
  const from1098 = bySource('1098');
  const denominator = Math.max(1, ledger + from1098 + capital);

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
              sub: 'what left the bank',
            },
            {
              key: 'net',
              label: 'Net',
              value: formatCents(net),
              sub: 'before depreciation',
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

        <div className="cols-detail mt-[18px]">
          <div>
            <SectionTitle>Per property</SectionTitle>
            {withActivity.length === 0 ? (
              <Empty what="activity" year={taxYear} />
            ) : (
              <TableBox>
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>Available from</th>
                    <th className="num">Rent</th>
                    <th className="num">Deductible</th>
                    <th className="num">Net</th>
                    <th className="num">Capital</th>
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
                      <td className="num">{formatCents(summary.totalExpenseCents)}</td>
                      <td className={summary.netCents >= 0 ? 'num pos' : 'num neg'}>
                        {formatCents(summary.netCents)}
                      </td>
                      <td className="num capital">
                        {summary.capitalAdditionsCents === 0
                          ? '—'
                          : formatCents(summary.capitalAdditionsCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Portfolio</td>
                    <td className="num">{formatCents(rent)}</td>
                    <td className="num">{formatCents(deductible)}</td>
                    <td className={net >= 0 ? 'num pos' : 'num neg'}>{formatCents(net)}</td>
                    <td className="num capital">{formatCents(capital)}</td>
                  </tr>
                </tfoot>
              </TableBox>
            )}

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
            <Panel title="Where the deductions come from">
              <div className={net >= 0 ? 'panel-figure pos' : 'panel-figure neg'}>
                {formatCents(net)}
              </div>
              <p className="muted">Rent banked less what actually left the bank.</p>
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
                    key: 'capital',
                    label: `Capital ${formatCents(capital)}`,
                    pct: (capital / denominator) * 100,
                    color: 'var(--plum)',
                  },
                ]}
              />
              <Note>
                Capital is shown alongside, never inside the net. An improvement is basis your
                CPA depreciates — it reaches the return as their figure on line 18, not as a
                deduction here.
              </Note>
            </Panel>

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
