import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatCents, formatMinutes, rollUpHours, sumCents } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { getProperty } from '@/server/services/reference';
import { listTimeEntries } from '@/server/services/timeEntries';
import { listExpenses } from '@/server/services/expenses';
import { listRentReceipts } from '@/server/services/reference';
import { NotFoundError } from '@/server/errors';
import { PropertyForm } from '@/components/PropertyForm';

export const metadata = { title: 'Property' };

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  let property;
  try {
    property = await getProperty(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const [entries, expenses, receipts] = await Promise.all([
    listTimeEntries({ propertyId: id, taxYear: user.taxYear, limit: 2000 }),
    listExpenses({ propertyId: id, taxYear: user.taxYear, limit: 2000 }),
    listRentReceipts({ propertyId: id, taxYear: user.taxYear, limit: 2000 }),
  ]);

  const hours = rollUpHours(
    entries.map((e) => ({
      minutes: e.minutes,
      category: e.category,
      shEligible: e.shEligible,
      isProvisional: e.isProvisional,
      actorId: e.actorId,
      propertyId: e.propertyId,
    })),
  );

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <Link href="/properties" className="btn btn-ghost">
          ← Back
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{property.nickname}</h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <section className="card card-pad">
          <h2 className="section-title">Hours this year</h2>
          {/* Both figures, never merged (§10). */}
          <p className="tnum mt-1 text-xl font-bold">{formatMinutes(hours.eligibleMinutes)}</p>
          <p className="hint">eligible</p>
          <p className="tnum mt-2 text-sm font-semibold">{formatMinutes(hours.totalMinutes)}</p>
          <p className="hint">total logged</p>
        </section>

        <section className="card card-pad">
          <h2 className="section-title">Expenses</h2>
          <p className="tnum mt-1 text-xl font-bold">
            {formatCents(sumCents(expenses.map((e) => e.amountCents)))}
          </p>
          <p className="hint">{expenses.length} recorded</p>
        </section>

        <section className="card card-pad">
          <h2 className="section-title">Rent received</h2>
          <p className="tnum mt-1 text-xl font-bold">
            {formatCents(sumCents(receipts.map((r) => r.amountCents)))}
          </p>
          <p className="hint">{receipts.length} recorded</p>
        </section>
      </div>

      <section className="card card-pad">
        <h2 className="section-title mb-4">Details</h2>
        <PropertyForm
          enterpriseId={property.enterpriseId}
          defaults={{
            id: property.id,
            nickname: property.nickname,
            address: property.address,
            acquiredDate: property.acquiredDate,
            unadjustedBasisCents: property.unadjustedBasisCents,
            ownershipPct: property.ownershipPct,
            isSelfManaged: property.isSelfManaged,
            isTripleNet: property.isTripleNet,
            hadPersonalUse: property.hadPersonalUse,
          }}
        />
      </section>
    </div>
  );
}
