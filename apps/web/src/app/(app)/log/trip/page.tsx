import Link from 'next/link';
import { todayInZone } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { listPeople, listProperties } from '@/server/services/reference';
import { TripForm } from '@/components/TripForm';
import { JobBanner } from '@/components/JobBanner';
import { openJob } from '@/server/services/jobs';

export const metadata = { title: 'Log trip' };

export default async function LogTripPage({
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
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link href={job ? `/jobs/${job.id}` : '/log'} className="btn btn-ghost">
          ← Back
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Log trip</h1>
      </div>

      {job ? <JobBanner title={job.title} jobId={job.id} /> : null}

      <TripForm
        today={todayInZone(user.timeZone)}
        actorId={user.actor.id}
        properties={properties.map((p) => ({ id: p.id, label: p.nickname }))}
        people={people.map((p) => ({ id: p.id, label: p.name }))}
        jobId={job?.id ?? null}
      />
    </div>
  );
}
