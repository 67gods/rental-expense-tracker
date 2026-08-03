import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { Well } from '@/components/ui';

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
    <>
      <PageHeader title="Log something" />
      <Well>
        {/* Capped like a form: three choices stretched across a 1400px screen
            are harder to hit than three sitting in a column. */}
        <div className="form grid gap-3">
          {/* Three peers, so none of them is the accent one. Painting all three
              primary made a wall of blue in which nothing was the obvious tap. */}
          {ACTIONS.map((action) => (
            <Link key={action.href} href={action.href} className="choice">
              <span className="choice-body">
                <span className="choice-title">{action.title}</span>
                <span className="hint">{action.hint}</span>
              </span>
            </Link>
          ))}

          <div className="mt-2 grid gap-2">
            <Link href="/timer" className="btn btn-block">
              Start a timer instead
            </Link>
            <Link href="/log/income" className="btn btn-block">
              Record rent received
            </Link>
          </div>
        </div>
      </Well>
    </>
  );
}
