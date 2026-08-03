import { ok, route } from '@/server/http';
import { paymentSummary } from '@/server/services/payments';

type Params = { params: Promise<{ id: string }> };

/**
 * Everything the expense detail screen needs to decide what to show: the rows,
 * the invoice total, what has been paid, what is only scheduled, and whether
 * this invoice was ever split at all.
 *
 * `isSplit` is the one the UI leans on. False - the ordinary case, and about
 * seventy-three expenses out of seventy-five - means the screen shows a single
 * amount and the words "payment" and "instalment" never appear.
 */
export const GET = route(async (_user, _request, { params }: Params) => {
  const { id } = await params;
  return ok(await paymentSummary(id));
});
