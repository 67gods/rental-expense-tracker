import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  formatCents,
  formatMinutes,
  placedInServiceEvidence,
  rollUpHours,
  sumCents,
} from '@rental/domain';
import { requireUser } from '@/lib/session';
import {
  getProperty,
  listActors,
  listManagementPeriods,
  listPropertyManagers,
  listRentReceipts,
} from '@/server/services/reference';
import { listTimeEntries } from '@/server/services/timeEntries';
import { listExpenses } from '@/server/services/expenses';
import { NotFoundError } from '@/server/errors';
import { PropertyForm } from '@/components/PropertyForm';
import type { PropertyManagementPeriod } from '@/db/schema';

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

  const [entries, expenses, receipts, periods, managerActors, actors] = await Promise.all([
    listTimeEntries({ propertyId: id, taxYear: user.taxYear, limit: 2000 }),
    listExpenses({ propertyId: id, taxYear: user.taxYear, limit: 2000 }),
    listRentReceipts({ propertyId: id, taxYear: user.taxYear, limit: 2000 }),
    listManagementPeriods(id),
    listPropertyManagers(),
    listActors({ includeArchived: true }),
  ]);

  const names = new Map(actors.map((a) => [a.id, a.name]));
  const openPeriod = periods.find((p) => p.endDate === null);

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
        <Link href="/properties" className="btn">
          ← Back
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{property.nickname}</h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <section className="panel panel-body">
          <h2 className="section-title">Hours this year</h2>
          {/* Both figures, never merged (§10). */}
          <p className="num mt-1 text-xl font-bold">{formatMinutes(hours.eligibleMinutes)}</p>
          <p className="hint">eligible</p>
          <p className="num mt-2 text-sm font-semibold">{formatMinutes(hours.totalMinutes)}</p>
          <p className="hint">total logged</p>
        </section>

        <section className="panel panel-body">
          <h2 className="section-title">Expenses</h2>
          <p className="num mt-1 text-xl font-bold">
            {formatCents(sumCents(expenses.map((e) => e.amountCents)))}
          </p>
          <p className="hint">{expenses.length} recorded</p>
        </section>

        <section className="panel panel-body">
          <h2 className="section-title">Rent received</h2>
          <p className="num mt-1 text-xl font-bold">
            {formatCents(sumCents(receipts.map((r) => r.amountCents)))}
          </p>
          <p className="hint">{receipts.length} recorded</p>
        </section>
      </div>

      <PropertyFacts property={property} />

      <ManagementHistory periods={periods} names={names} />

      {/*
        Read-only until asked otherwise.

        The facts card above is what this page is for; the form is how you
        correct it. Rendering eleven open inputs under a card that already
        states the same values reads as "fill this in" every single visit,
        which is why the page felt like a form rather than a record.
      */}
      <details className="panel panel-body">
        <summary className="cursor-pointer text-sm font-semibold">Edit these details</summary>
        <div className="mt-4">
        <PropertyForm
          enterpriseId={property.enterpriseId}
          managers={managerActors.map((a) => ({ id: a.id, name: a.name }))}
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

            placedInServiceDate: property.placedInServiceDate,
            placedInServiceEvidence: property.placedInServiceEvidence,
            firstTenantDate: property.firstTenantDate,
            purchasePriceCents: property.purchasePriceCents,
            closingCostsCents: property.closingCostsCents,
            landValueCents: property.landValueCents,
            wasPersonalResidence: property.wasPersonalResidence,
            convertedToRentalDate: property.convertedToRentalDate,
            fmvAtConversionCents: property.fmvAtConversionCents,
            soldDate: property.soldDate,
            salePriceCents: property.salePriceCents,
            section469Activity: property.section469Activity,

            // The open period is the truth about who manages it now; the
            // property's own boolean is only the fallback for one that has
            // never changed hands.
            managedByActorId: openPeriod
              ? (openPeriod.managerActorId ?? 'self')
              : property.isSelfManaged
                ? 'self'
                : null,
          }}
        />
        </div>
      </details>
    </div>
  );
}

