'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { toErrorPayload } from '@/server/errors';
import {
  assignToJob,
  deleteJob,
  getJob,
  jobForRecord,
  unassignFromJob,
  updateJob,
} from '@/server/services/jobs';
import type { FormState } from './formState';

/**
 * Jobs: one header per real-world task, with time, miles and money as its line
 * items.
 *
 * The rule these actions exist to keep is that a job is never something the
 * owner has to think about. It is born from a record that already exists,
 * takes its title from that record's own description, and nobody is ever asked
 * to name something before they have anything to put in it.
 */

/**
 * "+ Add related" — the whole interaction, in one round trip.
 *
 * Finds or creates the job for the record being looked at, then sends the
 * owner straight into the next capture form with the job and the property
 * already carried across. No dialog, no naming step, no picker.
 */
export async function addRelatedAction(
  kind: 'time' | 'trip' | 'expense',
  recordId: string,
  next: 'time' | 'trip' | 'expense',
): Promise<void> {
  await requireUser();
  const job = await jobForRecord(kind, recordId);

  revalidatePath('/entries');
  revalidatePath('/jobs');
  redirect(`/log/${next}?job=${job.id}`);
}

/** Adding one more record to a job already open on screen. */
export async function addToJobAction(
  jobId: string,
  next: 'time' | 'trip' | 'expense',
): Promise<void> {
  await requireUser();
  // Checked rather than trusted: a stale link to a deleted job would otherwise
  // write a record pointing at nothing, and the foreign key would reject it
  // only after the owner had filled the form in.
  await getJob(jobId);
  redirect(`/log/${next}?job=${jobId}`);
}

/**
 * "Group these" — the after-the-fact path, from the entries list.
 *
 * Takes either an existing job or a name for a new one. The service refuses an
 * empty selection and a nameless new job, so both messages come back written
 * for the user.
 */
export async function groupIntoJobAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireUser();

    const jobId = str(formData, 'jobId');
    const newJobTitle = str(formData, 'newJobTitle');

    const job = await assignToJob({
      ...(jobId ? { jobId } : {}),
      ...(newJobTitle ? { newJobTitle } : {}),
      timeEntryIds: ids(formData, 'timeEntryIds'),
      tripIds: ids(formData, 'tripIds'),
      expenseIds: ids(formData, 'expenseIds'),
    } as Parameters<typeof assignToJob>[0]);

    revalidatePath('/entries');
    revalidatePath('/jobs');
    return { ok: true, saved: `Grouped into "${job.title}".` };
  } catch (error) {
    const payload = toErrorPayload(error);
    return { ok: false, message: payload.message, fields: payload.fields };
  }
}

export async function renameJobAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requireUser();
    await updateJob({
      id: str(formData, 'id'),
      title: str(formData, 'title'),
      notes: str(formData, 'notes') || null,
    });
    revalidatePath('/jobs');
    return { ok: true, saved: 'Saved.' };
  } catch (error) {
    const payload = toErrorPayload(error);
    return { ok: false, message: payload.message, fields: payload.fields };
  }
}

/** Takes records back out of a job. Only the membership goes. */
export async function removeFromJobAction(
  kind: 'time' | 'trip' | 'expense',
  recordId: string,
): Promise<void> {
  await requireUser();
  await unassignFromJob({
    timeEntryIds: kind === 'time' ? [recordId] : [],
    tripIds: kind === 'trip' ? [recordId] : [],
    expenseIds: kind === 'expense' ? [recordId] : [],
  });
  revalidatePath('/entries');
  revalidatePath('/jobs');
}

/**
 * Deletes the header. Every record in it survives with a null job id.
 *
 * Redirects to the list rather than staying put, because the page the owner is
 * on is about to stop existing.
 */
export async function deleteJobAction(id: string): Promise<void> {
  await requireUser();
  await deleteJob(id);
  revalidatePath('/entries');
  revalidatePath('/jobs');
  redirect('/jobs');
}

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function ids(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((v): v is string => typeof v === 'string' && v.length > 0);
}
