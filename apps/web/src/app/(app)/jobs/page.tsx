import Link from 'next/link';
import { formatDateShort } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { listJobs } from '@/server/services/jobs';
import { listProperties } from '@/server/services/reference';
import { setJobStarAction } from '@/app/actions/jobs';
import { JobEditModal } from '@/components/JobEditModal';
import { DataTable, type DataRow } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { Well } from '@/components/ui';

export const metadata = { title: 'Jobs' };

/**
 * Jobs: one header per real-world task.
 *
 * There is no "new job" button anywhere in the app and there should not be. A
 * job is only ever born from a record that already exists - through "+ Add
 * related" at capture time, or "Group some of these" on the entries list
 * afterwards - so an empty one cannot be created by accident, and nobody is
 * asked to name something before they have anything to put in it.
 *
 * A TABLE, like every other list here. What it adds over the old card list is
 * the two things a job needs and had nowhere to be done: a STAR, which pins the
 * one being worked on to the top, and a RENAME, because a job inherits its
 * title from whichever record created it and "CLEANING SERVICE" is not a name
 * anybody chose.
 *
 * The rename lives behind an Edit on the row, in a dialog. It used to be a
 * panel below the table holding one form per job, which is a second copy of the
 * list - readable at a dozen jobs, absurd at the few hundred this will hold.
 */
export default async function JobsPage() {
  await requireUser();
  const [jobs, properties] = await Promise.all([listJobs({ limit: 200 }), listProperties()]);
  const propertyNames = new Map(properties.map((p) => [p.id, p.nickname]));

  const rows: DataRow[] = jobs.map((job) => {
    const property = job.propertyId
      ? (propertyNames.get(job.propertyId) ?? 'Unknown property')
      : 'Portfolio-wide';
    const started = formatDateShort(job.createdAt.toISOString().slice(0, 10));

    return {
      id: job.id,
      href: `/jobs/${job.id}`,
      starred: job.isStarred,
      starLabel: job.title,
      cells: {
        title: job.title,
        property,
        records: String(job.recordCount),
        started,
      },
      sort: {
        title: job.title.toLowerCase(),
        property,
        records: job.recordCount,
        // The ISO date, not the display string - "5 Aug" sorts alphabetically.
        started: job.createdAt.getTime(),
      },
      numeric: { records: job.recordCount },
      search: [job.title, property, job.notes ?? ''].join(' ').toLowerCase(),
      actions: <JobEditModal id={job.id} title={job.title} notes={job.notes} />,
      badges:
        job.recordCount === 0
          ? [{ label: 'Empty', tone: 'warn' as const }]
          : [],
    };
  });

  return (
    <>
      <PageHeader
        title="Jobs"
        actions={
          <Link href="/entries" className="btn">
            ← Entries
          </Link>
        }
      />
      <Well>
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
          <DataTable
            id="jobs-list"
            rows={rows}
            searchPlaceholder="Title, property, note…"
            onToggleStar={setJobStarAction}
            columns={[
              { key: 'title', header: 'Job', isLink: true },
              { key: 'property', header: 'Property' },
              { key: 'records', header: 'Records', numeric: true },
              { key: 'started', header: 'Started', nowrap: true },
            ]}
            facets={[{ key: 'property', label: 'Property', allLabel: 'All properties' }]}
            totals={[
              { key: '_count', label: 'Jobs', count: true },
              { key: 'records', label: 'Records held' },
            ]}
          />
        )}
      </Well>
    </>
  );
}
