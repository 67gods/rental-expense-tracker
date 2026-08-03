import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { listProperties } from '@/server/services/reference';
import { getRunningTimer } from '@/server/services/timer';
import { TimerStartForm } from '@/components/TimerStartForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Well } from '@/components/ui';

export const metadata = { title: 'Timer' };

export default async function TimerPage() {
  const user = await requireUser();
  const running = await getRunningTimer(user.actor.id);

  // One running timer per person, so land on the stop screen rather than
  // silently replacing what is already counting.
  if (running) redirect(`/timer/${running.id}`);

  const properties = await listProperties();

  return (
    <>
      <PageHeader
        title="Start a timer"
        actions={
          <Link href="/" className="btn">
            ← Back
          </Link>
        }
      />
      <Well>
        <p className="hint mb-4">
          For desk work — lease review, checking rent landed, market surveys, emailing
          contractors. It keeps running if you close the tab.
        </p>

        <TimerStartForm
          properties={properties.map((p) => ({ id: p.id, label: p.nickname }))}
          taxYear={user.taxYear}
        />
      </Well>
    </>
  );
}
