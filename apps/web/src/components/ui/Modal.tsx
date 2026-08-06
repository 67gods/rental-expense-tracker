'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The pop-up for a small edit.
 *
 * The rule it exists to serve: a SIMPLE change - a rename, a field or two -
 * happens in a dialog opened from the thing being changed; anything bigger gets
 * its own page. What it replaces is the pattern of rendering one form per record
 * underneath a list, which is fine at five records and unusable at five hundred.
 *
 * A native `<dialog>` rather than a hand-rolled overlay, because the browser
 * already gives the three things that are tedious and easy to get wrong: focus
 * trapped inside while open, Escape closing it, and everything behind it inert.
 *
 * The children are mounted only while open. That is deliberate - a form left
 * mounted keeps whatever was typed and whatever the last save answered, so
 * cancelling and reopening would show yesterday's edit as though it were the
 * record.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // `showModal()` is the only way in - `open` as an attribute renders a dialog
  // with no backdrop, no focus trap and no Escape, which is the whole reason
  // for using the element.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      // Escape and the backdrop close the element directly, without going
      // through React. Both are routed back to the owner's state here, or it
      // would still believe the dialog is open and refuse to reopen it.
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2 className="modal-title">{title}</h2>
        <button type="button" className="act" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="modal-body">{open ? children : null}</div>
    </dialog>
  );
}
