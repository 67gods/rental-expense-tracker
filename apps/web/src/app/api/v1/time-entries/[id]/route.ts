import { jsonBody, ok, route } from '@/server/http';
import {
  deleteTimeEntry,
  getTimeEntry,
  updateTimeEntry,
} from '@/server/services/timeEntries';

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_user, _request, { params }: Params) => {
  const { id } = await params;
  return ok({ entry: await getTimeEntry(id) });
});

export const PATCH = route(async (_user, request, { params }: Params) => {
  const { id } = await params;
  const body = (await jsonBody(request)) as Record<string, unknown>;
  const entry = await updateTimeEntry({ ...body, id } as Parameters<typeof updateTimeEntry>[0]);
  return ok({ entry });
});

export const DELETE = route(async (_user, _request, { params }: Params) => {
  const { id } = await params;
  await deleteTimeEntry(id);
  return ok({ deleted: true });
});
