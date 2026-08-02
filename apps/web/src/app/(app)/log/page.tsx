import Link from 'next/link';

export const metadata = { title: 'Quick log' };

/**
 * Quick log (§7.2). The app opens here on a phone.
 *
 * Three destinations, nothing else on screen. Every extra element is a thing
 * to read while standing in a driveway, and reading is what stops a log from
 * happening.
 */
const ACTIONS = [
  {
    href: '/log/time',
    title: 'Time',
    hint: 'Work you did. Pick a category, how long, one line about it.',
  },
  {
    href: '/log/expense',
    title: 'Expense',
    hint: 'Something you paid for. Snap the receipt.',
  },
  {
    href: '/log/trip',
    title: 'Trip',
    hint: 'Miles driven, plus the time you spent once you got there.',
  },
] as const;

export default function QuickLogPage() {
  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-bold tracking-tight">Log something</h1>

      {ACTIONS.map((action) => (
        <Link key={action.href} href={action.href} className="btn-quick">
          <strong>{action.title}</strong>
          <span>{action.hint}</span>
        </Link>
      ))}

      <Link href="/timer" className="btn btn-block mt-2">
        Start a timer instead
      </Link>
      <Link href="/log/income" className="btn btn-block">
        Record rent received
      </Link>
    </div>
  );
}
