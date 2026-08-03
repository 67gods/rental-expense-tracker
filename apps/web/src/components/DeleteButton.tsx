'use client';

import { useTransition } from 'react';

/**
 * Delete with a confirmation.
 *
 * These are tax records. A stray tap in a parking lot should not remove one,
 * and the confirmation names what is being deleted rather than asking "are you
 * sure" about nothing in particular.
 */
export function DeleteButton({
  onDelete,
  label,
  what,
}: {
  onDelete: () => Promise<void>;
  label?: string;
  what: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn btn-danger"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete ${what}? This cannot be undone.`)) return;
        startTransition(() => {
          void onDelete();
        });
      }}
    >
      {pending ? 'Deleting…' : (label ?? 'Delete')}
    </button>
  );
}
