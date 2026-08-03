import { jsonBody, ok, route } from '@/server/http';
import { assignToJob, unassignFromJob } from '@/server/services/jobs';

/**
 * The "group these" action, for connecting records after the fact.
 *
 * Takes either an existing `jobId` or a `newJobTitle`, so the first grouping
 * does not require creating the job as a separate step.
 *
 * DELETE is the reverse: the records come back out and are otherwise untouched.
 * A job left with no children is reported by the integrity audit rather than
 * swept up here - a header the owner named is worth mentioning before it goes.
 */
export const POST = route(async (_user, request) => {
  const body = (await jsonBody(request)) as Record<string, unknown>;
  const job = await assignToJob(body as Parameters<typeof assignToJob>[0]);
  return ok({ job });
});

export const DELETE = route(async (_user, request) => {
  const body = (await jsonBody(request)) as Record<string, unknown>;
  const unassigned = await unassignFromJob(body as Parameters<typeof unassignFromJob>[0]);
  return ok({ unassigned });
});
