import Link from 'next/link';
import { formatDateShort } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { listJobs } from '@/server/services/jobs';
import { listProperties } from '@/server/services/reference';

export const metadata = { title: 'Jobs' };

/**
 * Jobs: one header per real-world task.
 *
 * A read-only list, because there is no "new job" button anywhere in the app
 * and there should not be. A job is only ever born from a record that already
 * exists - through "+ Add related" at capture time, or "Group some of these"
 * on the entries list afterwards - so an empty one cannot be created by
 * accident, and nobody is asked to name something before they have anything to
 * put in it.
 */
export default async function JobsPage() {
  await requireUser();
  const [jobs, properties] = await Promise.all([listJobs({ limit: 200 }), listProperties()]);
  const propertyNames = new Map(properties.map((p) => [p.id, p.nickname]));

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <Link href="/entries" className="btn">
          ← Entries
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Jobs</h1>
      </div>

      {jobs.length === 0 ? (
        <div className="panel panel-body">
          <p className="hint">
            No jobs yet. They are not something you create — after saving any time entry,
            trip, or expense, a <strong>+ Add related</strong> panel appears, and one tap
            groups whatever comes next with it.
          </p>
          <Link href="/entries" className="btn mt-3">
            Back to entries
          </Link>
        </div>
      ) : (
        <ul className="tablebox">
          {jobs.map((job) => (
            <li key={job.id} className="kv">
              <div>
                <p className="rowtitle">{job.title}</p>
                <p className="hint">
                  {job.propertyId
                    ? (propertyNames.get(job.propertyId) ?? 'Unknown property')
                    : 'Portfolio-wide'}{' '}
                  · started {formatDateShort(job.createdAt.toISOString().slice(0, 10))}
                </p>
                {job.recordCount === 0 ? (
                  <span className="tag tag-warn mt-1">
                    Nothing left in it — its records were deleted or moved
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="num">
                  {job.recordCount} {job.recordCount === 1 ? 'record' : 'records'}
                </span>
                <Link href={`/jobs/${job.id}`} className="btn">
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
