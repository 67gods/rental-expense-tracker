import { ok, query, route } from '@/server/http';
import { getDashboardData } from '@/server/services/dashboard';

export const GET = route(async (user, request) => {
  const q = query(request);
  const data = await getDashboardData(
    q.string('enterpriseId') ?? user.enterprise.id,
    q.number('taxYear') ?? user.taxYear,
  );
  return ok(data);
});
