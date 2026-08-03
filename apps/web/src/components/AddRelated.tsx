'use client';

import { useTransition } from 'react';
import { addRelatedAction, addToJobAction } from '@/app/actions/jobs';

type Kind = 'time' | 'trip' | 'expense';

const NEXT: readonly { kind: Kind; label: string }[] = [
  { kind: 'time', label: 'Time' },
  { kind: 'trip', label: 'Trip' },
  { kind: 'expense', label: 'Expense' },
];

/**
 * "+ Add related" — the whole jobs feature, as far as daily use is concerned.
 *
 * Shown after a save, against the record just written. One tap creates the job
 * silently, titles it from that record's own description, and opens the next
 * capture form. The owner is never asked to name anything, never sees a picker,
 * and never has to decide up front that an errand is going to have three parts.
 *
 * That last point is what makes it work. Nobody knows at the desk on Monday
 * that Monday's search will turn into Tuesday's drive and Tuesday's invoice.
 */
export function AddRelated({ kind, recordId }: { kind: Kind; recordId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <p className="rowtitle">Part of something bigger?</p>
      <p className="hint">
        Add the time, miles, or money that went with it and they will be kept together as one
        job.
      </p>
      <div className="seg" style={{marginTop:10}}>
        {NEXT.map((option) => (
          <button
            key={option.kind}
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(() => {
                void addRelatedAction(kind, recordId, option.kind);
              })
            }
          >
            + {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The same thing from inside a job that already exists. */
export function AddToJob({ jobId }: { jobId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="seg">
      {NEXT.map((option) => (
        <button
          key={option.kind}
          type="button"
         
          disabled={pending}
          onClick={() =>
            startTransition(() => {
              void addToJobAction(jobId, option.kind);
            })
          }
        >
          + {option.label}
        </button>
      ))}
    </div>
  );
}
