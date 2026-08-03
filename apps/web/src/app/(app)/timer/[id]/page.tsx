import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { listProperties } from '@/server/services/reference';
import { getRunningTimer } from '@/server/services/timer';
import { TimerStopForm } from '@/components/TimerStopForm';

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
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link href="/" className="btn">
          ← Back
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Stop timer</h1>
      </div>

      <TimerStopForm
        id={running.id}
        measuredMinutes={running.elapsedMinutes}
        isLongRunning={running.isLongRunning}
        category={running.category}
        description={running.description}
        propertyId={running.propertyId}
        properties={properties.map((p) => ({ id: p.id, label: p.nickname }))}
      />
    </div>
  );
}
