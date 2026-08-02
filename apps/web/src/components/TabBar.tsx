'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Bottom navigation. Five destinations, no more - the sixth would shrink every
 * target below comfortable thumb reach.
 */
const TABS = [
  { href: '/', label: 'Home', icon: 'M3 11l9-8 9 8v9a2 2 0 01-2 2h-4v-6H9v6H5a2 2 0 01-2-2z' },
  { href: '/log', label: 'Log', icon: 'M12 5v14M5 12h14' },
  { href: '/entries', label: 'Entries', icon: 'M4 6h16M4 12h16M4 18h10' },
  { href: '/properties', label: 'Places', icon: 'M4 21V9l8-6 8 6v12h-6v-7h-4v7z' },
  { href: '/reports', label: 'Reports', icon: 'M5 20V10M12 20V4M19 20v-7' },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="tabbar sm:hidden" aria-label="Main">
      {TABS.map((tab) => {
        const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="tabbar-item"
            data-active={active}
            aria-current={active ? 'page' : undefined}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={tab.icon} />
            </svg>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The same destinations as a horizontal row, for the desktop header. */
export function TabLinks() {
  const pathname = usePathname();
  return (
    <nav className="hidden gap-1 sm:flex" aria-label="Main">
      {TABS.map((tab) => {
        const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold"
            style={{
              color: active ? 'var(--color-brand-600)' : 'var(--text-muted)',
              background: active ? 'var(--surface-sunken)' : 'transparent',
            }}
            aria-current={active ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
