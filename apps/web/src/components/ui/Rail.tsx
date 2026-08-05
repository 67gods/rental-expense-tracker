import Link from 'next/link';
import { withYear } from '@/lib/year';

/**
 * The navigation rail.
 *
 * Always visible, never behind a tap. Grouped by what you are doing rather
 * than by record type - Review, Records, Year - because "where do I see my
 * expenses" and "where do I close the year" are different intents that used to
 * land in the same flat list.
 *
 * THE YEAR LIVES HERE. Every link is built through `withYear`, so switching to
 * 2025 and then opening Reports keeps you in 2025. The old bottom tab bar
 * dropped the year on every navigation, which is how a fully loaded year came
 * to look empty.
 */

export interface RailCounts {
  expenses: number;
  income: number;
  time: number;
  trips: number;
  properties: number;
  jobs: number;
  people: number;
  interest: number;
  reports: number;
}

const ICONS = {
  overview: 'M2 6.5 7 2l5 4.5V12a1 1 0 0 1-1 1H8V9.5H6V13H3a1 1 0 0 1-1-1z',
  rows: 'M1.5 3h11M1.5 7h11M1.5 11h7',
  money: 'M7 1.5v11M4.2 3.6h4a1.8 1.8 0 0 1 0 3.6h-3a1.8 1.8 0 0 0 0 3.6h4',
  clock: 'M7 2.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6zM7 4.6V7l1.8 1.1',
  route: 'M3.5 12c0-3 7-3.5 7-6.5a2 2 0 0 0-4 0M3.5 12h.01',
  house: 'M2 12V5l5-3 5 3v7M5.5 12V8h3v4',
  link: 'M5.8 8.2a2.2 2.2 0 0 0 3.1 0l1.9-1.9a2.2 2.2 0 0 0-3.1-3.1L6.9 4M8.2 5.8a2.2 2.2 0 0 0-3.1 0L3.2 7.7a2.2 2.2 0 0 0 3.1 3.1L7.1 10',
  users: 'M5 3.3a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8zM1.6 12c0-2 1.5-3.2 3.4-3.2S8.4 10 8.4 12M10.4 4.2a1.6 1.6 0 1 1 0 3.2M12.4 12c0-1.6-1-2.6-2.4-2.9',
  calendar: 'M2.5 3.5h9v8.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5zM2.5 6.2h9M5 2v2.4M9 2v2.4',
  bank: 'M1.6 5.4 7 2.2l5.4 3.2M2.8 5.9v5.2M5.9 5.9v5.2M8.1 5.9v5.2M11.2 5.9v5.2M1.6 11.8h10.8',
  doc: 'M3.2 1.6h4.4l3.2 3.2v7.6a.5.5 0 0 1-.5.5H3.2a.5.5 0 0 1-.5-.5V2.1a.5.5 0 0 1 .5-.5zM7.6 1.6v3.2h3.2',
  gear: 'M7 4.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4zM7 1.2v1.5M7 11.3v1.5M12.8 7h-1.5M2.7 7H1.2M11.1 2.9l-1 1M3.9 10.1l-1 1M11.1 11.1l-1-1M3.9 3.9l-1-1',
} as const;

type IconKey = keyof typeof ICONS;

interface Item {
  href: string;
  label: string;
  icon: IconKey;
  count?: number;
}

function icon(key: IconKey) {
  return (
    <svg
      className="rail-icon"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[key]} />
    </svg>
  );
}

export function Rail({
  pathname,
  taxYear,
  years,
  counts,
  who,
  footer,
}: {
  pathname: string;
  taxYear: number;
  years: number[];
  counts: RailCounts;
  who: string;
  footer?: React.ReactNode;
}) {
  const groups: { heading: string; items: Item[] }[] = [
    {
      heading: 'Review',
      // Overview leads this group rather than sitting under Year: it is where
      // you land and what you check, not part of the January sitting.
      items: [
        { href: '/', label: 'Overview', icon: 'overview' },
        { href: '/entries?tab=expenses', label: 'Expenses', icon: 'rows', count: counts.expenses },
        { href: '/entries?tab=income', label: 'Rent', icon: 'money', count: counts.income },
        { href: '/entries?tab=time', label: 'Time', icon: 'clock', count: counts.time },
        { href: '/entries?tab=trips', label: 'Mileage', icon: 'route', count: counts.trips },
      ],
    },
    {
      heading: 'Records',
      items: [
        { href: '/properties', label: 'Properties', icon: 'house', count: counts.properties },
        { href: '/jobs', label: 'Jobs', icon: 'link', count: counts.jobs },
        { href: '/people', label: 'People', icon: 'users', count: counts.people },
      ],
    },
    {
      heading: 'Year end',
      items: [
        // Not rental income at all - it belongs on Schedule B - but it arrives
        // in the same post in the same week, so it sits with the rest of the
        // January sitting rather than among the rental records above.
        { href: '/interest', label: 'Interest income', icon: 'bank', count: counts.interest },
        // Named with the year in it. "Close the year" begs the question which
        // year, and the answer is the one the rail is showing.
        { href: '/year-end', label: `Close ${taxYear}`, icon: 'calendar' },
        { href: '/reports', label: 'Reports', icon: 'doc', count: counts.reports },
        { href: '/settings', label: 'Settings', icon: 'gear' },
      ],
    },
  ];

  return (
    <nav className="rail" aria-label="Main">
      <div className="rail-brand">
        <span className="rail-mark" aria-hidden="true" />
        Ledger
      </div>

      <div className="rail-years" role="group" aria-label="Tax year">
        {years.map((year) => (
          <Link
            key={year}
            href={withYear(pathname === '/' ? '/' : pathname, year)}
            className="rail-year"
            aria-current={year === taxYear}
          >
            {year}
          </Link>
        ))}
      </div>

      {groups.map((group) => (
        <div className="rail-group" key={group.heading}>
          <h2 className="rail-heading">{group.heading}</h2>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={withYear(item.href, taxYear)}
              className="rail-link"
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
            >
              {icon(item.icon)}
              <span>{item.label}</span>
              {/* A count of nothing still earns its place: an empty year is a
                  finding, not a reason to hide the row. */}
              {item.count === undefined ? null : (
                <span className="rail-count">{item.count}</span>
              )}
            </Link>
          ))}
        </div>
      ))}

      {/*
        Passed in as a slot rather than imported.

        Sign-out is a server component wrapping an inline server action, and
        this file is reached through a client boundary (the rail needs
        `usePathname`). A client module cannot define a server action, but it
        can happily render one it was handed - so the layout builds it on the
        server and passes it down.
      */}
      <div className="rail-foot">
        <p>{who}</p>
        <div className="rail-foot-actions">{footer}</div>
      </div>
    </nav>
  );
}

/**
 * Overview is only current on exactly "/" - otherwise every path would match
 * it, since every path starts with a slash.
 */
function isActive(pathname: string, href: string): boolean {
  const base = href.split('?')[0] ?? href;
  if (base === '/') return pathname === '/';
  return pathname === base || pathname.startsWith(`${base}/`);
}
