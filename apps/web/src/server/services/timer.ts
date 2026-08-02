import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  deriveShEligible,
  isHourCategoryId,
  startTimerSchema,
  stopTimerSchema,
  taxYearOf,
  todayInZone,
  type StartTimerInput,
  type StopTimerInput,
} from '@rental/domain';
import { getDb } from '@/db/client';
import { timeEntries, timers, type TimeEntry, type Timer } from '@/db/schema';
import { env } from '@/env';
import { NotFoundError, ValidationError } from '../errors';

/**
 * The desk-work timer (§8.2).
 *
 * State lives on the server, not in the tab. A closed laptop, a browser crash,
 * or moving from the desk to the phone must not lose a running entry - and the
 * brief is explicit that a timer the user forgets to stop is a worse failure
 * than one they forget to start, so this is built to survive being forgotten
 * and then corrected.
 */

/** Past this, the running timer is almost certainly one somebody walked away from. */
export const LONG_RUNNING_MINUTES = 4 * 60;

export interface RunningTimer extends Timer {
  /** Minutes elapsed at the moment this was read. */
  elapsedMinutes: number;
  isLongRunning: boolean;
}

export function elapsedMinutes(startedAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 60_000));
}

export async function getRunningTimer(
  actorId: string,
  now: Date = new Date(),
): Promise<RunningTimer | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(timers)
    .where(and(eq(timers.actorId, actorId), isNull(timers.stoppedAt)))
    .orderBy(desc(timers.startedAt))
    .limit(1);

  if (!row) return null;

  const minutes = elapsedMinutes(row.startedAt, now);
  return {
    ...row,
    elapsedMinutes: minutes,
    isLongRunning: minutes >= LONG_RUNNING_MINUTES,
  };
}

export async function startTimer(input: StartTimerInput): Promise<Timer> {
  const data = startTimerSchema.parse(input);
  const db = getDb();

  // A partial unique index enforces one running timer per person at the
  // database. Stopping any existing one first turns that from an error the
  // user has to resolve into the behaviour they expected.
  const running = await getRunningTimer(data.actorId);
  if (running) {
    await stopTimer({
      id: running.id,
      description: running.description || 'Stopped automatically when a new timer started',
    });
  }

  const [row] = await db
    .insert(timers)
    .values({
      actorId: data.actorId,
      enterpriseId: data.enterpriseId,
      propertyId: data.propertyId,
      category: data.category,
      description: data.description,
    })
    .returning();

  if (!row) throw new Error('The timer did not start.');
  return row;
}

export interface StopTimerResult {
  timer: Timer;
  entry: TimeEntry;
  /** True when the saved duration differs from the wall-clock elapsed time. */
  wasCorrected: boolean;
}

/**
 * Stops a timer and writes the time entry it produced.
 *
 * `minutesOverride` is how a forgotten timer gets fixed: the recorded duration
 * becomes what the person actually worked, while `created_at` on the entry
 * stays the moment it was written. Correcting the number does not fabricate a
 * contemporaneous record, and the gap remains visible.
 */
export async function stopTimer(
  input: StopTimerInput,
  now: Date = new Date(),
): Promise<StopTimerResult> {
  const data = stopTimerSchema.parse(input);
  const db = getDb();

  const [timer] = await db.select().from(timers).where(eq(timers.id, data.id)).limit(1);
  if (!timer) throw new NotFoundError('That timer no longer exists.');
  if (timer.stoppedAt) {
    throw new ValidationError('That timer has already been stopped.');
  }

  const measured = elapsedMinutes(timer.startedAt, now);
  const minutes = data.minutesOverride ?? measured;

  if (minutes < 1) {
    throw new ValidationError(
      'That timer ran for under a minute. Discard it, or enter the time by hand.',
    );
  }

  const category = data.category ?? timer.category;
  if (!isHourCategoryId(category)) {
    throw new ValidationError('That category is not one we track.');
  }

  // Deliberately not routed through createTimeEntry: eligibility still comes
  // from the shared rule, but the date must be the day the work STARTED, which
  // matters for a session that ran across midnight.
  const date = todayInZone(env.timeZone, timer.startedAt);
  // Same reason the date is the start day: a timer started on 31 December and
  // stopped on 1 January belongs to the year it started in, under that year's
  // rules.
  const eligibility = deriveShEligible({ category }, taxYearOf(date));

  const [entry] = await db
    .insert(timeEntries)
    .values({
      date,
      actorId: timer.actorId,
      enterpriseId: timer.enterpriseId,
      propertyId: data.propertyId === undefined ? timer.propertyId : data.propertyId,
      minutes,
      category,
      description: data.description,
      shEligible: eligibility.shEligible,
      shEligibleReason: eligibility.reason,
      rulesVersion: eligibility.rulesVersion,
      isProvisional: eligibility.isProvisional,
      source: 'timer',
      isBackdated: date < todayInZone(env.timeZone, now),
    })
    .returning();

  if (!entry) throw new Error('The time entry was not saved, so the timer is still running.');

  const [stopped] = await db
    .update(timers)
    .set({ stoppedAt: now, timeEntryId: entry.id, description: data.description })
    .where(eq(timers.id, data.id))
    .returning();

  return {
    timer: stopped ?? timer,
    entry,
    wasCorrected: data.minutesOverride != null && data.minutesOverride !== measured,
  };
}

/** Abandons a running timer without writing an entry. */
export async function discardTimer(id: string, now: Date = new Date()): Promise<void> {
  const db = getDb();
  const updated = await db
    .update(timers)
    .set({ stoppedAt: now })
    .where(and(eq(timers.id, id), isNull(timers.stoppedAt)))
    .returning({ id: timers.id });

  if (updated.length === 0) {
    throw new NotFoundError('That timer is not running.');
  }
}
