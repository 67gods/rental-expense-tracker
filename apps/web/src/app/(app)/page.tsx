import Link from 'next/link';
import { formatCents } from '@rental/domain';
import { requireUser } from '@/lib/session';
import { getDashboardData } from '@/server/services/dashboard';
import { HoursGauge } from '@/components/HoursGauge';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await getDashboardData(user.enterprise.id, user.taxYear);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">
          {user.enterprise.name} · {user.taxYear}
        </h1>
        {/*
          Said out loud, because it caused real confusion: every figure on this
          page is for the signed-in year. A year that has been loaded but is not
          this one looks empty until you change the year on Entries or Reports,
          and there was nothing on screen to suggest that was the reason.
        */}
        <p className="hint">
          Signed in as {user.actor.name}. Everything below is {user.taxYear} — switch years on{' '}
          <Link href="/entries">Entries</Link> or <Link href="/reports">Reports</Link>.
        </p>
      </div>

      {/* W-9 warnings first: from October onward this is the item with a
          deadline attached (§5.6). */}
      {data.w9Warnings.length > 0 ? (
        <section
          className="card card-pad"
          style={{
            borderColor: data.w9Warnings[0]?.isPersistent
              ? 'var(--color-alert-500)'
              : 'var(--border)',
          }}
        >
          <h2 className="section-title">
            {data.w9Warnings[0]?.isPersistent ? 'Needs a W-9 before year end' : 'W-9 not on file'}
          </h2>
          <ul className="mt-2 grid gap-1.5">
            {data.w9Warnings.map((warning) => (
              <li key={warning.actorId} className="text-sm">
                <span
                  className={warning.isPersistent ? 'badge badge-alert' : 'badge badge-flag'}
                >
                  {formatCents(warning.paidCents)}
                </span>{' '}
                {warning.name}
              </li>
            ))}
          </ul>
          <Link href="/people" className="btn btn-block mt-3">
            Manage contractors
          </Link>
        </section>
      ) : null}

      <HoursGauge progress={data.hours} />

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="card card-pad">
          <h2 className="section-title">Expenses year to date</h2>
          <p className="tnum mt-1 text-2xl font-bold tracking-tight">
            {formatCents(data.ytdExpenseCents)}
          </p>
        </section>

        <section className="card card-pad">
          <h2 className="section-title">Rent received year to date</h2>
          <p className="tnum mt-1 text-2xl font-bold tracking-tight">
            {formatCents(data.ytdIncomeCents)}
          </p>
        </section>
      </div>

      {data.needsReviewCount > 0 || data.provisionalCount > 0 ? (
        <section className="card card-pad">
          <h2 className="section-title">Needs an answer</h2>
          <ul className="mt-2 grid gap-1.5 text-sm">
            {data.needsReviewCount > 0 ? (
              <li>
                <strong className="tnum">{data.needsReviewCount}</strong>{' '}
                {data.needsReviewCount === 1 ? 'expense' : 'expenses'} on physical work with
                no repair-or-improvement answer yet.
              </li>
            ) : null}
            {data.provisionalCount > 0 ? (
              <li>
                <strong className="tnum">{data.provisionalCount}</strong>{' '}
                {data.provisionalCount === 1 ? 'time entry counts' : 'time entries count'} as
                eligible only while that stays unresolved.
              </li>
            ) : null}
          </ul>
          <p className="hint mt-2">
            The guided repair-or-improvement questions arrive in the next milestone. Until
            then these are listed so nothing is silently assumed.
          </p>
        </section>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3">
        <Link href="/log" className="btn btn-primary">
          Log something
        </Link>
        <Link href="/timer" className="btn">
          Start a timer
        </Link>
        <Link href="/reports" className="btn">
          Reports &amp; export
        </Link>
      </div>

      <div className="grid gap-2">
        <Link href="/year-end" className="btn btn-block">
          Year-end · {user.taxYear}
        </Link>
      </div>
    </div>
  );
}
