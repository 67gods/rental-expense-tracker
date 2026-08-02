import Link from 'next/link';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Dashboard' };

/**
 * Placeholder home. The dashboard proper - the eligible-hours gauge, year-to-date
 * figures, review counts, and W-9 warnings - is built in phase 9.
 */
export default async function HomePage() {
  const user = await requireUser();

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">
          {user.enterprise.name} · {user.taxYear}
        </h1>
        <p className="hint">Signed in as {user.actor.name}.</p>
      </div>

      <Link href="/log" className="btn-quick">
        <strong>Log something</strong>
        <span>Time, an expense, or a trip.</span>
      </Link>
    </div>
  );
}
