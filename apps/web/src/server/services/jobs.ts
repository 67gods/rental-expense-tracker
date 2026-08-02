import { asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import {
  assignJobSchema,
  createJobSchema,
  jobTitleFrom,
  rollUpJob,
  taxYearOf,
  updateJobSchema,
  type AssignJobInput,
  type CreateJobInput,
  type JobRollup,
} from '@rental/domain';
import { getDb, withTransaction } from '@/db/client';
import {
  expensePayments,
  expenses,
  jobs,
  properties,
  timeEntries,
  trips,
  type Expense,
  type Job,
  type TimeEntry,
  type Trip,
} from '@/db/schema';
import { NotFoundError } from '../errors';

/**
 * Jobs: one header per real-world task, with time, miles, and money as its
 * line items.
 *
 * Two rules keep this from becoming friction:
 *
 * 1. A job is never created empty. It is born from a record that already
 *    exists, taking its title from that record's own description, so nobody is
 *    ever asked to name something before they have anything to put in it.
 * 2. Deleting a job deletes the header only. The five records survive with a
 *    null job_id, because the grouping was a convenience and the records are
 *    the evidence.
 */

export interface JobWithChildren {
  job: Job;
  timeEntries: TimeEntry[];
  trips: Trip[];
  expenses: Expense[];
  rollup: JobRollup;
}

export async function listJobs(
  filter: { propertyId?: string; limit?: number } = {},
): Promise<(Job & { recordCount: number })[]> {
  const db = getDb();
  const rows = await db
    .select({
      job: jobs,
      recordCount: sql<string>`(
        (SELECT count(*) FROM ${timeEntries} WHERE ${timeEntries.jobId} = ${jobs.id})
      + (SELECT count(*) FROM ${trips}       WHERE ${trips.jobId}       = ${jobs.id})
      + (SELECT count(*) FROM ${expenses}    WHERE ${expenses.jobId}    = ${jobs.id})
      )`,
    })
    .from(jobs)
    .where(filter.propertyId ? eq(jobs.propertyId, filter.propertyId) : undefined)
    .orderBy(desc(jobs.createdAt))
    .limit(filter.limit ?? 200);

  return rows.map((r) => ({ ...r.job, recordCount: Number(r.recordCount) }));
}

export async function getJob(id: string): Promise<Job> {
  const [row] = await getDb().select().from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!row) throw new NotFoundError('That job no longer exists.');
  return row;
}

/**
 * A job with its children and a rollup derived under the given year's rules.
 *
 * Nothing in the rollup is stored. Ask for 2025 and 2026 and the same records
 * can answer differently, which is the point of keeping the header empty.
 */
export async function getJobWithChildren(
  id: string,
  taxYear?: number,
): Promise<JobWithChildren> {
  const db = getDb();
  const job = await getJob(id);

  const [entries, tripRows, expenseRows] = await Promise.all([
    db.select().from(timeEntries).where(eq(timeEntries.jobId, id)).orderBy(asc(timeEntries.date)),
    db.select().from(trips).where(eq(trips.jobId, id)).orderBy(asc(trips.date)),
    db.select().from(expenses).where(eq(expenses.jobId, id)).orderBy(asc(expenses.date)),
  ]);

  const paymentRows = expenseRows.length
    ? await db
        .select()
        .from(expensePayments)
        .where(
          inArray(
            expensePayments.expenseId,
            expenseRows.map((e) => e.id),
          ),
        )
    : [];

  const placedInServiceDate = job.propertyId
    ? ((
        await db
          .select({ d: properties.placedInServiceDate })
          .from(properties)
          .where(eq(properties.id, job.propertyId))
          .limit(1)
      )[0]?.d ?? null)
    : null;

  // Default to the year of the earliest record, so a job opened from the list
  // is summarised under the rules that were in force when the work happened.
  const year =
    taxYear ??
    taxYearOf(
      [...entries, ...tripRows, ...expenseRows]
        .map((r) => r.date)
        .sort()[0] ?? new Date().toISOString().slice(0, 10),
    );

  const rollup = rollUpJob(
    {
      timeEntries: entries.map((e) => ({
        date: e.date,
        minutes: e.minutes,
        category: e.category,
      })),
      trips: tripRows.map((t) => ({
        date: t.date,
        miles: Number(t.miles),
        costTreatmentOverride: asTreatment(t.costTreatmentOverride),
      })),
      expenses: expenseRows.map((e) => ({
        date: e.date,
        amountCents: e.amountCents,
        costTreatmentOverride: asTreatment(e.costTreatmentOverride),
        payments: paymentRows
          .filter((p) => p.expenseId === e.id)
          .map((p) => ({
            paidDate: p.paidDate,
            amountCents: p.amountCents,
            isScheduled: p.isScheduled,
          })),
      })),
    },
    year,
    placedInServiceDate,
  );

  return { job, timeEntries: entries, trips: tripRows, expenses: expenseRows, rollup };
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  const data = createJobSchema.parse(input);
  const [row] = await getDb()
    .insert(jobs)
    .values({ title: data.title, propertyId: data.propertyId, notes: data.notes })
    .returning();
  if (!row) throw new Error('The job was not saved.');
  return row;
}

