'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { groupIntoJobAction } from '@/app/actions/jobs';
import { EMPTY_FORM_STATE } from '@/app/actions/formState';
import { SubmitButton } from './Pickers';

export interface LinkableRecord {
  id: string;
  title: string;
  meta: string;
}

type Field = 'timeEntryIds' | 'tripIds' | 'expenseIds';

const GROUPS: readonly { field: Field; heading: string; empty: string }[] = [
  { field: 'timeEntryIds', heading: 'Time', empty: 'Every time entry is already in a job.' },
  { field: 'tripIds', heading: 'Trips', empty: 'Every trip is already in a job.' },
  { field: 'expenseIds', heading: 'Money', empty: 'Every expense is already in a job.' },
];

/**
 * Linking records that already exist into the job on screen.
 *
 * The job page could already CREATE records into a job - "+ Add related" opens
 * the ordinary capture form with the job carried across. What it could not do
 * was attach something already logged, which is the more common case by far:
 * you notice in March that February's store run, drive and invoice were one
 * errand, and by then all three exist.
 *
 * That path did exist, on the entries list, but only from the wrong end - you
 * had to find the records first and then pick the job out of a dropdown.
 * Starting from the job is the direction people actually arrive from.
 *
 * All three kinds live in ONE form on purpose. An errand is a drive and an hour
 * and an invoice, and linking it in three separate submissions would be three
 * chances to stop half way.
 */
export function LinkExistingToJob({
  jobId,
  timeEntries,
  trips,
  expenses,
  truncated,
}: {
  jobId: string;
  timeEntries: LinkableRecord[];
  trips: LinkableRecord[];
  expenses: LinkableRecord[];
  truncated: boolean;
}) {
  const [state, formAction] = useActionState(groupIntoJobAction, EMPTY_FORM_STATE);
  const [selected, setSelected] = useState<string[]>([]);

  const byField: Record<Field, LinkableRecord[]> = {
    timeEntryIds: timeEntries,
    tripIds: trips,
    expenseIds: expenses,
  };
  const total = timeEntries.length + trips.length + expenses.length;

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id],
    );
  }

  if (total === 0) {
    return (
      <div className="panel panel-body">
        <p className="rowtitle">Link something already logged</p>
        <p className="hint">
          Nothing is left unassigned — every time entry, trip and expense is already in a job.
        </p>
      </div>
    );
  }

  return (
    <details className="panel panel-body">
      <summary className="cursor-pointer text-sm font-semibold">
        Link something already logged
      </summary>

      <form action={formAction} className="mt-3">
        <input type="hidden" name="jobId" value={jobId} />

        {state.message ? (
          <p role="alert" className="error-text mb-2">
            {state.message}
          </p>
        ) : null}
        {state.saved ? (
          <p role="status" className="mb-2 text-sm pos">
            {state.saved}
          </p>
        ) : null}

        <p className="hint">
          Only records not already in a job are listed. To move one out of another job, remove
          it there first — so emptying that job is something you did, not something that
          happened.
        </p>

        {GROUPS.map((group) => {
          const records = byField[group.field];
          if (records.length === 0) return null;

          return (
            <section key={group.field} className="mt-3">
              <h3 className="section-title">{group.heading}</h3>
              <ul className="tablebox max-h-72 overflow-y-auto">
                {records.map((record) => (
                  <li key={record.id} className="kv">
                    <label>
                      <span className="rowtitle">{record.title}</span>
                      <span className="hint">{record.meta}</span>
                    </label>
                    <input
                      type="checkbox"
                      name={group.field}
                      value={record.id}
                      checked={selected.includes(record.id)}
                      onChange={() => toggle(record.id)}
                      className="h-6 w-6 shrink-0"
                      aria-label={`Link ${record.title}`}
                    />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {truncated ? (
          <p className="hint mt-2">
            Showing the most recent 100 of each. Anything older is still linkable from the
            entries list.
          </p>
        ) : null}

        {/* The schema reports an empty selection against timeEntryIds whichever
            kind was left blank, so it is surfaced once rather than per group. */}
        {state.fields?.timeEntryIds ? (
          <p className="error-text mt-2">{state.fields.timeEntryIds}</p>
        ) : null}

        <div className="mt-3">
          <Submit count={selected.length} />
        </div>
      </form>
    </details>
  );
}

function Submit({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <SubmitButton pending={pending}>
      {count === 0
        ? 'Tick what belongs to this job'
        : `Link ${count} ${count === 1 ? 'record' : 'records'}`}
    </SubmitButton>
  );
}
