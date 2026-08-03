import { jsonBody, ok, query, route } from '@/server/http';
import {
  reconciliationFor,
  reconciliationsForYear,
  upsertReconciliation,
} from '@/server/services/reconciliation';

/**
 * Received rent against the 1099 that reported it.
 *
 * The received side is never sent by the client. It is summed from the rent
 * receipts already logged, so the two figures cannot drift; what the caller
 * supplies is the 1099 box 1 amount and, as items, the reasons the two differ.
 *
 * `reportedGrossCents` null means the form has not arrived, which is not the
 * same as zero - so the residual comes back null rather than as a gap the size
 * of the year's rent.
 */
export const GET = route(async (user, request) => {
  const q = query(request);
  const taxYear = q.number('taxYear') ?? user.taxYear;
  const propertyId = q.string('propertyId');

  if (propertyId) {
    return ok({ reconciliation: await reconciliationFor(propertyId, taxYear), taxYear });
  }
  return ok({ reconciliations: await reconciliationsForYear(taxYear), taxYear });
});

/** Upserts on (property, year). 200, because an upsert cannot claim to create. */
export const POST = route(async (_user, request) => {
  const body = (await jsonBody(request)) as Record<string, unknown>;
  const reconciliation = await upsertReconciliation(
    body as Parameters<typeof upsertReconciliation>[0],
  );
  return ok({ reconciliation });
});
