import { ok, route } from '@/server/http';
import { deleteTrip, getTrip } from '@/server/services/trips';

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_user, _request, { params }: Params) => {
  const { id } = await params;
  return ok({ trip: await getTrip(id) });
});

/** Removes the trip and the two time entries it created, never one without the other. */
export const DELETE = route(async (_user, _request, { params }: Params) => {
  const { id } = await params;
  await deleteTrip(id);
  return ok({ deleted: true });
});
