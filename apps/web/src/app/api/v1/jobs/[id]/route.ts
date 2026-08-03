import { jsonBody, ok, query, route } from '@/server/http';
import { deleteJob, getJobWithChildren, updateJob } from '@/server/services/jobs';

type Params = { params: Promise<{ id: string }> };

/**
 * The job with its children and a rollup - minutes eligible and not, miles,
 * spend, and which side of the placed-in-service line each cost fell on.
 *
 * None of the rollup is stored. Omit `taxYear` and it is derived under the
 * rules of the year the earliest record belongs to, which is the year the work
 * actually happened in.
 */
export const GET = route(async (_user, request, { params }: Params) => {
  const { id } = await params;
  const taxYear = query(request).number('taxYear');
  return ok(await getJobWithChildren(id, taxYear));
});

export const PATCH = route(async (_user, request, { params }: Params) => {
  const { id } = await params;
  const body = (await jsonBody(request)) as Record<string, unknown>;
  const job = await updateJob({ ...body, id } as Parameters<typeof updateJob>[0]);
  return ok({ job });
});

/**
 * Deletes the header only. Every record in the job survives with a null job id,
 * because the grouping was a convenience and the records are the evidence.
 * `records_kept` says so out loud, so a client cannot render this as "deleted
 * the five things in it".
 */
export const DELETE = route(async (_user, _request, { params }: Params) => {
  const { id } = await params;
  await deleteJob(id);
  return ok({ deleted: true, records_kept: true });
});
