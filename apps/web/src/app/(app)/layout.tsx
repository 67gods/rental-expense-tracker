import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { getRunningTimer, LONG_RUNNING_MINUTES } from '@/server/services/timer';
import { listProperties } from '@/server/services/reference';
import { railCounts } from '@/server/services/navigation';
import { REPORTS } from '@/server/services/reports';
import { RailFrame } from '@/components/ui/RailFrame';
import { SignOutButton } from '@/components/SignOutButton';
import { TimerBar } from '@/components/TimerBar';
import { yearChoices } from '@/lib/year';

/**
 * The signed-in shell.
 *
 * A persistent rail rather than a bottom tab bar. The tab bar capped at five
 * destinations and organised by record type, which is how "close the year" and
 * "where are my expenses" ended up as the same kind of thing in one flat list.
 * The rail groups by intent and has room to say how many rows sit behind each
 * item.
 *
 * The layout cannot read `?year=` - a Next layout receives no searchParams, by
 * design, because it does not re-render when the query changes. So the rail
 * offers the switch using the session year, and each PAGE resolves the real
 * year from its own query string. Offering and honouring are split on purpose.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [timer, counts] = await Promise.all([
    getRunningTimer(user.actor.id),
    railCounts(user.taxYear, Object.keys(REPORTS).length),
  ]);

  // Only fetched when there is a timer whose property needs naming.
  const properties = timer?.propertyId ? await listProperties() : [];
  const propertyName = properties.find((p) => p.id === timer?.propertyId)?.nickname ?? null;

  return (
    <div className="app">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <RailFrame
        taxYear={user.taxYear}
        years={yearChoices(user.taxYear, user.taxYear)}
        counts={counts}
        who={`${user.actor.name} · ${user.enterprise.name}`}
        footer={<SignOutButton />}
      />

      <div className="main">
        {/* Above everything else: a timer left running distorts the year, and
            the whole point of the bar is that it stays in view until dealt with. */}
        {timer ? (
          <TimerBar
            id={timer.id}
            startedAtMs={timer.startedAt.getTime()}
            category={timer.category}
            propertyName={propertyName}
            longRunningMinutes={LONG_RUNNING_MINUTES}
          />
        ) : null}
        <main id="main">{children}</main>
      </div>
    </div>
  );
}
