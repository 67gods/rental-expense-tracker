'use client';

import { useTransition } from 'react';
import { confirmPaymentAction } from '@/app/actions/yearEnd';

/**
 * Turns a scheduled payment into a cash event.
 *
 * The prompt offers the planned date and lets it be corrected, because the
 * useful case is a plan that was nearly right - the instalment scheduled for
 * the 15th that actually cleared on the 18th. Confirming the wrong date puts
 * the deduction in the wrong year at a year boundary, so it is worth the one
 * question.
 */
export function ConfirmPaymentButton({
  paymentId,
  plannedDate,
}: {
  paymentId: string;
  plannedDate: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn btn-ghost shrink-0 text-xs"
      disabled={pending}
      onClick={() => {
        const answer = prompt(
          'What date did this actually leave the bank?\n\nLeave it as it is if the plan was right.',
          plannedDate,
        );
        if (answer === null) return;
        const paidDate = answer.trim() || plannedDate;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) {
          alert('That needs to be a date like 2026-01-15.');
          return;
        }
        startTransition(() => {
          void confirmPaymentAction(paymentId, paidDate);
        });
      }}
    >
      {pending ? 'Confirming…' : 'It went out'}
    </button>
  );
}
