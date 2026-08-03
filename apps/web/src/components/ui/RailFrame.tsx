'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { resolveTaxYear, yearChoices } from '@/lib/year';
import { Rail, type RailCounts } from './Rail';

/**
 * Supplies the rail with the current path and the year actually being viewed.
 *
 * `usePathname` and `useSearchParams` are client hooks, and the layout that
 * renders the rail is a server component doing database work. Rather than push
 * the whole layout to the client, this thin wrapper is the only part that runs
 * there.
 *
 * THE YEAR COMES FROM THE URL, NOT THE SESSION. A Next layout receives no
 * `searchParams` by design - it does not re-render when the query changes - so
 * an earlier version had the rail offer the switch from the session year and
 * let each page honour `?year=` on its own. That split was documented as
 * deliberate and was simply wrong: clicking 2025 moved the page and left the
 * rail highlighting 2026 with every count at zero, next to a table showing
 * seventy-eight rows. A switcher that does not reflect what you switched to is
 * broken, not subtle.
 */
export function RailFrame({
  taxYear: serverYear,
  counts: serverCounts,
  who,
  footer,
}: {
  /** The year the server rendered - the session's, and the fallback. */
  taxYear: number;
  counts: RailCounts;
  who: string;
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const viewed = resolveTaxYear(params.get('year') ?? undefined, serverYear);

  const [counts, setCounts] = useState(serverCounts);

  useEffect(() => {
    // The server's counts are already right for the year it rendered, so the
    // common case - landing on the default year - costs no request at all.
    if (viewed === serverYear) {
      setCounts(serverCounts);
      return;
    }

    let cancelled = false;
    void fetch(`/api/v1/nav-counts?year=${viewed}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        // Counts are a convenience, not the record. A failed fetch leaves the
        // previous numbers rather than blanking the rail.
        if (!cancelled && body && typeof body.expenses === 'number') {
          setCounts(body as RailCounts);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [viewed, serverYear, serverCounts]);

  return (
    <Rail
      pathname={pathname}
      taxYear={viewed}
      years={yearChoices(viewed, serverYear)}
      counts={counts}
      who={who}
      footer={footer}
    />
  );
}
