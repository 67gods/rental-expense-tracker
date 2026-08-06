import Link from 'next/link';
import {
  donationFlags,
  donationKind,
  formatCents,
  formatDateShort,
  hasThresholdsFor,
  thresholdsFor,
  todayInZone,
  type ThresholdSet,
} from '@rental/domain';
import { requireUser } from '@/lib/session';
import {
  donationTotalsForYear,
  listCharities,
  listDonations,
  type DonationView,
} from '@/server/services/donations';
import { deleteDonationAction } from '@/app/actions/donations';
import { CharityForm } from '@/components/CharityForm';
import { DonationForm } from '@/components/DonationForm';
import { DataTable, type Badge, type DataRow } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { Empty, StatStrip, Well } from '@/components/ui';
import { resolveTaxYear, yearChoices } from '@/lib/year';

export const metadata = { title: 'Donations' };

/**
 * Charitable giving, gift by gift.
 *
 * The second screen in this app that is not about the rental. A gift to a charity
 * is an itemized deduction on Schedule A, it never touches a property, and it is
 * here for the same reason the interest is: the acknowledgment letters arrive in
 * the same post as the 1099-INTs, and a deduction kept in a shoebox is one nobody
 * claims.
 *
 * A LEDGER, not a per-charity transcription like the interest screen. A household
 * gives to the same church twenty times a year and each gift is its own row, so
 * the rows here are gifts and the charity is a column - which is also the shape
 * the CPA asks for: date, tax ID, name, amount.
 *
 * WHAT THIS SCREEN IS ACTUALLY FOR. The amounts are the easy half; a bank
 * statement has those. What no statement has is whether the letter that makes a
 * gift deductible exists - and without it a gift of $250 or more is disallowed
 * outright, not reduced. So the badge on an unsubstantiated row is the point of
 * the page, and everything else is arrangement around it.
 */
