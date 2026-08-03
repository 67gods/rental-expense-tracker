import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDateLong } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { getTimeEntry } from '@/server/services/timeEntries';
import { listPeople, listProperties } from '@/server/services/reference';
import { TimeEntryForm } from '@/components/TimeEntryForm';
import { NotFoundError } from '@/server/errors';
import { PageHeader } from '@/components/ui/PageHeader';
import { Well } from '@/components/ui';

export const metadata = { title: 'Edit time entry' };

export default async function EditTimeEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireUser();

  let entry;
  try {
    entry = await getTimeEntry(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const [properties, people] = await Promise.all([listProperties(), listPeople()]);

  return (
    <>
      <PageHeader
        title="Edit time entry"
        actions={
          <Link href="/entries" className="btn">
            ← Back
          </Link>
        }
      />
      <Well>
        {/* The original creation instant is shown rather than hidden. Editing an
            entry corrects the record; it does not make it contemporaneous. */}
        <p className="hint mb-4">
          Originally written {formatDateLong(entry.createdAt.toISOString().slice(0, 10))}.
          That timestamp does not change when you edit this.
        </p>

        <TimeEntryForm
          defaults={{
            id: entry.id,
            date: entry.date,
            actorId: entry.actorId,
            propertyId: entry.propertyId,
            minutes: entry.minutes,
            category: entry.category,
            description: entry.description,
          }}
          properties={properties.map((p) => ({ id: p.id, label: p.nickname }))}
          people={people.map((p) => ({ id: p.id, label: p.name }))}
          returnTo="/entries?saved=time"
        />
      </Well>
    </>
  );
}
