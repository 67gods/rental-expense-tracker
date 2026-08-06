import Link from 'next/link';
import { formatCents, formatMinutes, totalMiles } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { buildScheduleE, REPORTS, timeSummaryByActor } from '@/server/services/reports';
import { listTrips } from '@/server/services/trips';
import { PageHeader } from '@/components/ui/PageHeader';
import { Well } from '@/components/ui';

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
    <>
      <PageHeader
        title={`Reports · ${taxYear}`}
        actions={
          <nav className="seg" aria-label="Tax year">
            {years.map((year) => (
              <a
                key={year}
                href={`/reports?year=${year}`}
                aria-current={year === taxYear}
              >
                {year}
              </a>
            ))}
          </nav>
        }
      />
      <Well>
        {/*
          The way in to the January sitting.

          Not a sixth tab: TabBar caps at five for a stated reason - a sixth
          shrinks every target below comfortable thumb reach - and a screen used
          one week a year is the wrong thing to spend the last slot on. It sits at
          the top of Reports because Reports is already where you go when it is
          time to hand something to the CPA.
        */}
        <Link href={`/year-end?year=${taxYear}`} className="panel panel-body">
          <p className="rowtitle">Year-end · {taxYear}</p>
          <p className="hint">
            The 1098s, rent against the 1099, payments still only planned, and the figures your
            CPA sent back. One sitting, one page.
          </p>
        </Link>



        <section>
          <h2 className="section-title mb-2">Hours by person</h2>
          <div className="tablebox tablescroll">
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
          <div className="tablebox tablescroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th className="num">Rents received</th>
                  <th className="num">Ledger</th>
                  <th className="num">1098</th>
                  <th className="num">CPA</th>
                  <th className="num">Depreciation</th>
                  <th className="num">Net</th>
                  <th className="num">Capital</th>
                </tr>
              </thead>
              <tbody>
                {scheduleE.map((summary) => {
                  // Depreciation has its own column, so it comes out of the
                  // source columns - otherwise the CPA column and the
                  // depreciation column would show the same money twice.
                  const bySource = (source: 'ledger' | '1098' | 'cpa') =>
                    summary.expenseLines
                      .filter(
                        (l) =>
                          l.source === source && !l.isCapital && l.categoryId !== 'depreciation',
                      )
                      .reduce((total, l) => total + l.amountCents, 0);

                  return (
                    <tr key={summary.propertyId}>
                      <td>{summary.nickname}</td>
                      <td className="num">{formatCents(summary.rentsReceivedCents)}</td>
                      {/* Split by where each figure came from rather than shown as
                          one total: a line fed by both the ledger and a 1098 is a
                          possible double count, and merging them would hide it. */}
                      <td className="num">{formatCents(bySource('ledger'))}</td>
                      <td className="num">{formatCents(bySource('1098'))}</td>
                      <td className="num">{formatCents(bySource('cpa'))}</td>
                      <td className="num">
                        {formatCents(summary.depreciationCents)}
                        {summary.depreciationSource === 'schedule' ? (
                          <span className="hint"> your schedule</span>
                        ) : null}
                      </td>
                      <td className="num">{formatCents(summary.netCents)}</td>
                      {/* Alongside the net, never inside it. */}
                      <td className="num">{formatCents(summary.capitalAdditionsCents)}</td>
                    </tr>
                  );
                })}
                {scheduleE.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="hint">
                      No properties yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="hint mt-2">
            Expense amounts are what actually left the bank in {taxYear}, not what was invoiced.
            An invoice dated December and paid in January belongs to January.
          </p>
          <p className="hint mt-1">
            <strong>Capital is listed separately and is not in the net.</strong> Anything marked
            an improvement is basis your CPA depreciates, not a deduction this year — it reaches
            the net only through the depreciation column, spread over the recovery period.
          </p>
          <p className="hint mt-1">
            <strong>Net is Schedule E line 21</strong> — rents less every column between,
            depreciation included. A depreciation figure marked <em>your schedule</em> is the
            flat amount on the property record, apportioned for its first year; a figure your
            CPA sends back for the year replaces it everywhere.
          </p>
        </section>

        <section>
          <h2 className="section-title mb-2">Mileage</h2>
          <div className="panel panel-body">
            <p className="num text-2xl font-bold tracking-tight">
              {totalMiles(trips.map((t) => ({ miles: Number(t.miles) })))} miles
            </p>
            <p className="hint">
              Across {trips.length} {trips.length === 1 ? 'trip' : 'trips'}. The log exports
              with dates, endpoints, and business purpose. It carries no dollar figure —
              your CPA applies the rate.
            </p>
          </div>
        </section>
        {/*
          Downloads LAST, and as a grid.

          Twelve reports as full-width rows is a screen and a half of scrolling
          before any number appears, and the numbers are what you came for. Each
          one is now a single tile: the label is the link, the filename is the
          subtitle, and twelve of them fit in the space four used to take.
        */}
        <section>
          <h2 className="section-title mb-2">Download for your CPA</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(REPORTS) as (keyof typeof REPORTS)[]).map((id) => (
              <a
                key={id}
                className="panel panel-body"
                href={`/api/v1/export/${id}?taxYear=${taxYear}`}
                download
              >
                <p className="rowtitle">{REPORTS[id].label}</p>
                <p className="hint num">
                  {taxYear}-{id}.csv
                </p>
              </a>
            ))}
          </div>
          <p className="hint mt-2">
            Plain CSV, openable in anything. Amounts are in dollars, hours in decimals. The whole
            tile is the download.
          </p>
        </section>
      </Well>
    </>
  );
}
