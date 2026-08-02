import { formatCents, formatMinutes, totalMiles } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { buildScheduleE, REPORTS, timeSummaryByActor } from '@/server/services/reports';
import { listTrips } from '@/server/services/trips';

export const metadata = { title: 'Reports' };

/**
 * Reports and export (§7.6).
 *
 * The on-screen tables are for checking the figures look right before sending
 * them; the CSVs are the deliverable. Nothing here interprets the numbers.
 */
export default async function ReportsPage({
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

  const [scheduleE, byActor, trips] = await Promise.all([
    buildScheduleE(taxYear),
    timeSummaryByActor(taxYear, user.enterprise.id),
    listTrips({ taxYear, limit: 20_000 }),
  ]);

  const years = [taxYear + 1, taxYear, taxYear - 1, taxYear - 2].filter(
    (y) => y <= user.taxYear,
  );

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">Reports · {taxYear}</h1>
        <nav className="chip-row" aria-label="Tax year">
          {years.map((year) => (
            <a
              key={year}
              href={`/reports?year=${year}`}
              className={year === taxYear ? 'chip chip-on' : 'chip'}
            >
              {year}
            </a>
          ))}
        </nav>
      </div>

      <section>
        <h2 className="section-title mb-2">Download for your CPA</h2>
        <div className="card">
          {(Object.keys(REPORTS) as (keyof typeof REPORTS)[]).map((id) => (
            <div key={id} className="row">
              <div className="row-main">
                <p className="row-title">{REPORTS[id].label}</p>
                <p className="row-meta">{taxYear}-{id}.csv</p>
              </div>
              <a
                className="btn btn-ghost shrink-0 text-xs"
                href={`/api/v1/export/${id}?taxYear=${taxYear}`}
                download
              >
                Download
              </a>
            </div>
          ))}
        </div>
        <p className="hint mt-2">
          Plain CSV, openable in anything. Amounts are in dollars, hours in decimals.
        </p>
      </section>

      <section>
        <h2 className="section-title mb-2">Hours by person</h2>
        <div className="table-wrap card">
          <table className="table">
            <thead>
              <tr>
                <th>Person</th>
                <th className="num">Eligible</th>
                <th className="num">Total logged</th>
                <th className="num">Entries</th>
              </tr>
            </thead>
            <tbody>
              {byActor.map((row) => (
                <tr key={row.actorId}>
                  <td>{row.name}</td>
                  {/* Kept as two columns because they cannot be pooled (§4). */}
                  <td className="num">{formatMinutes(row.totals.eligibleMinutes)}</td>
                  <td className="num">{formatMinutes(row.totals.totalMinutes)}</td>
                  <td className="num">{row.totals.entryCount}</td>
                </tr>
              ))}
              {byActor.length === 0 ? (
                <tr>
                  <td colSpan={4} className="hint">
                    No time logged in {taxYear} yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="hint mt-2">
          Each person&rsquo;s hours stand alone. They are not added together, because for
          some tests they cannot be.
        </p>
      </section>

      <section>
        <h2 className="section-title mb-2">Schedule E by property</h2>
        <div className="table-wrap card">
          <table className="table">
            <thead>
              <tr>
                <th>Property</th>
                <th className="num">Rents received</th>
                <th className="num">Expenses</th>
                <th className="num">Net</th>
              </tr>
            </thead>
            <tbody>
              {scheduleE.map((summary) => (
                <tr key={summary.propertyId}>
                  <td>{summary.nickname}</td>
                  <td className="num">{formatCents(summary.rentsReceivedCents)}</td>
                  <td className="num">{formatCents(summary.totalExpenseCents)}</td>
                  <td className="num">{formatCents(summary.netCents)}</td>
                </tr>
              ))}
              {scheduleE.length === 0 ? (
                <tr>
                  <td colSpan={4} className="hint">
                    No properties yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="section-title mb-2">Mileage</h2>
        <div className="card card-pad">
          <p className="tnum text-2xl font-bold tracking-tight">
            {totalMiles(trips.map((t) => ({ miles: Number(t.miles) })))} miles
          </p>
          <p className="hint">
            Across {trips.length} {trips.length === 1 ? 'trip' : 'trips'}. The log exports
            with dates, endpoints, and business purpose. It carries no dollar figure —
            your CPA applies the rate.
          </p>
        </div>
      </section>
    </div>
  );
}
