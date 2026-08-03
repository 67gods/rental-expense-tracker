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
  variant = 'button',
}: {
  onDelete: () => Promise<void>;
  label?: string;
  what: string;
  /** 'action' for a table row. A bordered red box repeated down eighty rows
      out-shouts the money beside it, which is what the table is for. */
  variant?: 'button' | 'action';
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={variant === 'action' ? 'act act-danger' : 'btn btn-danger'}
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
