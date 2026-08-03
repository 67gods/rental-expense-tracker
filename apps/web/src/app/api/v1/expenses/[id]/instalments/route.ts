import { jsonBody, ok, query, route } from '@/server/http';
import { planInstalments, suggestRemainder } from '@/server/services/payments';

type Params = { params: Promise<{ id: string }> };

/**
 * "Push the rest to next year."
 *
 * GET proposes: what is left, and a date in the next year to carry it to. POST
 * commits it as N monthly rows. Every row written here is scheduled, so none of
 * it reaches an export until the owner says the money actually moved.
 *
 * Not CRUD, so not folded into the payments collection - this is one action
 * with a proposal step, and pretending otherwise would mean the client
 * computing the remainder itself and the two disagreeing by a cent.
 */
export const GET = route(async (user, request, { params }: Params) => {
  const { id } = await params;
  const taxYear = query(request).number('taxYear') ?? user.taxYear;
  return ok({ suggestion: await suggestRemainder(id, taxYear), taxYear });
});

export const POST = route(async (_user, request, { params }: Params) => {
  const { id } = await params;
  const body = (await jsonBody(request)) as Record<string, unknown>;
  const payments = await planInstalments({
    ...body,
    expenseId: id,
  } as Parameters<typeof planInstalments>[0]);
  return ok({ payments }, 201);
});