export async function updateJob(
  input: { id: string } & Partial<CreateJobInput>,
): Promise<Job> {
  const data = updateJobSchema.parse(input);
  const existing = await getJob(data.id);

  const [row] = await getDb()
    .update(jobs)
    .set({
      title: data.title ?? existing.title,
      propertyId: data.propertyId === undefined ? existing.propertyId : data.propertyId,
      notes: data.notes === undefined ? existing.notes : data.notes,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, data.id))
    .returning();

  if (!row) throw new NotFoundError('That job no longer exists.');
  return row;
}

/**
 * Deletes the header. The children survive with a null job_id.
 *
 * The foreign keys are ON DELETE SET NULL, so this is what the database does
 * anyway - stated here because "delete the job" must never read as "delete the
 * five records in it".
 */
export async function deleteJob(id: string): Promise<void> {
  const deleted = await getDb().delete(jobs).where(eq(jobs.id, id)).returning({ id: jobs.id });
  if (deleted.length === 0) throw new NotFoundError('That job no longer exists.');
}

/**
 * The "+ Add related" path: find or create the job that a record belongs to.
 *
 * Called with the record the owner is looking at when they tap the button. If
 * that record is already in a job, its job is returned; otherwise one is
 * created from its own description and the record is moved into it. Either way
 * the owner is not asked a question.
 */
export async function jobForRecord(
  kind: 'time' | 'trip' | 'expense',
  recordId: string,
): Promise<Job> {
  return withTransaction(async (tx) => {
    const table = kind === 'time' ? timeEntries : kind === 'trip' ? trips : expenses;

    const [record] = await tx
      .select({
        jobId: table.jobId,
        propertyId: table.propertyId,
        label:
          kind === 'trip'
            ? trips.purpose
            : kind === 'time'
              ? timeEntries.description
              : expenses.vendor,
      })
      .from(table)
      .where(eq(table.id, recordId))
      .limit(1);

    if (!record) throw new NotFoundError('That record no longer exists.');

    if (record.jobId) {
      const [existing] = await tx.select().from(jobs).where(eq(jobs.id, record.jobId)).limit(1);
      if (existing) return existing;
    }

    const [job] = await tx
      .insert(jobs)
      .values({
        title: jobTitleFrom(record.label ?? ''),
        propertyId: record.propertyId,
      })
      .returning();
    if (!job) throw new Error('The job was not created.');

    await tx.update(table).set({ jobId: job.id }).where(eq(table.id, recordId));
    return job;
  });
}

/** The "group these" action: attach existing records to a job, or a new one. */
export async function assignToJob(input: AssignJobInput): Promise<Job> {
  const data = assignJobSchema.parse(input);

  return withTransaction(async (tx) => {
    let jobId = data.jobId;

    if (!jobId) {
      const [created] = await tx
        .insert(jobs)
        .values({ title: data.newJobTitle as string })
        .returning();
      if (!created) throw new Error('The job was not created.');
      jobId = created.id;
    }

    if (data.timeEntryIds.length) {
      await tx
        .update(timeEntries)
        .set({ jobId, updatedAt: new Date() })
        .where(inArray(timeEntries.id, data.timeEntryIds));
    }
    if (data.tripIds.length) {
      await tx
        .update(trips)
        .set({ jobId, updatedAt: new Date() })
        .where(inArray(trips.id, data.tripIds));
    }
    if (data.expenseIds.length) {
      await tx
        .update(expenses)
        .set({ jobId, updatedAt: new Date() })
        .where(inArray(expenses.id, data.expenseIds));
    }

    const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) throw new NotFoundError('That job no longer exists.');
    return job;
  });
}

/** Job ids that no longer have a single child, for the integrity audit. */
export async function childlessJobIds(): Promise<string[]> {
  const rows = await getDb()
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      sql`NOT EXISTS (SELECT 1 FROM ${timeEntries} WHERE ${timeEntries.jobId} = ${jobs.id})
      AND NOT EXISTS (SELECT 1 FROM ${trips}       WHERE ${trips.jobId}       = ${jobs.id})
      AND NOT EXISTS (SELECT 1 FROM ${expenses}    WHERE ${expenses.jobId}    = ${jobs.id})`,
    );
  return rows.map((r) => r.id);
}

/** Job titles keyed by id, for the export columns. */
export async function jobTitlesById(): Promise<Map<string, string>> {
  const rows = await getDb().select({ id: jobs.id, title: jobs.title }).from(jobs);
  return new Map(rows.map((r) => [r.id, r.title]));
}

function asTreatment(value: string | null): 'operating' | 'acquisition' | null {
  return value === 'operating' || value === 'acquisition' ? value : null;
}

/** Re-exported so callers do not need to import from two places. */
export { or };
