import { ok, route } from '@/server/http';
import { deleteItem } from '@/server/services/reconciliation';

type Params = { params: Promise<{ id: string }> };

export const DELETE = route(async (_user, _request, { params }: Params) => {
  const { id } = await params;
  await deleteItem(id);
  return ok({ deleted: true });
});
