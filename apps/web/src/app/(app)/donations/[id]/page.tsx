import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  donationFlags,
  donationKind,
  formatCents,
  formatDateLong,
  hasThresholdsFor,
  sumCents,
  thresholdsFor,
  todayInZone,
  type ThresholdSet,
} from '@rental/domain';
import { requireUser } from '@/lib/session';
import { listCharities, listDonations, type DonationView } from '@/server/services/donations';
import { archiveCharityAction, deleteDonationAction } from '@/app/actions/donations';
import { CharityForm } from '@/components/CharityForm';
import { DonationForm } from '@/components/DonationForm';
import { DeleteButton } from '@/components/DeleteButton';
import { ReceiptLinks } from '@/components/ReceiptLinks';
import { PageHeader } from '@/components/ui/PageHeader';
import { KeyValues, Panel, Tag, Well } from '@/components/ui';
import { resolveTaxYear } from '@/lib/year';

export const metadata = { title: 'Charity' };

/**
 * One charity, and every gift ever given to it.
 *
 * Deliberately not filtered to the year the list was showing. "Did we give less
 * this year than last" is the question that catches a standing donation somebody
 * cancelled and nobody noticed, and it can only be asked with the years side by
 * side.
 *
 * WHERE CORRECTIONS LIVE. The interest screen puts one edit form on the page,
 * which works because an account has exactly one figure per year and the form's
 * target is never in doubt. A charity has many gifts, so each row carries its own
 * form instead - collapsed, prefilled from that row. One form for twenty gifts
 * would be a form whose subject you have to guess.
 */
export default async function CharityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const { year } = await searchParams;
  const taxYear = resolveTaxYear(year, user.taxYear);

  // No `getCharity` on the service, and a household gives to a handful - so the
  // list is the lookup rather than a query built for it, as the interest detail
  // page does with its accounts.
  const charities = await listCharities({ includeArchived: true });
  const charity = charities.find((c) => c.id === id);
  if (!charity) notFound();

  const gifts = await listDonations({ charityId: id });
  const thresholds = hasThresholdsFor(taxYear) ? thresholdsFor(taxYear) : null;

  const thisYear = gifts.filter((gift) => gift.date.startsWith(String(taxYear)));
  const lifetimeCents = sumCents(gifts.map((gift) => gift.amountCents));
  const charityOptions = [
    { id: charity.id, label: charity.taxId ? `${charity.name} — ${charity.taxId}` : charity.name },
  ];

  return (
    <>
      <PageHeader
        title={charity.name}
        crumb={`Donations · ${taxYear}`}
        actions={
          <Link className="btn" href={`/donations?year=${taxYear}`}>
            Back to all gifts
          </Link>
        }
      />
      <Well>
        <Panel title="The charity">
          <KeyValues
            rows={[
              {
                key: 'taxId',
                label: 'Tax ID',
                value: charity.taxId ?? 'Not recorded',
                tone: charity.taxId ? undefined : 'muted',
              },
              {
                key: 'status',
                label: 'Status',
                value: charity.isArchived ? <Tag tone="muted">No longer used</Tag> : 'In use',
              },
              {
                key: 'thisYear',
                label: `Given in ${taxYear}`,
                value: formatCents(sumCents(thisYear.map((gift) => gift.amountCents))),
              },
              {
                key: 'lifetime',
                label: 'Given in all',
                value: `${formatCents(lifetimeCents)} over ${gifts.length} ${
                  gifts.length === 1 ? 'gift' : 'gifts'
                }`,
              },
            ]}
          />
        </Panel>

        <Panel title="Every gift" aside={<span className="num">{formatCents(lifetimeCents)}</span>}>
          {gifts.length === 0 ? (
            <p className="hint">
              Nothing recorded against this charity yet. Log the first gift from the donations
              screen.
            </p>
          ) : (
            <dl>
              {gifts.map((gift) => (
                <div className="kv" key={gift.id}>
                  <dt>{formatDateLong(gift.date)}</dt>
                  <dd>
                    <span className="num font-semibold">{formatCents(gift.amountCents)}</span>
                    <span className="hint"> · {kindOf(gift.kind)}</span>
                    {gift.nonCashDescription ? (
                      <span className="hint"> · {gift.nonCashDescription}</span>
                    ) : null}

                    <p className="mt-1 flex flex-wrap items-center gap-2">
                      {gift.acknowledgmentOnFile ? (
                        <Tag tone="pos">Letter on file</Tag>
                      ) : (
                        <Tag tone={needsLetter(gift, thresholds) ? 'warn' : 'muted'}>
                          {needsLetter(gift, thresholds) ? 'No letter' : 'No letter needed'}
                        </Tag>
                      )}
                      {needsForm8283(gift, thresholds) ? (
                        <Tag tone="warn">Needs Form 8283</Tag>
                      ) : null}
                      {gift.receiptKey ? <ReceiptLinks receiptKey={gift.receiptKey} /> : null}
                    </p>

                    {gift.note ? <p className="hint">{gift.note}</p> : null}

                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-semibold">
                        Correct this gift
                      </summary>
                      <div className="mt-3">
                        <DonationForm
                          charities={charityOptions}
                          today={todayInZone(user.timeZone)}
                          defaults={{
                            id: gift.id,
                            charityId: gift.charityId,
                            date: gift.date,
                            amountCents: gift.amountCents,
                            kind: gift.kind,
                            nonCashDescription: gift.nonCashDescription,
                            acknowledgmentOnFile: gift.acknowledgmentOnFile,
                            receiptKey: gift.receiptKey,
                            receiptSha256: gift.receiptSha256,
                            note: gift.note,
                          }}
                        />
                      </div>
                    </details>

                    <span className="mt-2 flex">
                      <DeleteButton
                        what={`the ${formatCents(gift.amountCents)} gift to ${
                          charity.name
                        } on ${formatDateLong(gift.date)}`}
                        onDelete={async () => {
                          'use server';
                          await deleteDonationAction(gift.id);
                        }}
                      />
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>

        <details className="panel panel-body">
          <summary className="cursor-pointer text-sm font-semibold">
            Edit the charity, or stop using it
          </summary>
          <div className="mt-4">
            <CharityForm
              defaults={{ id: charity.id, name: charity.name, taxId: charity.taxId }}
            />
            {/* Archived, not deleted - and the foreign key is `restrict` so a
                delete could not happen anyway. A charity the household has
                stopped giving to still received what it received, and those
                gifts are the deduction. */}
            {charity.isArchived ? null : (
              <div className="mt-3">
                <DeleteButton
                  label="Stop using this charity"
                  what={`${charity.name} from the list (the gifts already recorded are kept)`}
                  onDelete={async () => {
                    'use server';
                    await archiveCharityAction(charity.id);
                  }}
                />
              </div>
            )}
          </div>
        </details>
      </Well>
    </>
  );
}

function needsLetter(gift: DonationView, thresholds: ThresholdSet | null): boolean {
  return thresholds ? donationFlags(gift, thresholds).needsAcknowledgment : false;
}

function needsForm8283(gift: DonationView, thresholds: ThresholdSet | null): boolean {
  return thresholds ? donationFlags(gift, thresholds).needsForm8283 : false;
}

/** Guarded: an id the picker no longer offers reads as itself, not a crash. */
function kindOf(id: string): string {
  return donationKind.has(id) ? donationKind.get(id).label : id;
}
