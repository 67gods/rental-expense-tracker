import Link from 'next/link';
import { formatCents, interestSource } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { listPeople } from '@/server/services/reference';
import {
  interestTotalsForYear,
  listBankAccounts,
  listInterestYears,
} from '@/server/services/interest';
import { archiveBankAccountAction, deleteInterestYearAction } from '@/app/actions/yearEnd';
import { BankAccountForm } from '@/components/BankAccountForm';
import { InterestYearForm } from '@/components/InterestYearForm';
import { DeleteButton } from '@/components/DeleteButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Empty, StatStrip, Tag, Well } from '@/components/ui';
import { resolveTaxYear } from '@/lib/year';

export const metadata = { title: 'Interest income' };

/**
 * Interest income, per account, per year.
 *
 * The one screen in this app that is not about the rental. A savings account in
 * a person's name, or one in a business's, earns interest that never touches a
 * property and lands on Schedule B rather than Schedule E. It is here because
 * the January hand-off to the CPA is a single hand-off, and a figure kept in a
 * different app is a figure found in March.
 *
 * Organised by ACCOUNT rather than as a list of figures, because "what did the
 * joint savings pay in 2025" is the question, and a flat list by year makes you
 * hold the mapping in your head to answer it. The same reasoning that groups
 * the 1098s by property on the year-end screen.
 */
