'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { JobTitleForm } from './JobTitleForm';

/**
 * Edit, on the row it edits.
 *
 * The jobs list used to carry a "Rename a job" panel holding one form for every
 * job on the page. At a dozen jobs it was merely odd; at the few hundred this
 * will hold it is a second copy of the list, and the form for the row you are
 * looking at is nowhere near it.
 *
 * So: a quiet Edit in the row's action column, and a dialog with the two fields
 * that change. It closes itself on a successful save - the row behind it is
 * revalidated and already shows the new title, which is better confirmation than
 * a "Saved." message the owner has to dismiss.
 */
export function JobEditModal({
  id,
  title,
  notes,
}: {
  id: string;
  title: string;
  notes: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="act" onClick={() => setOpen(true)}>
        Edit
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Edit "${title}"`}>
        <JobTitleForm
          id={id}
          title={title}
          notes={notes}
          onSaved={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
