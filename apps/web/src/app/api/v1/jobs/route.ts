import { jsonBody, ok, query, route } from '@/server/http';
import { createJob, listJobs } from '@/server/services/jobs';

/**
 * Jobs: one header per real-world task, with time, miles and money as its line
 * items. "Buy a laptop for rental management" is one job holding a search at
 * the desk, a drive to the store, the minutes spent there, the miles back, and
 * the invoice.
 *
 * The header carries no category, no amount and no tax field. Everything
 * tax-shaped stays on the children, which is what lets the same job be rolled
 * up under 2025's rules and 2026's and answer differently.
 *
 * `recordCount` comes back on every row because a job with none is a job the
 * owner should be told about - the UI never creates one empty, but a deletion
 * can leave one behind.
 */
export const GET = route(async (_user, request) => {
  const q = query(request);
  const jobs = await listJobs({ propertyId: q.string('propertyId'), limit: q.number('limit') });
  return ok({ jobs });
});

/**
 * Direct creation exists for the API, but it is not how jobs are normally born.
 * The UI path is `POST /jobs/for-record`, which creates the job from a record
 * that already exists and titles it from that record - so nobody is asked to
 * name something before they have anything to put in it.
 */
export const POST = route(async (_user, request) => {
  const body = (await jsonBody(request)) as Record<string, unknown>;
  const job = await createJob(body as Parameters<typeof createJob>[0]);
  return ok({ job }, 201);
});
