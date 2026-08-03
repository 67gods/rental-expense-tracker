import Link from 'next/link';
import { formatCents, RULES_VERSION, thresholdsFor } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { runIntegrityChecks } from '@/db/integrity';

export const metadata = { title: 'Settings' };

/**
 * Settings and the data health report.
 *
 * The integrity report reports and never repairs. An automatic fix to a tax
 * record is the kind of silent change that makes a log indefensible.
 */
export default async function SettingsPage() {
  const user = await requireUser();
  const findings = await runIntegrityChecks();
  const thresholds = thresholdsFor(user.taxYear);

  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');
  const info = findings.filter((f) => f.severity === 'info');

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-bold tracking-tight">Settings</h1>

      <section className="panel panel-body">
        <h2 className="section-title">This setup</h2>
        <dl className="mt-2 grid gap-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="hint">Enterprise</dt>
            <dd className="font-semibold">{user.enterprise.name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="hint">Type</dt>
            <dd className="font-semibold">{user.enterprise.propertyType}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="hint">Tax year</dt>
            <dd className="num font-semibold">{user.taxYear}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="hint">Timezone</dt>
            <dd className="font-semibold">{user.timeZone}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="hint">Signed in as</dt>
            <dd className="font-semibold">{user.email}</dd>
          </div>
        </dl>
        <p className="hint mt-3">
          Timezone decides what &ldquo;today&rdquo; and &ldquo;this tax year&rdquo; mean.
          It is set once at install, because changing it later would move entries near
          midnight between days. Set it with APP_TIMEZONE.
        </p>
      </section>

      <section className="panel panel-body">
        <h2 className="section-title">Figures in force for {user.taxYear}</h2>
        <dl className="mt-2 grid gap-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="hint">Hours target</dt>
            <dd className="num font-semibold">{thresholds.safeHarborHourTarget}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="hint">1099 reporting threshold</dt>
            <dd className="num font-semibold">
              {formatCents(thresholds.w9ReportingThresholdCents)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="hint">De minimis per invoice</dt>
            <dd className="num font-semibold">
              {formatCents(thresholds.deMinimisInvoiceCents)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="hint">Rule set</dt>
            <dd className="num font-semibold">{RULES_VERSION}</dd>
          </div>
        </dl>
        <p className="hint mt-3">
          These belong to {user.taxYear} and are not carried into other years. The 1099
          threshold was $600 through 2025 and is $2,000 from 2026, so a report run for a
          past year applies that year&rsquo;s figure rather than today&rsquo;s. Your CPA
          decides what any of it means; this app only records what happened.
        </p>
      </section>

      <section>
        <h2 className="section-title mb-2">Data health</h2>
        <div className="tablebox">
          {findings.length === 0 ? (
            <p className="p-4 text-sm">Nothing to flag.</p>
          ) : (
            [...errors, ...warnings, ...info].map((finding) => (
              <div key={finding.check} className="kv">
                <div>
                  <p className="rowtitle">
                    <span
                      className={
                        finding.severity === 'error'
                          ? 'tag tag-neg'
                          : finding.severity === 'warning'
                            ? 'tag tag-warn'
                            : 'tag tag-muted'
                      }
                    >
                      {finding.severity}
                    </span>{' '}
                    {finding.check.replace(/_/g, ' ')}
                  </p>
                  <p className="hint">{finding.message}</p>
                </div>
                <span className="num">{finding.count}</span>
              </div>
            ))
          )}
        </div>
        <p className="hint mt-2">
          These checks report and never repair. Fixing a tax record automatically is how a
          log stops being defensible.
        </p>
      </section>

      <section className="panel panel-body">
        <h2 className="section-title mb-2">Your data</h2>
        <p className="hint">
          Everything is exportable as CSV at any time. There is no lock-in and no
          proprietary format.
        </p>
        <Link href="/reports" className="btn btn-block mt-3">
          Go to exports
        </Link>
      </section>
    </div>
  );
}
