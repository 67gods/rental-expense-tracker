import { jsonBody, ok, query, route } from '@/server/http';
import {
  createPayment,
  listPayments,
  outstandingScheduled,
} from '@/server/services/payments';

/**
 * Cash events.
 *
 * An expense is an obligation; these are the payments against it. Reports sum
 * this table, not the expense amounts, which is what makes cash basis honest -
 * an $8,244 invoice with $2,500 paid in December reaches the 2025 export as
 * $2,500.
 *
 * `includeScheduled` is off by default and that default is the safe one: a
 * scheduled payment is a plan, and a plan is deductible nowhere.
 */
export const GET = route(async (user, request) => {
  const q = query(request);
  const taxYear = q.number('taxYear') ?? user.taxYear;

  // The year-end screen wants only the plans, which is a different question
  // from "what did we pay", so it gets its own answer rather than a filter the
  // caller has to remember to invert.
  if (q.boolean('outstandingOnly')) {
    return ok({ payments: await outstandingScheduled(taxYear), taxYear });
  }

  const payments = await listPayments({
    taxYear,
    includeScheduled: q.boolean('includeScheduled'),
    limit: q.number('limit'),
  });
  return ok({ payments, taxYear });
});

export const POST = route(async (_user, request) => {
  const body = (await jsonBody(request)) as Record<string, unknown>;
  const payment = await createPayment(body as Parameters<typeof createPayment>[0]);
  return ok({ payment }, 201);
});
