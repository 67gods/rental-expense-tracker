import { formatCents } from '@rental/domain';
import type { SchedulePropertySummary } from '@/server/services/reports';
import { TableBox, Tag } from '@/components/ui';

/**
 * How one property's year adds up, line by line.
 *
 * This exists because "Deductible $14,897.52" is not a figure anyone can check.
 * The overview shows the total; this shows the eight rows that make it, each
 * stamped with where it came from, so the answer to "how did we get that" is a
 * click rather than an afternoon with the CSV.
 *
 * Ordered by Schedule E line number rather than by size or by source, because
 * that is the order the form is read in and the CPA is holding the form.
 */
export function ScheduleEBreakdown({
  summary,
  taxYear,
}: {
  summary: SchedulePropertySummary;
  taxYear: number;
}) {
  const deductible = summary.expenseLines
    .filter((line) => !line.isCapital)
    .sort((a, b) => a.line - b.line || a.label.localeCompare(b.label));
  const capital = summary.expenseLines.filter((line) => line.isCapital);

  return (
    <section className="panel panel-body">
      <h2 className="section-title">How {taxYear} adds up</h2>

      <TableBox>
        <thead>
          <tr>
            <th className="num">Line</th>
            <th>What</th>
            <th>Where it came from</th>
            <th className="num">{taxYear}</th>
            <th className="num">{taxYear - 1}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="num muted">3</td>
            <td>Rents received</td>
            <td>
              <Tag tone="pos">Banked</Tag>
            </td>
            <td className="num">{formatCents(summary.rentsReceivedCents)}</td>
            <td className="num muted">—</td>
          </tr>

          {deductible.map((line) => (
            <tr key={`${line.categoryId}:${line.source}:${line.isShared}`}>
              <td className="num muted">{line.line}</td>
              <td>
                {line.label}
                {line.isShared ? (
                  <span className="hint"> your share of a portfolio-wide cost</span>
                ) : null}
              </td>
              <td>
                <SourceTag source={line.source} isShared={line.isShared} />
              </td>
              <td className="num">{formatCents(line.amountCents)}</td>
              <td className="num muted">
                {line.priorYearCents === 0 ? '—' : formatCents(line.priorYearCents)}
              </td>
            </tr>
          ))}

          {deductible.length === 0 ? (
            <tr>
              <td colSpan={5} className="hint">
                Nothing deductible recorded against this property in {taxYear}.
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>Expenses before depreciation</td>
            <td className="num">{formatCents(summary.operatingExpenseCents)}</td>
            <td className="num" />
          </tr>
          <tr>
            <td colSpan={3}>Total expenses — line 20</td>
            <td className="num">{formatCents(summary.totalExpenseCents)}</td>
            <td className="num" />
          </tr>
          <tr>
            <td colSpan={3}>Net — line 21</td>
            <td className={summary.netCents >= 0 ? 'num pos' : 'num neg'}>
              {formatCents(summary.netCents)}
            </td>
            <td className="num" />
          </tr>
        </tfoot>
      </TableBox>

      {summary.depreciationNote ? (
        <p className="hint mt-2">
          <strong>Depreciation:</strong> {summary.depreciationNote}
          {summary.depreciationSource === 'schedule'
            ? ' This is your own working, not a figure off a return — a CPA figure entered for this year under closing the year replaces it.'
            : null}
        </p>
      ) : (
        <p className="hint mt-2">
          <strong>No depreciation on this property for {taxYear}.</strong> Fill in the start
          month and the annual amount below, or enter your CPA&rsquo;s figure under closing the
          year.
        </p>
      )}

      {capital.length > 0 ? (
        <>
          <h3 className="section-title">Capital additions — not deducted</h3>
          <TableBox>
            <tbody>
              {capital.map((line) => (
                <tr key={`cap:${line.categoryId}`}>
                  <td>{line.label}</td>
                  <td className="num capital">{formatCents(line.amountCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total added to basis</td>
                <td className="num capital">{formatCents(summary.capitalAdditionsCents)}</td>
              </tr>
            </tfoot>
          </TableBox>
          <p className="hint mt-2">
            Improvements are basis, not a deduction. They are absent from every total above
            and reach the return only through depreciation, spread over the recovery period.
          </p>
        </>
      ) : null}
    </section>
  );
}

/** Four sources, four tones, so a doubled figure is visible at a glance. */
function SourceTag({ source, isShared }: { source: string; isShared: boolean }) {
  if (source === '1098') return <Tag tone="info">1098</Tag>;
  if (source === 'cpa') return <Tag tone="pos">Your CPA</Tag>;
  if (source === 'schedule') return <Tag tone="warn">Your schedule</Tag>;
  return <Tag tone="muted">{isShared ? 'Ledger — split' : 'Ledger — paid'}</Tag>;
}
