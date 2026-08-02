import { jsonBody, ok, query, route } from '@/server/http';
import { createRentReceipt, listRentReceipts } from '@/server/services/reference';

export const GET = route(async (user, request) => {
  const q = query(request);
  const receipts = await listRentReceipts({
    taxYear: q.number('taxYear') ?? user.taxYear,
    propertyId: q.string('propertyId'),
    limit: q.number('limit'),
  });
  return ok({ receipts });
});

export const POST = route(async (user, request) => {
  const body = (await jsonBody(request)) as Record<string, unknown>;
  const receipt = await createRentReceipt({
    ...body,
    actorId: (body.actorId as string) ?? user.actor.id,
  } as Parameters<typeof createRentReceipt>[0]);
  return ok({ receipt }, 201);
});
