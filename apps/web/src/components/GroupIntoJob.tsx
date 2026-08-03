'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { groupIntoJobAction } from '@/app/actions/jobs';
import { EMPTY_FORM_STATE } from '@/app/actions/formState';
import { SubmitButton } from './Pickers';

export interface GroupableRecord {
  id: string;
  title: string;
  meta: string;
}

/**
 * "Group these" — connecting records after the fact.
 *
 * The other path into a job is "+ Add related", which happens at capture time
 * and costs one tap. This one exists for the errand nobody grouped as it
 * happened, which in practice is most of them: you notice in March that
 * February's store run, drive and invoice were all the same job.
 *
 * Off by default and collapsed. The entries list is for reviewing what was
 * captured, and putting checkboxes on every row all the time would make the
 * common case - scrolling to check a figure - noisier for the rare one.
 */
export function GroupIntoJob({
  field,
  records,
  existingJobs,
}: {
  /** Which id list the service should read: one of the three child kinds. */
  field: 'timeEntryIds' | 'tripIds' | 'expenseIds';
  records: GroupableRecord[];
  existingJobs: { id: string; title: string }[];
}) {
  const [state, formAction] = useActionState(groupIntoJobAction, EMPTY_FORM_STATE);
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState('');

  if (records.length === 0) return null;

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id],
    );
  }

  return (
    <details className="panel panel-body">
      <summary className="cursor-pointer text-sm font-semibold">Group some of these</summary>

      <form action={formAction} className="mt-3 grid gap-1">
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

        <ul className="max-h-72 overflow-y-auto">
          {records.map((record) => (
            <li key={record.id} className="kv">
              <label>
                <span className="rowtitle">{record.title}</span>
                <span className="hint">{record.meta}</span>
              </label>
              <input
                type="checkbox"
                name={field}
                value={record.id}
                checked={selected.includes(record.id)}
                onChange={() => toggle(record.id)}
                className="h-6 w-6 shrink-0"
                aria-label={`Include ${record.title}`}
              />
            </li>
          ))}
        </ul>

        <label className="field mt-2">
          <span className="field-label">Add them to</span>
          <select
            className="select"
            name="jobId"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          >
            <option value="">A new job</option>
            {existingJobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>
        </label>

        {target === '' ? (
          <label className="field">
            <span className="field-label">Call it</span>
            <input
              className="input"
              name="newJobTitle"
              maxLength={200}
              placeholder="Laptop for rental management"
            />
            {state.fields?.jobId ? (
              <span className="error-text">{state.fields.jobId}</span>
            ) : null}
          </label>
        ) : null}

        {state.fields?.timeEntryIds ? (
          <span className="error-text">{state.fields.timeEntryIds}</span>
        ) : null}

        <Submit count={selected.length} />
      </form>
    </details>
  );
}

function Submit({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <SubmitButton pending={pending}>
      {count === 0
        ? 'Pick some rows first'
        : `Group ${count} ${count === 1 ? 'record' : 'records'}`}
    </SubmitButton>
  );
}
