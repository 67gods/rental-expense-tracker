import Link from 'next/link';
import { SAFE_HARBOR_HOUR_TARGET } from '@rental/domain';
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

  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');
  const info = findings.filter((f) => f.severity === 'info');

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-bold tracking-tight">Settings</h1>

      <section className="card card-pad">
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
            <dd className="tnum font-semibold">{user.taxYear}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="hint">Timezone</dt>
            <dd className="font-semibold">{user.timeZone}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="hint">Hours target</dt>
            <dd className="tnum font-semibold">{SAFE_HARBOR_HOUR_TARGET}</dd>
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

      <section>
        <h2 className="section-title mb-2">Data health</h2>
        <div className="card">
          {findings.length === 0 ? (
            <p className="p-4 text-sm">Nothing to flag.</p>
          ) : (
            [...errors, ...warnings, ...info].map((finding) => (
              <div key={finding.check} className="row">
                <div className="row-main">
                  <p className="row-title">
                    <span
                      className={
                        finding.severity === 'error'
                          ? 'badge badge-alert'
                          : finding.severity === 'warning'
                            ? 'badge badge-flag'
                            : 'badge badge-not-eligible'
                      }
                    >
                      {finding.severity}
                    </span>{' '}
                    {finding.check.replace(/_/g, ' ')}
                  </p>
                  <p className="row-meta">{finding.message}</p>
                </div>
                <span className="row-value">{finding.count}</span>
              </div>
            ))
          )}
        </div>
        <p className="hint mt-2">
          These checks report and never repair. Fixing a tax record automatically is how a
          log stops being defensible.
        </p>
      </section>

      <section className="card card-pad">
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
