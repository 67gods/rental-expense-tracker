import { jsonBody, ok, query, route } from '@/server/http';
import { listLoanYears, upsertLoanYear } from '@/server/services/loanYears';

/**
 * The 1098 facts, one row per lender per property per year.
 *
 * POST upserts on (property, year, lender) rather than creating, because
 * transcribing a 1098 is something you do once and then redo when you spot a
 * mistyped figure - failing the second attempt on a uniqueness error would be
 * friction with nothing behind it. It answers 200, not 201: an upsert cannot
 * honestly say whether it created anything.
 */
export const GET = route(async (user, request) => {
  const q = query(request);
  const taxYear = q.number('taxYear') ?? user.taxYear;
  const loanYears = await listLoanYears({ taxYear, propertyId: q.string('propertyId') });
  return ok({ loanYears, taxYear });
});

export const POST = route(async (_user, request) => {
  const body = (await jsonBody(request)) as Record<string, unknown>;
  const loanYear = await upsertLoanYear(body as Parameters<typeof upsertLoanYear>[0]);
  return ok({ loanYear });
});
