import { ok, route } from '@/server/http';
import { deleteCpaFigure } from '@/server/services/cpaFigures';

type Params = { params: Promise<{ id: string }> };

/**
 * No PATCH, for the same reason as the loan years: editing goes through the
 * collection POST, which upserts on (property, year, kind, label).
 */
export const DELETE = route(async (_user, _request, { params }: Params) => {
  const { id } = await params;
  await deleteCpaFigure(id);
  return ok({ deleted: true });
});
