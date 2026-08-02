import Link from 'next/link';
import { contractorW9Warnings, contractorYearTotals, formatCents } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { listActors } from '@/server/services/reference';
import { listExpenses } from '@/server/services/expenses';
import { toggleW9Action } from '@/app/actions/admin';
import { ActorForm } from '@/components/ActorForm';
import { W9Toggle } from '@/components/W9Toggle';

export const metadata = { title: 'People & contractors' };

const TYPE_LABELS: Record<string, string> = {
  owner: 'Owner',
  spouse: 'Spouse',
  pm: 'Property manager',
  contractor: 'Contractor',
  other: 'Other',
};

export default async function PeoplePage() {
  const user = await requireUser();
  const [actors, expenses] = await Promise.all([
    listActors(),
    listExpenses({ taxYear: user.taxYear, limit: 5000 }),
  ]);

  const contractors = actors.filter((a) => a.type === 'contractor');
  const totals = contractorYearTotals(
    expenses.map((e) => ({
      contractorActorId: e.contractorActorId,
      amountCents: e.amountCents,
      date: e.date,
    })),
    contractors.map((c) => ({
      id: c.id,
      name: c.name,
      w9OnFile: c.w9OnFile,
      taxIdCollected: c.taxIdCollected,
    })),
    user.taxYear,
  );
  const totalsById = new Map(totals.map((t) => [t.actorId, t]));
  const warned = new Set(
    contractorW9Warnings(totals, new Date(), user.taxYear).map((w) => w.actorId),
  );

  const people = actors.filter((a) => a.type !== 'contractor');

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">People &amp; contractors</h1>
        <Link href="/properties" className="btn btn-ghost">
          Properties
        </Link>
      </div>

      <section>
        <h2 className="section-title mb-2">Household &amp; managers</h2>
        <ul className="card">
          {people.map((actor) => (
            <li key={actor.id} className="row">
              <div className="row-main">
                <p className="row-title">{actor.name}</p>
                <p className="row-meta">
                  {TYPE_LABELS[actor.type] ?? actor.type}
                  {actor.email ? ` · ${actor.email}` : ''}
                </p>
              </div>
            </li>
          ))}
          {people.length === 0 ? (
            <li className="p-4">
              <p className="hint">Nobody yet.</p>
            </li>
          ) : null}
        </ul>
        <p className="hint mt-2">
          Hours are counted per person and cannot be pooled between spouses, so keep these
          two separate rather than merging them.
        </p>
      </section>

      <section>
        <h2 className="section-title mb-2">Contractors · paid in {user.taxYear}</h2>
        <ul className="card">
          {contractors.map((actor) => {
            const total = totalsById.get(actor.id);
            return (
              <li key={actor.id} className="row">
                <div className="row-main">
                  <p className="row-title">{actor.name}</p>
                  <p className="row-meta">
                    {actor.w9OnFile ? 'W-9 on file' : 'No W-9 on file'}
                    {actor.taxIdCollected ? ' · tax ID collected' : ''}
                  </p>
                  {warned.has(actor.id) ? (
                    <p className="mt-1">
                      <span className="badge badge-alert">Needs a W-9 before year end</span>
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="row-value">{formatCents(total?.paidCents ?? 0)}</span>
                  <W9Toggle
                    id={actor.id}
                    name={actor.name}
                    w9OnFile={actor.w9OnFile}
                    onToggle={async (id, next) => {
                      'use server';
                      await toggleW9Action(id, next);
                    }}
                  />
                </div>
              </li>
            );
          })}
          {contractors.length === 0 ? (
            <li className="p-4">
              <p className="hint">
                No contractors yet. Adding them lets the app total what each was paid and warn
                you before a 1099 deadline.
              </p>
            </li>
          ) : null}
        </ul>
      </section>

      <details className="card card-pad">
        <summary className="cursor-pointer text-sm font-semibold">Add someone</summary>
        <div className="mt-4">
          <ActorForm />
        </div>
      </details>
    </div>
  );
}
