import { jsonBody, ok, query, route } from '@/server/http';
import { createTimeEntry, listTimeEntries } from '@/server/services/timeEntries';

export const GET = route(async (user, request) => {
  const q = query(request);
  const entries = await listTimeEntries({
    taxYear: q.number('taxYear') ?? user.taxYear,
    enterpriseId: q.string('enterpriseId') ?? user.enterprise.id,
    propertyId: q.string('propertyId'),
    actorId: q.string('actorId'),
    from: q.string('from'),
    to: q.string('to'),
    limit: q.number('limit'),
  });
  return ok({ entries });
});

export const POST = route(async (user, request) => {
  const body = (await jsonBody(request)) as Record<string, unknown>;

  const entry = await createTimeEntry({
    ...body,
    // Attribution defaults to whoever is signed in, and the enterprise to
    // theirs, so a client cannot omit either and produce an orphan record.
    actorId: (body.actorId as string) ?? user.actor.id,
    enterpriseId: (body.enterpriseId as string) ?? user.enterprise.id,
  } as Parameters<typeof createTimeEntry>[0]);

  return ok({ entry }, 201);
});
