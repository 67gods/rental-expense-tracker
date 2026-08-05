import Link from 'next/link';
import { todayInZone } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { listContractors, listPeople, listProperties } from '@/server/services/reference';
import { ExpenseForm } from '@/components/ExpenseForm';
import { JobBanner } from '@/components/JobBanner';
import { PageHeader } from '@/components/ui/PageHeader';
import { Well } from '@/components/ui';
import { CaptureTabs } from '@/components/CaptureTabs';
import { openJob } from '@/server/services/jobs';
import { captureHints } from '@/server/services/expenses';
import { propertyOptions } from '@/lib/captureOptions';

export const metadata = { title: 'Log expense' };

export default async function LogExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const [properties, people, contractors, job, hints] = await Promise.all([
    listProperties(),
    listPeople(),
    listContractors(),
    openJob(params.job),
    captureHints(),
  ]);

  const today = todayInZone(user.timeZone);

  return (
    <>
      <PageHeader
        title="Log expense"
        actions={
          <Link href={job ? `/jobs/${job.id}` : '/log'} className="btn">
            ← Back
          </Link>
        }
      />
      <Well>
        <CaptureTabs current="expense" jobId={job?.id ?? null} />

        {job ? <JobBanner title={job.title} jobId={job.id} /> : null}

        <ExpenseForm
          today={today}
          actorId={user.actor.id}
          properties={propertyOptions(properties, hints, today)}
          people={people.map((p) => ({ id: p.id, label: p.name }))}
          contractors={contractors.map((c) => ({ id: c.id, label: c.name }))}
          recentVendors={hints.recentVendors}
          jobId={job?.id ?? null}
          defaultPropertyId={job?.propertyId ?? null}
        />
      </Well>
    </>
  );
}
