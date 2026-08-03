import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { listProperties } from '@/server/services/reference';
import { getRunningTimer } from '@/server/services/timer';
import { TimerStopForm } from '@/components/TimerStopForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Well } from '@/components/ui';

export const metadata = { title: 'Stop timer' };

export default async function StopTimerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const running = await getRunningTimer(user.actor.id);

  if (!running || running.id !== id) notFound();

  const properties = await listProperties();

  return (
    <>
      <PageHeader
        title="Stop timer"
        actions={
          <Link href="/" className="btn">
            ← Back
          </Link>
        }
      />
      <Well>
        <TimerStopForm
          id={running.id}
          measuredMinutes={running.elapsedMinutes}
          isLongRunning={running.isLongRunning}
          category={running.category}
          description={running.description}
          propertyId={running.propertyId}
          properties={properties.map((p) => ({ id: p.id, label: p.nickname }))}
        />
      </Well>
    </>
  );
}
