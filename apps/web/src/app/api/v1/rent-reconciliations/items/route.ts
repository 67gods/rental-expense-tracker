import { jsonBody, ok, route } from '@/server/http';
import { addItem } from '@/server/services/reconciliation';

/**
 * One reason the received and reported figures differ.
 *
 * Amounts are signed here and nowhere else in the app: positive for money
 * reported but never banked - a management fee withheld at source, a forfeited
 * deposit - and negative for money banked but not reported, which in practice
 * means a deposit being held.
 *
 * Which of those a deposit is, the app does not decide. A forfeited deposit is
 * income and a held one is not, and only the owner knows what happened.
 *
 * Accepts `propertyId` + `taxYear` in place of `reconciliationId`, creating the
 * header if it does not exist - so explaining a difference never starts with
 * creating something to explain it against.
 */
export const POST = route(async (_user, request) => {
  const body = (await jsonBody(request)) as Record<string, unknown>;
  const item = await addItem(body as Parameters<typeof addItem>[0]);
  return ok({ item }, 201);
});
