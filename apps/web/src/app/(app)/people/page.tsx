import Link from 'next/link';
import { contractorW9Warnings, contractorYearTotals, formatCents } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { listActors } from '@/server/services/reference';
import { listExpenses } from '@/server/services/expenses';
import { toggleW9Action } from '@/app/actions/admin';
import { ActorForm, type EditableActor } from '@/components/ActorForm';
import { W9Toggle } from '@/components/W9Toggle';
import { PageHeader } from '@/components/ui/PageHeader';
import { Well } from '@/components/ui';

export const metadata = { title: 'People & contractors' };

const TYPE_LABELS: Record<string, string> = {
  owner: 'Owner',
  spouse: 'Spouse',
  pm: 'Property manager',
  contractor: 'Contractor',
  other: 'Other',
};

/** Only the columns the form can change - not the whole row. */
function editable(actor: {
  id: string;
  name: string;
  type: string;
  email: string | null;
  w9OnFile: boolean;
  taxIdCollected: boolean;
  notes: string | null;
}): EditableActor {
  return {
    id: actor.id,
    name: actor.name,
    type: actor.type,
    email: actor.email,
    w9OnFile: actor.w9OnFile,
    taxIdCollected: actor.taxIdCollected,
    notes: actor.notes,
  };
}

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
    <>
      <PageHeader
        title="People & contractors"
        actions={
          <Link href="/properties" className="btn">
            Properties
          </Link>
        }
      />
      <Well>
        <section>
          <h2 className="section-title mb-2">Household &amp; managers</h2>
          <ul className="tablebox">
            {people.map((actor) => (
              <li key={actor.id} className="kv kv-stack">
                <div>
                  <p className="rowtitle">{actor.name}</p>
                  <p className="hint">
                    {TYPE_LABELS[actor.type] ?? actor.type}
                    {actor.email ? ` · ${actor.email}` : ''}
                  </p>
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer hint">Edit</summary>
                  <div className="mt-3">
                    <ActorForm actor={editable(actor)} />
                  </div>
                </details>
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
          <ul className="tablebox">
            {contractors.map((actor) => {
              const total = totalsById.get(actor.id);
              return (
                <li key={actor.id} className="kv kv-stack">
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="rowtitle">{actor.name}</p>
                      <p className="hint">
                        {actor.w9OnFile ? 'W-9 on file' : 'No W-9 on file'}
                        {actor.taxIdCollected ? ' · tax ID collected' : ''}
                      </p>
                      {warned.has(actor.id) ? (
                        <p className="mt-1">
                          <span className="tag tag-neg">Needs a W-9 before year end</span>
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="num">{formatCents(total?.paidCents ?? 0)}</span>
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
                  </div>
                  <details className="mt-1">
                    <summary className="cursor-pointer hint">Edit</summary>
                    <div className="mt-3">
                      <ActorForm actor={editable(actor)} />
                    </div>
                  </details>
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

        <details className="panel panel-body">
          <summary className="cursor-pointer text-sm font-semibold">Add someone</summary>
          <div className="mt-4">
            <ActorForm />
          </div>
        </details>
      </Well>
    </>
  );
}
