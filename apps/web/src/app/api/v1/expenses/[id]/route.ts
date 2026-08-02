import { jsonBody, ok, route } from '@/server/http';
import {
  allocationLinesFor,
  deleteExpense,
  getExpense,
  updateExpense,
} from '@/server/services/expenses';

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_user, _request, { params }: Params) => {
  const { id } = await params;
  const expense = await getExpense(id);
  // The parent record stays whole; the split is derived on read (§6).
  return ok({ expense, allocation: await allocationLinesFor(expense) });
});

export const PATCH = route(async (_user, request, { params }: Params) => {
  const { id } = await params;
  const body = (await jsonBody(request)) as Record<string, unknown>;
  const expense = await updateExpense({ ...body, id } as Parameters<typeof updateExpense>[0]);
  return ok({ expense });
});

export const DELETE = route(async (_user, _request, { params }: Params) => {
  const { id } = await params;
  await deleteExpense(id);
  return ok({ deleted: true });
});
