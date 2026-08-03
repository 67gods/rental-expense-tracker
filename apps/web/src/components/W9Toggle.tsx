'use client';

import { useTransition } from 'react';

/**
 * The single most common Q4 edit: marking a contractor's W-9 as received.
 * One tap, no form, no navigation.
 */
export function W9Toggle({
  id,
  name,
  w9OnFile,
  onToggle,
}: {
  id: string;
  name: string;
  w9OnFile: boolean;
  onToggle: (id: string, next: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn text-xs"
      disabled={pending}
      aria-label={
        w9OnFile ? `Mark ${name} as having no W-9 on file` : `Mark ${name}'s W-9 as received`
      }
      onClick={() => startTransition(() => void onToggle(id, !w9OnFile))}
    >
      {pending ? 'Saving…' : w9OnFile ? 'Clear W-9' : 'Mark W-9 received'}
    </button>
  );
}
