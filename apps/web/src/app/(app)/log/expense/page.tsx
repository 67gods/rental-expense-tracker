import Link from 'next/link';
import { todayInZone } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { listContractors, listPeople, listProperties } from '@/server/services/reference';
import { ExpenseForm } from '@/components/ExpenseForm';

export const metadata = { title: 'Log expense' };

export default async function LogExpensePage() {
  const user = await requireUser();
  const [properties, people, contractors] = await Promise.all([
    listProperties(),
    listPeople(),
    listContractors(),
  ]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link href="/log" className="btn btn-ghost">
          ← Back
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Log expense</h1>
      </div>

      <ExpenseForm
        today={todayInZone(user.timeZone)}
        actorId={user.actor.id}
        properties={properties.map((p) => ({ id: p.id, label: p.nickname }))}
        people={people.map((p) => ({ id: p.id, label: p.name }))}
        contractors={contractors.map((c) => ({ id: c.id, label: c.name }))}
      />
    </div>
  );
}
