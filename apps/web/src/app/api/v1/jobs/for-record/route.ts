import { jsonBody, ok, route } from '@/server/http';
import { jobForRecord } from '@/server/services/jobs';
import { ValidationError } from '@/server/errors';

const KINDS = ['time', 'trip', 'expense'] as const;
type Kind = (typeof KINDS)[number];

/**
 * The "+ Add related" path, and the only one that matters for usability.
 *
 * Called with whatever record the owner is looking at when they tap the button.
 * If that record is already in a job, its job comes back; otherwise one is
 * created, titled from the record's own description, and the record is moved
 * into it. Either way the owner is asked nothing.
 *
 * A static sibling of `/jobs/[id]`. Next resolves the static segment first, and
 * "for-record" is not a uuid, so the two can never collide.
 */
export const POST = route(async (_user, request) => {
  const body = (await jsonBody(request)) as { kind?: string; recordId?: string };

  if (!isKind(body.kind)) {
    throw new ValidationError(`\`kind\` has to be one of: ${KINDS.join(', ')}.`, {
      kind: 'Pick time, trip, or expense.',
    });
  }
  if (!body.recordId) {
    throw new ValidationError('A job is only ever created from a record that already exists.', {
      recordId: 'Which record is this job for?',
    });
  }

  const job = await jobForRecord(body.kind, body.recordId);
  return ok({ job });
});

function isKind(value: unknown): value is Kind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
}
