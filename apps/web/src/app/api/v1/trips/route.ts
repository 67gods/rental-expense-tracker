import { jsonBody, ok, query, route } from '@/server/http';
import { createTrip, listTrips } from '@/server/services/trips';

export const GET = route(async (user, request) => {
  const q = query(request);
  const trips = await listTrips({
    taxYear: q.number('taxYear') ?? user.taxYear,
    propertyId: q.string('propertyId'),
    actorId: q.string('actorId'),
    from: q.string('from'),
    to: q.string('to'),
    limit: q.number('limit'),
  });
  return ok({ trips });
});

/**
 * Creating a trip writes up to three linked records (§5.5). The response
 * returns the ids of all of them so a client can show what it produced rather
 * than guessing.
 */
export const POST = route(async (user, request) => {
  const body = (await jsonBody(request)) as Record<string, unknown>;
  const result = await createTrip({
    ...body,
    actorId: (body.actorId as string) ?? user.actor.id,
    enterpriseId: (body.enterpriseId as string) ?? user.enterprise.id,
  } as Parameters<typeof createTrip>[0]);
  return ok(result, 201);
});
