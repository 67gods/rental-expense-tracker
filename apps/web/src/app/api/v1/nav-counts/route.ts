import { ok, query, route } from '@/server/http';
import { railCounts } from '@/server/services/navigation';
import { REPORTS } from '@/server/services/reports';

/**
 * The rail's counts for one year.
 *
 * The rail lives in a layout, and a Next layout receives no `searchParams` - it
 * does not re-render when the query changes. So the counts cannot be resolved
 * on the server for the year being VIEWED, only for the year the session opened
 * on. Switching to 2025 used to leave "Expenses 0" beside a table showing 78,
 * which is worse than showing nothing.
 *
 * The rail fetches this when, and only when, the viewed year differs from the
 * one the server rendered.
 */
export const GET = route(async (user, request) => {
  const q = query(request);
  const taxYear = q.number('year') ?? user.taxYear;
  return ok(await railCounts(taxYear, Object.keys(REPORTS).length));
});
