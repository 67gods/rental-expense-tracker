import { asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  assignJobSchema,
  createJobSchema,
  formatCents,
  formatDateShort,
  formatMinutes,
  jobTitleFrom,
  rollUpJob,
  taxYearOf,
  unassignJobSchema,
  updateJobSchema,
  type AssignJobInput,
  type CreateJobInput,
  type JobRollup,
  type UnassignJobInput,
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
      /*
       * Written as literal SQL with explicit aliases, and it has to be.
       *
       * Interpolating the schema objects here - ${timeEntries.jobId} = ${jobs.id} -
       * renders as `WHERE "job_id" = "id"` with no table qualifier on either
       * side. Inside a correlated subquery both names then resolve to the
       * SUBQUERY's table, so it compares time_entries.job_id to
       * time_entries.id: never true, and every job reports zero records
       * forever. It type-checks, it runs, and it is silently wrong.
       */
      recordCount: sql<string>`(
        (SELECT count(*) FROM "time_entries" te WHERE te."job_id" = "jobs"."id")
      + (SELECT count(*) FROM "trips"        tr WHERE tr."job_id" = "jobs"."id")
      + (SELECT count(*) FROM "expenses"     ex WHERE ex."job_id" = "jobs"."id")
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
 * The tolerant lookup the capture forms use for `?job=`.
 *
 * Returns null instead of throwing, for a deliberate reason: a stale or
 * mistyped job id in a link must not stop someone logging an expense. The
 * record still gets written, just without the grouping - and losing a grouping
 * is recoverable where losing the expense is not.
 */
export async function openJob(id: string | undefined | null): Promise<Job | null> {
  if (!id) return null;
  // A malformed id would make Postgres raise on the uuid cast rather than
  // simply not match, so it is refused before the query runs.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const [row] = await getDb().select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return row ?? null;
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

export interface LinkableRecords {
  timeEntries: { id: string; title: string; meta: string }[];
  trips: { id: string; title: string; meta: string }[];
  expenses: { id: string; title: string; meta: string }[];
  /** True when a kind had more rows than the limit, so the UI can say so. */
  truncated: boolean;
}

/**
 * Records that are not in any job yet, for linking one that already exists.
 *
 * DELIBERATELY ONLY THE UNASSIGNED ONES. A record already inside another job
 * could be offered here too, and moving it would silently empty out the job it
 * came from - a grouping the owner made on purpose, removed as a side effect of
 * a checkbox on a different screen. Taking it out of its job first is one extra
 * step and makes the loss visible, which is the right trade for a destructive
 * one.
 *
 * Not filtered to the job's property either. An errand genuinely spans
 * properties - one store run covering two houses is the ordinary case - so the
 * property is shown on each row and the choice is left to the person who was
 * there.
 */
export async function listLinkableRecords(
  options: { limit?: number } = {},
): Promise<LinkableRecords> {
  const db = getDb();
  const limit = options.limit ?? 100;
  // One more than asked for, purely to detect that there were more.
  const probe = limit + 1;

  const [entries, tripRows, expenseRows, propertyRows] = await Promise.all([
    db
      .select()
      .from(timeEntries)
      .where(isNull(timeEntries.jobId))
      .orderBy(desc(timeEntries.date))
      .limit(probe),
    db.select().from(trips).where(isNull(trips.jobId)).orderBy(desc(trips.date)).limit(probe),
    db
      .select()
      .from(expenses)
      .where(isNull(expenses.jobId))
      .orderBy(desc(expenses.date))
      .limit(probe),
    db.select({ id: properties.id, nickname: properties.nickname }).from(properties),
  ]);

  const names = new Map(propertyRows.map((p) => [p.id, p.nickname]));
  const place = (propertyId: string | null) =>
    propertyId ? (names.get(propertyId) ?? 'Unknown property') : 'Portfolio-wide';

  return {
    timeEntries: entries.slice(0, limit).map((e) => ({
      id: e.id,
      title: e.description,
      meta: `${formatDateShort(e.date)} · ${formatMinutes(e.minutes)} · ${place(e.propertyId)}`,
    })),
    trips: tripRows.slice(0, limit).map((t) => ({
      id: t.id,
      title: `${t.origin} → ${t.destination}`,
      meta: `${formatDateShort(t.date)} · ${Number(t.miles)} mi · ${place(t.propertyId)}`,
    })),
    expenses: expenseRows.slice(0, limit).map((e) => ({
      id: e.id,
      title: e.vendor,
      meta: `${formatDateShort(e.date)} · ${formatCents(e.amountCents)} · ${place(e.propertyId)}`,
    })),
    truncated:
      entries.length > limit || tripRows.length > limit || expenseRows.length > limit,
  };
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

/**
 * The reverse of "group these": takes records back out of their job.
 *
 * Only the membership goes. The records themselves are the evidence and are
 * never touched, which is the same promise `deleteJob` makes from the other
 * direction. A job left with no children is reported by the integrity audit
 * rather than cleaned up here - a header the owner named is worth telling them
 * about before it disappears.
 */
export async function unassignFromJob(input: UnassignJobInput): Promise<number> {
  const data = unassignJobSchema.parse(input);
  const total =
    data.timeEntryIds.length + data.tripIds.length + data.expenseIds.length;
  if (total === 0) return 0;

  return withTransaction(async (tx) => {
    const now = new Date();
    if (data.timeEntryIds.length) {
      await tx
        .update(timeEntries)
        .set({ jobId: null, updatedAt: now })
        .where(inArray(timeEntries.id, data.timeEntryIds));
    }
    if (data.tripIds.length) {
      await tx
        .update(trips)
        .set({ jobId: null, updatedAt: now })
        .where(inArray(trips.id, data.tripIds));
    }
    if (data.expenseIds.length) {
      await tx
        .update(expenses)
        .set({ jobId: null, updatedAt: now })
        .where(inArray(expenses.id, data.expenseIds));
    }
    return total;
  });
}

/**
 * Job ids that no longer have a single child, for the integrity audit.
 *
 * Literal SQL for the same reason as `listJobs` above: interpolated schema
 * objects lose their table qualifier inside a correlated subquery. Here the
 * consequence was the opposite and worse - every NOT EXISTS would have been
 * true, so the audit would have reported every job in the database as childless.
 */
export async function childlessJobIds(): Promise<string[]> {
  const rows = await getDb()
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      sql`NOT EXISTS (SELECT 1 FROM "time_entries" te WHERE te."job_id" = "jobs"."id")
      AND NOT EXISTS (SELECT 1 FROM "trips"        tr WHERE tr."job_id" = "jobs"."id")
      AND NOT EXISTS (SELECT 1 FROM "expenses"     ex WHERE ex."job_id" = "jobs"."id")`,
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
