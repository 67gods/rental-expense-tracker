import Link from 'next/link';
import { todayInZone } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { listPeople, listProperties } from '@/server/services/reference';
import { TripForm } from '@/components/TripForm';

export const metadata = { title: 'Log trip' };

export default async function LogTripPage() {
  const user = await requireUser();
  const [properties, people] = await Promise.all([listProperties(), listPeople()]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link href="/log" className="btn btn-ghost">
          ← Back
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Log trip</h1>
      </div>

      <TripForm
        today={todayInZone(user.timeZone)}
        actorId={user.actor.id}
        properties={properties.map((p) => ({ id: p.id, label: p.nickname }))}
        people={people.map((p) => ({ id: p.id, label: p.name }))}
      />
    </div>
  );
}
