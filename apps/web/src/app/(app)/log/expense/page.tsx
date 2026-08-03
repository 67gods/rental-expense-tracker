import Link from 'next/link';
import { todayInZone } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { listContractors, listPeople, listProperties } from '@/server/services/reference';
import { ExpenseForm } from '@/components/ExpenseForm';
import { JobBanner } from '@/components/JobBanner';
import { openJob } from '@/server/services/jobs';

export const metadata = { title: 'Log expense' };

export default async function LogExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const [properties, people, contractors, job] = await Promise.all([
    listProperties(),
    listPeople(),
    listContractors(),
    openJob(params.job),
  ]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link href={job ? `/jobs/${job.id}` : '/log'} className="btn btn-ghost">
          ← Back
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Log expense</h1>
      </div>

      {job ? <JobBanner title={job.title} jobId={job.id} /> : null}

      <ExpenseForm
        today={todayInZone(user.timeZone)}
        actorId={user.actor.id}
        properties={properties.map((p) => ({ id: p.id, label: p.nickname }))}
        people={people.map((p) => ({ id: p.id, label: p.name }))}
        contractors={contractors.map((c) => ({ id: c.id, label: c.name }))}
        jobId={job?.id ?? null}
        defaultPropertyId={job?.propertyId ?? null}
      />
    </div>
  );
}
