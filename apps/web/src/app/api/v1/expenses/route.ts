import { jsonBody, ok, query, route } from '@/server/http';
import { createExpense, listExpenses } from '@/server/services/expenses';

export const GET = route(async (user, request) => {
  const q = query(request);
  const expenses = await listExpenses({
    taxYear: q.number('taxYear') ?? user.taxYear,
    propertyId: q.string('propertyId'),
    actorId: q.string('actorId'),
    contractorActorId: q.string('contractorActorId'),
    needsReviewOnly: q.boolean('needsReview'),
    from: q.string('from'),
    to: q.string('to'),
    limit: q.number('limit'),
  });
  return ok({ expenses });
});

export const POST = route(async (user, request) => {
  const body = (await jsonBody(request)) as Record<string, unknown>;
  const expense = await createExpense({
    ...body,
    actorId: (body.actorId as string) ?? user.actor.id,
  } as Parameters<typeof createExpense>[0]);
  return ok({ expense }, 201);
});
