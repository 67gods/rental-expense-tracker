import { reportFilename, withBom } from '@rental/domain';
import { query, route } from '@/server/http';
import { NotFoundError } from '@/server/errors';
import { isReportId, REPORTS } from '@/server/services/reports';

/**
 * CSV download (§3: data exportable at any time, no lock-in).
 *
 * Streams as a file attachment with a UTF-8 BOM, because Excel on Windows
 * otherwise reads the file as the system codepage and mangles any name with an
 * accent in it.
 */
export const GET = route(async (user, request, { params }: { params: Promise<{ report: string }> }) => {
  const { report } = await params;
  if (!isReportId(report)) {
    throw new NotFoundError(`There is no "${report}" report.`);
  }

  const q = query(request);
  const taxYear = q.number('taxYear') ?? user.taxYear;
  const enterpriseId = q.string('enterpriseId') ?? user.enterprise.id;

  const definition = REPORTS[report];
  const csv =
    report === 'time-log'
      ? await definition.build(taxYear, enterpriseId)
      : await definition.build(taxYear);

  return new Response(withBom(csv), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${reportFilename(report, taxYear)}"`,
      'Cache-Control': 'no-store',
    },
  });
});