export default async function DonationsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const taxYear = resolveTaxYear(params.year, user.taxYear);

  const [charities, gifts, totals] = await Promise.all([
    listCharities(),
    listDonations({ taxYear }),
    donationTotalsForYear(taxYear),
  ]);

  const charityOptions = charities.map((charity) => ({
    id: charity.id,
    label: charity.taxId ? `${charity.name} — ${charity.taxId}` : charity.name,
  }));

  /**
   * No thresholds recorded for the year means no flags, rather than no page.
   *
   * `thresholdsFor` throws on a year the table has never heard of, and that
   * refusal is right for a figure that decides a return. It is the wrong trade
   * for a badge: someone browsing 2019 should see what they gave, not an error.
   */
  const thresholds = hasThresholdsFor(taxYear) ? thresholdsFor(taxYear) : null;
  const unsubstantiated = thresholds
    ? gifts.filter((gift) => donationFlags(gift, thresholds).needsAcknowledgment).length
    : 0;

  // Shaped on the server, as every other table in this app is: display text,
  // sort keys, the figures the footer sums, and a search haystack. The table
  // computes nothing.
  const rows: DataRow[] = gifts.map((gift) => {
    const kindLabel = kindOf(gift.kind);
    const letter = gift.acknowledgmentOnFile ? 'On file' : 'Missing';
    const receipt = gift.receiptKey ? 'Attached' : '—';

    return {
      id: gift.id,
      href: `/donations/${gift.charityId}`,
      cells: {
        date: formatDateShort(gift.date),
        charity: gift.charityName,
        taxId: gift.charityTaxId ?? '—',
        kind: kindLabel,
        amount: formatCents(gift.amountCents),
        letter,
        receipt,
        what: gift.nonCashDescription ?? '',
      },
      sort: {
        date: gift.date,
        charity: gift.charityName.toLowerCase(),
        taxId: gift.charityTaxId ?? '',
        kind: kindLabel,
        amount: gift.amountCents,
        letter,
        receipt,
        what: (gift.nonCashDescription ?? '').toLowerCase(),
      },
      numeric: { amount: gift.amountCents },
      deleteLabel: `the ${formatCents(gift.amountCents)} gift to ${gift.charityName} on ${formatDateShort(gift.date)}`,
      search: [
        gift.charityName,
        gift.charityTaxId ?? '',
        kindLabel,
        gift.nonCashDescription ?? '',
        gift.note ?? '',
        letter,
      ]
        .join(' ')
        .toLowerCase(),
      badges: badgesFor(gift, thresholds),
    };
  });

  return (
    <>
      <PageHeader
        title={`Donations · ${taxYear}`}
        actions={
          <>
            <a
              className="btn"
              href={`/api/v1/export/charitable-donations?taxYear=${taxYear}`}
              download
            >
              Export CSV
            </a>
            <nav className="seg" aria-label="Tax year">
              {yearChoices(taxYear, user.taxYear).map((year) => (
                <a key={year} href={`/donations?year=${year}`} aria-current={year === taxYear}>
                  {year}
                </a>
              ))}
            </nav>
          </>
        }
      />
      <Well>
        {/*
          Said plainly, once, at the top. Every other amount in this app reduces
          a property's net, and someone reading this screen in a hurry will
          assume this one does too. It does not, and that assumption shows up as
          a rental expense that was never a rental expense.
        */}
        <p className="hint">
          This is not a rental expense. A charitable gift is an itemized deduction on Schedule
          A, and nothing on this page reaches Schedule E or changes a property&rsquo;s net. It
          is kept here so January is one sitting rather than two.
        </p>

        {gifts.length === 0 ? null : (
          <StatStrip
            stats={[
              {
                key: 'total',
                label: `Given in ${taxYear}`,
                value: formatCents(totals.totalCents),
                sub: `${totals.giftCount} ${totals.giftCount === 1 ? 'gift' : 'gifts'} to ${
                  totals.charityCount
                } ${totals.charityCount === 1 ? 'charity' : 'charities'}`,
              },
              {
                key: 'split',
                label: 'Money / goods',
                value: formatCents(totals.cashCents),
                sub:
                  totals.nonCashCents === 0
                    ? 'All of it money'
                    : `${formatCents(totals.nonCashCents)} in goods`,
              },
              {
                key: 'letters',
                label: 'Letters missing',
                value: String(unsubstantiated),
                sub:
                  unsubstantiated === 0
                    ? 'Every gift over the line is covered'
                    : 'Each one is a deduction at risk',
              },
            ]}
          />
        )}

        {charities.length === 0 ? (
          <Empty what="charities on file" />
        ) : gifts.length === 0 ? (
          <Empty what="gifts recorded" year={taxYear} />
        ) : (
          <DataTable
            id="donations"
            rows={rows}
            searchPlaceholder="Charity, tax ID, what was given…"
            openLabel="Open"
            columns={[
              { key: 'date', header: 'Date', nowrap: true },
              { key: 'charity', header: 'Name', isLink: true },
              { key: 'taxId', header: 'Tax ID', nowrap: true },
              { key: 'kind', header: 'Kind', nowrap: true, defaultHidden: true },
              { key: 'amount', header: 'Amount', numeric: true },
              { key: 'what', header: 'What was given', defaultHidden: true },
              { key: 'letter', header: 'Letter', nowrap: true },
              { key: 'receipt', header: 'File', nowrap: true, defaultHidden: true },
            ]}
            facets={[
              { key: 'charity', label: 'Charity', allLabel: 'Any charity' },
              { key: 'kind', label: 'Kind', allLabel: 'Money or goods' },
              { key: 'letter', label: 'Letter', allLabel: 'Any state' },
            ]}
            totals={[
              { key: '_count', label: 'Gifts', count: true },
              { key: 'amount', label: `Given in ${taxYear}`, money: true },
            ]}
            onDelete={deleteDonationAction}
          />
        )}

        {/*
          One form for the whole table rather than one per row. Unlike the
          interest screen this is an insert every time - two envelopes to one
          church on one Sunday are two gifts - so corrections live behind the
          charity's own page, where the gift being corrected is unambiguous.
        */}
        {charities.length === 0 ? null : (
          <details className="panel panel-body" open={gifts.length === 0}>
            <summary className="cursor-pointer text-sm font-semibold">Log a gift</summary>
            <div className="mt-4">
              <DonationForm charities={charityOptions} today={todayInZone(user.timeZone)} />
            </div>
          </details>
        )}

        <details className="panel panel-body" open={charities.length === 0}>
          <summary className="cursor-pointer text-sm font-semibold">Add a charity</summary>
          <div className="mt-4">
            <CharityForm />
          </div>
        </details>

        <Link href={`/year-end?year=${taxYear}`} className="btn btn-block">
          Back to closing {taxYear}
        </Link>
      </Well>
    </>
  );
}

/**
 * What is still outstanding on a gift, as badges.
 *
 * Both are warnings and neither is a refusal. The gift is recorded either way -
 * the flag exists so the letter gets chased in January, when it can still be
 * obtained, rather than found missing in an audit when it cannot.
 */
function badgesFor(gift: DonationView, thresholds: ThresholdSet | null): Badge[] {
  if (!thresholds) return [];
  const flags = donationFlags(gift, thresholds);
  const badges: Badge[] = [];
  if (flags.needsAcknowledgment) {
    badges.push({ label: 'No letter', tone: 'warn' as const });
  }
  if (flags.needsForm8283) {
    badges.push({ label: 'Needs Form 8283', tone: 'warn' as const });
  }
  return badges;
}

/** Guarded: an id the picker no longer offers reads as itself, not a crash. */
function kindOf(id: string): string {
  return donationKind.has(id) ? donationKind.get(id).label : id;
}
