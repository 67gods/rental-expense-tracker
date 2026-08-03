import Link from 'next/link';
import { todayInZone } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { listPeople, listProperties } from '@/server/services/reference';
import { TimeEntryForm } from '@/components/TimeEntryForm';
import { JobBanner } from '@/components/JobBanner';
import { PageHeader } from '@/components/ui/PageHeader';
import { Well } from '@/components/ui';
import { CaptureTabs } from '@/components/CaptureTabs';
import { openJob } from '@/server/services/jobs';

export const metadata = { title: 'Log time' };

export default async function LogTimePage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const [properties, people, job] = await Promise.all([
    listProperties(),
    listPeople(),
    openJob(params.job),
  ]);

  return (
    <>
      <PageHeader
        title="Log time"
        actions={
          <Link href={job ? `/jobs/${job.id}` : '/log'} className="btn">
            ← Back
          </Link>
        }
      />
      <Well>
        <CaptureTabs current="time" jobId={job?.id ?? null} />

        {job ? <JobBanner title={job.title} jobId={job.id} /> : null}

        <TimeEntryForm
          defaults={{
            date: todayInZone(user.timeZone),
            actorId: user.actor.id,
            propertyId: job?.propertyId ?? null,
          }}
          properties={properties.map((p) => ({ id: p.id, label: p.nickname }))}
          people={people.map((p) => ({ id: p.id, label: p.name }))}
          jobId={job?.id ?? null}
        />
      </Well>
    </>
  );
}
