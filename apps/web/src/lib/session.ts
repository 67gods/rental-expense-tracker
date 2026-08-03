import { cache } from 'react';
import { eq, sql } from 'drizzle-orm';
import { currentTaxYear } from '@rental/domain';
import { getDb } from '@/db/client';
import { actors, enterprises, type Actor, type Enterprise } from '@/db/schema';
import { env } from '@/env';
import { latestYearWithData } from '@/server/services/navigation';
import { auth } from './auth';

/**
 * Resolves the signed-in Google account to an `actors` row.
 *
 * Actors and users are deliberately not the same thing. Contractors and
 * property managers are actors who can have hours logged against them (§4) but
 * never sign in, so the auth identity is a property of some actors rather than
 * the other way round.
 */

export interface CurrentUser {
  actor: Actor;
  enterprise: Enterprise;
  email: string;
  taxYear: number;
  timeZone: string;
}

/**
 * Cached per request. Several server components on one page each need the
 * current actor, and they should not each hit the database for it.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  const subject = session?.user?.id;

  if (!email || !env.allowedEmails.includes(email)) return null;

  const db = getDb();
  const actor = await resolveActor(db, {
    email,
    subject: subject ?? null,
    name: session?.user?.name ?? email,
  });
  const enterprise = await ensureDefaultEnterprise(db);

  // Open on the newest year that holds records rather than on today's year.
  // Never later than the current one: a single backdated 2027 row must not
  // drag the whole app into the future.
  const thisYear = currentTaxYear(env.timeZone);
  const latest = await latestYearWithData();

  return {
    actor,
    enterprise,
    email,
    taxYear: latest === null ? thisYear : Math.min(latest, thisYear),
    timeZone: env.timeZone,
  };
});

/** For pages and actions that cannot run without an identity. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new UnauthorizedError('You need to be signed in to do that.');
  }
  return user;
}

export class UnauthorizedError extends Error {
  override readonly name = 'UnauthorizedError';
}

async function resolveActor(
  db: ReturnType<typeof getDb>,
  input: { email: string; subject: string | null; name: string },
): Promise<Actor> {
  // Match on the Google subject first: it is stable even if the person changes
  // the display name or address on their Google account.
  if (input.subject) {
    const [bySubject] = await db
      .select()
      .from(actors)
      .where(eq(actors.authSubject, input.subject))
      .limit(1);
    if (bySubject) return bySubject;
  }

  // First sign-in, or an actor seeded ahead of time with the email filled in.
  // The conflict target handles two tabs racing on the very first sign-in.
  const [existing] = await db
    .select()
    .from(actors)
    .where(eq(actors.email, input.email))
    .limit(1);

  if (existing) {
    if (input.subject && existing.authSubject !== input.subject) {
      const [linked] = await db
        .update(actors)
        .set({ authSubject: input.subject, updatedAt: new Date() })
        .where(eq(actors.id, existing.id))
        .returning();
      if (linked) return linked;
    }
    return existing;
  }

  // Nobody matches, so this is one of the two household members arriving for
  // the first time. The first becomes owner, the second spouse; both are
  // editable in settings, and the distinction matters because some tests count
  // only one spouse's hours (§4).
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(actors)
    .where(sql`${actors.type} IN ('owner', 'spouse')`);

  const [created] = await db
    .insert(actors)
    .values({
      name: input.name,
      type: (count ?? 0) === 0 ? 'owner' : 'spouse',
      email: input.email,
      authSubject: input.subject,
    })
    .onConflictDoUpdate({
      target: actors.email,
      set: { authSubject: input.subject },
    })
    .returning();

  if (!created) {
    throw new Error(`Could not create or link an actor record for ${input.email}.`);
  }
  return created;
}

/**
 * The default residential enterprise (§5.4: all five properties in one
 * residential enterprise, changeable). Created on first use so a fresh install
 * has somewhere to hang properties without a setup wizard.
 */
async function ensureDefaultEnterprise(
  db: ReturnType<typeof getDb>,
): Promise<Enterprise> {
  const [existing] = await db.select().from(enterprises).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(enterprises)
    .values({
      name: 'Residential portfolio',
      propertyType: 'residential',
      taxYearActive: currentTaxYear(env.timeZone),
    })
    .returning();

  if (!created) throw new Error('Could not create the default enterprise.');
  return created;
}
