import { Suspense } from 'react';
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
 * design, because it does not re-render when the query changes. So it renders
 * the rail for the SESSION year and `RailFrame`, which is a client component,
 * reads the URL and takes over from there. What is passed down here is the
 * fallback and the first paint, not the answer.
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

      {/* `useSearchParams` needs a Suspense boundary above it. The fallback is
          the rail's own width so the shell never reflows while it resolves. */}
      <Suspense fallback={<div className="rail" />}>
        <RailFrame
          taxYear={user.taxYear}
          counts={counts}
          who={`${user.actor.name} · ${user.enterprise.name}`}
          footer={<SignOutButton />}
        />
      </Suspense>

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
