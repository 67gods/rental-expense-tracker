import Link from 'next/link';
import { todayInZone } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { listPeople, listProperties } from '@/server/services/reference';
import { IncomeForm } from '@/components/IncomeForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Well } from '@/components/ui';

export const metadata = { title: 'Record rent' };

export default async function LogIncomePage() {
  const user = await requireUser();
  const [properties, people] = await Promise.all([listProperties(), listPeople()]);

  return (
    <>
      <PageHeader
        title="Record rent received"
        actions={
          <Link href="/log" className="btn">
            ← Back
          </Link>
        }
      />
      <Well>
        <IncomeForm
          today={todayInZone(user.timeZone)}
          actorId={user.actor.id}
          properties={properties.map((p) => ({ id: p.id, label: p.nickname }))}
          people={people.map((p) => ({ id: p.id, label: p.name }))}
        />
      </Well>
    </>
  );
}
