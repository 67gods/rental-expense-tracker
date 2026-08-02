/**
 * Shared form-action state.
 *
 * Deliberately not in a `'use server'` file: those may only export async
 * functions, so a constant or a type living alongside the actions breaks the
 * build. Keeping them here lets both the actions and the client forms import
 * the same shape.
 */

export interface FormState {
  ok: boolean;
  /** Shown at the top of the form when something went wrong. */
  message?: string;
  /** Field-level messages, keyed by form field name. */
  fields?: Record<string, string>;
  /** Confirmation text shown after a successful save that stays on the page. */
  saved?: string;
}

export const EMPTY_FORM_STATE: FormState = { ok: false };
