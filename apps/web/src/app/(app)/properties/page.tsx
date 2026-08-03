import Link from 'next/link';
import { evaluatePropertyMembership, formatCents } from '@rental/domain';
import { requireUser } from '@/lib/session';
import {
  currentManagers,
  listProperties,
  listPropertyManagers,
  toDomainProperties,
} from '@/server/services/reference';
import { PropertyForm } from '@/components/PropertyForm';

export const metadata = { title: 'Properties' };

/** A blank cell that reads as "nobody has filled this in", not as a zero. */
function Missing() {
  return <span className="text-[color:var(--color-muted)]">—</span>;
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const [properties, managerActors, managers] = await Promise.all([
    listProperties(),
    listPropertyManagers(),
    currentManagers(),
  ]);
  const domain = toDomainProperties(properties);
  const managerNames = new Map(managerActors.map((a) => [a.id, a.name]));

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">Properties</h1>
        <Link href="/people" className="btn btn-ghost">
          People &amp; contractors
        </Link>
      </div>

      {/*
        The whole portfolio's key dates on one screen.

        These four facts are what every conversation with a CPA starts with,
        and until now they were one property at a time, three clicks deep. A
        blank cell is doing real work here: it is the fastest way to see which
        property is still missing the date that decides where depreciation
        starts.
      */}
      {properties.length > 0 ? (
        <section>
          <h2 className="section-title mb-2">Key dates</h2>
          <div className="table-wrap card">
            <table className="table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Acquired</th>
                  <th>Listed / available</th>
                  <th>First tenant</th>
                  <th>Managed by</th>
                </tr>
              </thead>
              <tbody>
                {properties.map((property) => {
                  const managerActorId = managers.get(property.id);
                  const managerName = managerActorId
                    ? managerNames.get(managerActorId)
                    : null;
                  return (
                    <tr key={property.id}>
                      <td>
                        <Link href={`/properties/${property.id}`}>{property.nickname}</Link>
                      </td>
                      <td className="tnum">{property.acquiredDate ?? <Missing />}</td>
                      <td className="tnum">
                        {property.placedInServiceDate ?? <Missing />}
                      </td>
                      <td className="tnum">{property.firstTenantDate ?? <Missing />}</td>
                      <td>
                        {managerName ?? (property.isSelfManaged ? 'Self-managed' : <Missing />)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="hint mt-2">
            <strong>Listed / available</strong> is the placed-in-service date — when it was
            ready to rent, not when it was bought and not when someone moved in. Depreciation
            starts there, and every cost before it sits on the other side of the line.
          </p>
        </section>
      ) : null}

      {properties.length > 0 ? (
        <ul className="card">
          {properties.map((property) => {
            const membership = evaluatePropertyMembership(
              domain.find((d) => d.id === property.id) ?? {
                id: property.id,
                enterpriseId: property.enterpriseId,
                nickname: property.nickname,
                unadjustedBasisCents: property.unadjustedBasisCents,
                ownershipPct: Number(property.ownershipPct),
                isTripleNet: property.isTripleNet,
                hadPersonalUse: property.hadPersonalUse,
              },
            );

            // The open management period wins over the boolean when there is
            // one. `is_self_managed` is still the answer for a property whose
            // arrangement has never changed and so has no periods at all.
            const managerActorId = managers.get(property.id);
            const managerName = managerActorId ? managerNames.get(managerActorId) : null;

            return (
              <li key={property.id} className="row">
                <div className="row-main">
                  <p className="row-title">{property.nickname}</p>
                  <p className="row-meta">{property.address}</p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {managerName ? (
                      <span className="badge badge-not-eligible">Managed by {managerName}</span>
                    ) : property.isSelfManaged ? (
                      <span className="badge badge-not-eligible">Self-managed</span>
                    ) : null}
                    {property.placedInServiceDate ? null : (
                      <span className="badge badge-flag">No in-service date</span>
                    )}
                    {membership.included ? null : (
                      <span className="badge badge-flag">Outside the enterprise this year</span>
                    )}
                    {Number(property.ownershipPct) !== 100 ? (
                      <span className="badge badge-not-eligible">
                        {Number(property.ownershipPct)}% owned
                      </span>
                    ) : null}
                  </p>
                  {membership.messages.map((message) => (
                    <p key={message} className="hint mt-1">
                      {message}
                    </p>
                  ))}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="row-value">
                    {property.unadjustedBasisCents
                      ? formatCents(property.unadjustedBasisCents)
                      : '—'}
                  </span>
                  <Link href={`/properties/${property.id}`} className="btn btn-ghost text-xs">
                    Edit
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="card card-pad hint">
          No properties yet. Add your five below — nickname and address are enough to start
          logging against them.
        </p>
      )}

      <details className="card card-pad" open={properties.length === 0 || params.add === '1'}>
        <summary className="cursor-pointer text-sm font-semibold">Add a property</summary>
        <div className="mt-4">
          <PropertyForm
            enterpriseId={user.enterprise.id}
            managers={managerActors.map((a) => ({ id: a.id, name: a.name }))}
          />
        </div>
      </details>
    </div>
  );
}
