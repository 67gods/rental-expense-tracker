'use client';

import { usePathname } from 'next/navigation';
import { Rail, type RailCounts } from './Rail';

/**
 * Supplies the rail with the current path.
 *
 * `usePathname` is a client hook, and the layout that renders the rail is a
 * server component doing database work. Rather than push the whole layout to
 * the client, this thin wrapper is the only part that runs there - the counts
 * and the year are computed on the server and passed straight through.
 */
export function RailFrame(props: {
  taxYear: number;
  years: number[];
  counts: RailCounts;
  who: string;
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();
  return <Rail pathname={pathname} {...props} />;
}
