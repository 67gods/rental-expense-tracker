import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { getRunningTimer, LONG_RUNNING_MINUTES } from '@/server/services/timer';
import { listProperties } from '@/server/services/reference';
import { TabBar } from '@/components/TabBar';
import { SignOutButton } from '@/components/SignOutButton';
import { TimerBar } from '@/components/TimerBar';

/**
 * The signed-in shell.
 *
 * Navigation sits at the bottom on phones - it is the half of the screen a
 * thumb reaches while holding the phone one-handed (§7). On desktop the same
 * links move into the header, where reports and cleanup happen.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Read in the layout so the running timer follows the user onto every screen,
  // which is what makes "forgot to stop it" recoverable (§8.2).
  const timer = await getRunningTimer(user.actor.id);
  const properties = timer?.propertyId ? await listProperties() : [];
  const propertyName =
    properties.find((p) => p.id === timer?.propertyId)?.nickname ?? null;

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-[color:var(--surface-raised)]">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
          <Link href="/" className="text-sm font-bold tracking-tight">
            Rental Tracker
          </Link>
          <span className="hint ml-auto hidden sm:inline">
            {user.actor.name} · {user.taxYear}
          </span>
          <Link href="/settings" className="btn btn-ghost text-xs">
            Settings
          </Link>
          <SignOutButton />
        </div>

        {timer ? (
          <TimerBar
            id={timer.id}
            startedAtMs={timer.startedAt.getTime()}
            category={timer.category}
            propertyName={propertyName}
            longRunningMinutes={LONG_RUNNING_MINUTES}
          />
        ) : null}
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 pb-28 pt-4 sm:pb-10">
        {children}
      </main>

      <TabBar />
    </>
  );
}