export default async function InterestPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const taxYear = resolveTaxYear(params.year, user.taxYear);

  const [accounts, years, totals, people] = await Promise.all([
    listBankAccounts(),
    listInterestYears({ taxYear }),
    interestTotalsForYear(taxYear),
    listPeople(),
  ]);

  const byAccount = new Map(years.map((row) => [row.bankAccountId, row]));
  const accountOptions = accounts.map((account) => ({
    id: account.id,
    label: accountLabel(account.bankName, account.label, account.holderLabel),
  }));

  const pickerYears = [user.taxYear, user.taxYear - 1, user.taxYear - 2];
  if (!pickerYears.includes(taxYear)) pickerYears.unshift(taxYear);

  return (
    <>
      <PageHeader
        title={`Interest income · ${taxYear}`}
        actions={
          <>
            <a
              className="btn"
              href={`/api/v1/export/interest-income?taxYear=${taxYear}`}
              download
            >
              Export CSV
            </a>
            <nav className="seg" aria-label="Tax year">
              {pickerYears.map((year) => (
                <a key={year} href={`/interest?year=${year}`} aria-current={year === taxYear}>
                  {year}
                </a>
              ))}
            </nav>
          </>
        }
      />
      <Well>
        {/*
          Said plainly, once, at the top. Every other figure in this app feeds
          Schedule E, and someone reading this screen in a hurry will assume
          this one does too. It does not, and a wrong assumption here shows up
          as rental income that never existed.
        */}
        <p className="hint">
          This is not rental income. Interest on a personal or business account belongs on
          Schedule B, and nothing on this page reaches Schedule E or changes a property&rsquo;s
          net. It is kept here so January is one sitting rather than two.
        </p>

        {accounts.length === 0 ? null : (
          <StatStrip
            stats={[
              {
                key: 'interest',
                label: `Interest in ${taxYear}`,
                value: formatCents(totals.interestCents),
                sub: `${totals.accountCount} of ${accounts.length} ${
                  accounts.length === 1 ? 'account' : 'accounts'
                } entered`,
              },
              {
                key: 'exempt',
                label: 'Tax-exempt',
                value: formatCents(totals.taxExemptCents),
                sub: 'Reported, not taxed',
              },
              {
                key: 'withheld',
                label: 'Federal tax withheld',
                value: formatCents(totals.withheldCents),
                sub: 'A credit on the return',
              },
            ]}
          />
        )}

        {accounts.length === 0 ? (
          <Empty what="bank accounts on file" />
        ) : (
          <div className="grid gap-3">
            {accounts.map((account) => {
              const row = byAccount.get(account.id);

              return (
                <section key={account.id} className="panel panel-body">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold">
                        {account.bankName}
                        {account.label ? ` · ${account.label}` : ''}
                      </h3>
                      <p className="hint">
                        In the name of {account.holderLabel}
                        {account.holderKind === 'business' ? ' (business)' : ''}
                      </p>
                    </div>
                    {row ? (
                      <span className="num text-sm font-semibold">
                        {formatCents(row.interestCents)}
                      </span>
                    ) : (
                      <Tag tone="warn">Nothing entered for {taxYear}</Tag>
                    )}
                  </div>

                  {row ? (
                    <>
                      <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-3">
                        <Figure label="Interest" cents={row.interestCents} />
                        <Figure
                          label="Tax-exempt"
                          cents={row.taxExemptInterestCents}
                          note={sourceLabel(row.documentSource)}
                        />
                        <Figure label="Federal tax withheld" cents={row.federalTaxWithheldCents} />
                      </dl>

                      {row.documentNote ? <p className="hint mt-2">{row.documentNote}</p> : null}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <DeleteButton
                          what={`the ${account.bankName} 1099-INT for ${taxYear}`}
                          onDelete={async () => {
                            'use server';
                            await deleteInterestYearAction(row.id);
                          }}
                        />
                      </div>
                    </>
                  ) : null}

                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-semibold">
                      {row ? `Edit the ${taxYear} figure` : `Add the ${taxYear} figure`}
                    </summary>
                    <div className="mt-3">
                      <InterestYearForm
                        taxYear={taxYear}
                        accounts={accountOptions}
                        isEdit={Boolean(row)}
                        defaults={{
                          bankAccountId: account.id,
                          interestCents: row?.interestCents ?? null,
                          earlyWithdrawalPenaltyCents: row?.earlyWithdrawalPenaltyCents ?? null,
                          savingsBondInterestCents: row?.savingsBondInterestCents ?? null,
                          federalTaxWithheldCents: row?.federalTaxWithheldCents ?? null,
                          taxExemptInterestCents: row?.taxExemptInterestCents ?? null,
                          documentSource: row?.documentSource ?? null,
                          documentNote: row?.documentNote ?? null,
                        }}
                      />
                    </div>
                  </details>

                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold">
                      Edit or close the account
                    </summary>
                    <div className="mt-3">
                      <BankAccountForm
                        people={people.map((p) => ({ id: p.id, label: p.name }))}
                        defaults={{
                          id: account.id,
                          bankName: account.bankName,
                          holderActorId: account.holderActorId,
                          holderName: account.holderName,
                          label: account.label,
                        }}
                      />
                      {/* Archived, not deleted. An account closed in June still
                          earned interest that year, and the years behind it are
                          the record of it. */}
                      <div className="mt-3">
                        <DeleteButton
                          label="Close this account"
                          what={`${account.bankName} from the list (the figures already entered are kept)`}
                          onDelete={async () => {
                            'use server';
                            await archiveBankAccountAction(account.id);
                          }}
                        />
                      </div>
                    </div>
                  </details>
                </section>
              );
            })}
          </div>
        )}

        <details className="panel panel-body" open={accounts.length === 0}>
          <summary className="cursor-pointer text-sm font-semibold">Add an account</summary>
          <div className="mt-4">
            <BankAccountForm people={people.map((p) => ({ id: p.id, label: p.name }))} />
          </div>
        </details>

        <Link href={`/year-end?year=${taxYear}`} className="btn btn-block">
          Back to closing {taxYear}
        </Link>
      </Well>
    </>
  );
}

function Figure({
  label,
  cents,
  note,
}: {
  label: string;
  cents: number | null;
  note?: string | null;
}) {
  return (
    <div>
      <dt className="text-xs muted">{label}</dt>
      <dd className="num text-sm font-semibold">
        {cents === null ? (
          <span className="font-normal muted">not recorded</span>
        ) : (
          formatCents(cents)
        )}
      </dd>
      {note ? <dd className="hint">{note}</dd> : null}
    </div>
  );
}

/** How an account reads in a dropdown, where there is only one line to say it. */
function accountLabel(bank: string, label: string | null, holder: string): string {
  return `${bank}${label ? ` · ${label}` : ''} — ${holder}`;
}

/** Guarded: an id the picker no longer offers reads as blank, not a crash. */
function sourceLabel(id: string | null): string | null {
  return id && interestSource.has(id) ? interestSource.get(id).label : null;
}
