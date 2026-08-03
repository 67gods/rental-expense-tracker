import { ok, route } from '@/server/http';
import { deleteLoanYear, getLoanYear } from '@/server/services/loanYears';

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_user, _request, { params }: Params) => {
  const { id } = await params;
  return ok({ loanYear: await getLoanYear(id) });
});

/**
 * No PATCH. Editing goes through the collection POST, which upserts on the
 * natural key - so there is one write path for a 1098 rather than two that
 * could disagree about which row is authoritative for a lender-year.
 */
export const DELETE = route(async (_user, _request, { params }: Params) => {
  const { id } = await params;
  await deleteLoanYear(id);
  return ok({ deleted: true });
});
