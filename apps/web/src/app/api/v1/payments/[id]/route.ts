import { jsonBody, ok, route } from '@/server/http';
import { deletePayment, updatePayment } from '@/server/services/payments';

type Params = { params: Promise<{ id: string }> };

/**
 * There is no separate "confirm" endpoint. Confirming a scheduled payment is
 * PATCH `{ isScheduled: false, paidDate }` - the same edit, and giving it a
 * second URL would be two ways to write one row.
 */
export const PATCH = route(async (_user, request, { params }: Params) => {
  const { id } = await params;
  const body = (await jsonBody(request)) as Record<string, unknown>;
  const payment = await updatePayment({ ...body, id } as Parameters<typeof updatePayment>[0]);
  return ok({ payment });
});

/** Refuses the last payment on an expense - see `deletePayment` for why. */
export const DELETE = route(async (_user, _request, { params }: Params) => {
  const { id } = await params;
  await deletePayment(id);
  return ok({ deleted: true });
});
