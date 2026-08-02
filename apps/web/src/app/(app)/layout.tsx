import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { TabBar } from '@/components/TabBar';
import { SignOutButton } from '@/components/SignOutButton';

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
          <SignOutButton />
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 pb-28 pt-4 sm:pb-10">
        {children}
      </main>

      <TabBar />
    </>
  );
}