/**
 * The facts for the CPA, read back exactly as entered.
 *
 * Nothing here is computed and nothing is judged. It exists so the January
 * hand-off is a matter of reading a card rather than opening a form and
 * squinting at what is in the boxes.
 */
function PropertyFacts({
  property,
}: {
  property: {
    acquiredDate: string | null;
    placedInServiceDate: string | null;
    placedInServiceEvidence: string | null;
    firstTenantDate: string | null;
    purchasePriceCents: number | null;
    closingCostsCents: number | null;
    landValueCents: number | null;
    unadjustedBasisCents: number;
    wasPersonalResidence: boolean;
    convertedToRentalDate: string | null;
    fmvAtConversionCents: number | null;
    soldDate: string | null;
    salePriceCents: number | null;
    section469Activity: string | null;
  };
}) {
  // Guarded rather than looked up blind: `lookup` throws on an unknown id, and
  // a value the picker no longer offers should read as "not recorded" here
  // rather than take the whole property page down.
  const evidence = placedInServiceEvidence.has(property.placedInServiceEvidence ?? '')
    ? placedInServiceEvidence.get(property.placedInServiceEvidence as string).label
    : null;

  return (
    <section className="panel panel-body">
      <h2 className="section-title">Facts for the CPA</h2>

      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <Fact label="Acquired" value={property.acquiredDate} />
        <Fact
          label="Placed in service"
          value={property.placedInServiceDate}
          note={evidence ?? undefined}
        />
        <Fact label="First tenant" value={property.firstTenantDate} />
        <Fact label="Purchase price" value={cents(property.purchasePriceCents)} />
        <Fact label="Closing costs" value={cents(property.closingCostsCents)} />
        <Fact label="Land value" value={cents(property.landValueCents)} />
        <Fact
          label="Unadjusted basis"
          value={property.unadjustedBasisCents ? formatCents(property.unadjustedBasisCents) : null}
        />
        <Fact label="§469 activity" value={property.section469Activity} />

        {property.wasPersonalResidence ? (
          <>
            <Fact label="Became a rental" value={property.convertedToRentalDate} />
            <Fact label="Value that day" value={cents(property.fmvAtConversionCents)} />
          </>
        ) : null}

        {property.soldDate ? (
          <>
            <Fact label="Sold" value={property.soldDate} />
            <Fact label="Sale price" value={cents(property.salePriceCents)} />
          </>
        ) : null}
      </dl>

      {property.placedInServiceDate ? null : (
        <p className="hint mt-3">
          No placed-in-service date yet. It is the date depreciation starts and the line that
          decides which costs came before the property was earning — worth finding when you
          have the closing package open.
        </p>
      )}
    </section>
  );
}

function Fact({
  label,
  value,
  note,
}: {
  label: string;
  value: string | null | undefined;
  note?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-[color:var(--line)] py-1 last:border-0">
      <dt className="text-sm muted">{label}</dt>
      <dd className="num text-sm font-semibold">
        {value || <span className="font-normal muted">—</span>}
        {value && note ? (
          <span className="ml-2 font-normal muted">{note}</span>
        ) : null}
      </dd>
    </div>
  );
}

/**
 * Who managed it, and when it changed.
 *
 * Read-only on purpose. The dropdown on the form below is the only way to write
 * a period, so there is one interaction to learn and the history cannot be
 * edited into a shape the transitions would never produce.
 */
function ManagementHistory({
  periods,
  names,
}: {
  periods: PropertyManagementPeriod[];
  names: Map<string, string>;
}) {
  if (periods.length === 0) return null;

  return (
    <section className="panel panel-body">
      <h2 className="section-title">Management history</h2>
      <ul className="grid gap-1">
        {periods.map((period) => (
          <li key={period.id} className="kv">
            <span className="">
              <span style={{fontWeight:500}}>
                {period.managerActorId
                  ? (names.get(period.managerActorId) ?? 'A manager no longer on file')
                  : 'Self-managed'}
              </span>
              <span className="hint">
                {period.startDate} — {period.endDate ?? 'now'}
              </span>
            </span>
            {period.endDate === null ? <span className="tag tag-pos">Current</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function cents(value: number | null): string | null {
  return value === null ? null : formatCents(value);
}
