import Link from 'next/link';
import { evaluatePropertyMembership, formatCents } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { listProperties, toDomainProperties } from '@/server/services/reference';
import { PropertyForm } from '@/components/PropertyForm';

export const metadata = { title: 'Properties' };

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const properties = await listProperties();
  const domain = toDomainProperties(properties);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">Properties</h1>
        <Link href="/people" className="btn btn-ghost">
          People &amp; contractors
        </Link>
      </div>

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

            return (
              <li key={property.id} className="row">
                <div className="row-main">
                  <p className="row-title">{property.nickname}</p>
                  <p className="row-meta">{property.address}</p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {property.isSelfManaged ? (
                      <span className="badge badge-not-eligible">Self-managed</span>
                    ) : null}
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
          <PropertyForm enterpriseId={user.enterprise.id} />
        </div>
      </details>
    </div>
  );
}
