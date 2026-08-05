import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { addDays } from '@rental/domain';
import { getDb } from '@/db/client';
import { expenses } from '@/db/schema';

/**
 * Noticing that a receipt is already on file.
 *
 * The failure this prevents is mundane and expensive: the same purchase logged
 * twice, once at the counter and once when the photo turns up in the camera
 * roll a week later. It inflates a Schedule E line by exactly one receipt, and
 * nothing about either row looks wrong on its own.
 *
 * Two questions get asked, in order, because they have different costs and
 * different certainties:
 *
 *   1. IS THIS THE SAME FILE? A byte-for-byte hash match is not a guess, and it
 *      is answered before any model is called - so the common case of the same
 *      photo twice is both certain and free.
 *   2. IS THIS THE SAME PURCHASE? Only answerable from the figures once they
 *      have been read, and only ever a suspicion: two $40 fill-ups at the same
 *      station in one week are a real pair of expenses, not a mistake.
 *
 * Neither result is acted on automatically. The caller warns; the person
 * decides.
 */

export interface DuplicateMatch {
  id: string;
  date: string;
  vendor: string;
  amountCents: number;
  propertyId: string | null;
  /** `exact` is a hash match. `likely` is a figures match, which can be wrong. */
  kind: 'exact' | 'likely';
}

/**
 * The same bytes, already attached to an expense.
 *
 * Only finds receipts uploaded after the hash column existed. An older receipt
 * re-photographed still gets caught by the figures match below, which is the
 * check that was always going to do the work for those.
 */
export async function findExactDuplicate(
  sha256: string,
  /**
   * Excluded from the search, for the same reason the figures match takes one.
   *
   * Re-attaching a receipt to the expense it is already on is the ordinary way
   * to replace a bad scan, and without this it reports the expense as its own
   * duplicate - a warning that is both alarming and impossible to act on.
   */
  excludeExpenseId: string | null = null,
): Promise<DuplicateMatch | null> {
  const db = getDb();

  const rows = await db
    .select({
      id: expenses.id,
      date: expenses.date,
      vendor: expenses.vendor,
      amountCents: expenses.amountCents,
      propertyId: expenses.propertyId,
    })
    .from(expenses)
    .where(eq(expenses.receiptSha256, sha256))
    .orderBy(desc(expenses.createdAt))
    .limit(2);

  const row = rows.find((candidate) => candidate.id !== excludeExpenseId);
  return row ? { ...row, kind: 'exact' } : null;
}

/**
 * An expense that looks like this receipt already recorded.
 *
 * The total has to match to the cent - it is the one figure on a receipt that
 * is both precise and unlikely to coincide - and the date has to be close
 * rather than equal, because the date typed at the counter and the date printed
 * on the receipt disagree often enough to matter.
 */
export async function findLikelyDuplicate(input: {
  amountCents: number;
  date: string;
  vendor: string;
  propertyId: string | null;
  /** Excluded from the search. Set when re-reading a receipt while editing. */
  excludeExpenseId?: string | null;
}): Promise<DuplicateMatch | null> {
  // A zero-amount expense has no distinguishing total, so the match would be
  // on the date alone. That is not evidence of anything.
  if (input.amountCents <= 0) return null;

  const db = getDb();

  const rows = await db
    .select({
      id: expenses.id,
      date: expenses.date,
      vendor: expenses.vendor,
      amountCents: expenses.amountCents,
      propertyId: expenses.propertyId,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.amountCents, input.amountCents),
        gte(expenses.date, addDays(input.date, -3)),
        lte(expenses.date, addDays(input.date, 3)),
      ),
    )
    .orderBy(desc(expenses.date))
    .limit(20);

  const wanted = slugifyVendor(input.vendor);

  const candidates = rows
    .filter((row) => row.id !== input.excludeExpenseId)
    .map((row) => ({ row, score: score(row, wanted, input) }))
    // A same-total, same-week expense from a plainly different vendor is a
    // coincidence, not a duplicate. Requiring the names to relate is what keeps
    // the warning worth reading.
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  return best ? { ...best.row, kind: 'likely' } : null;
}

function score(
  row: { vendor: string; date: string; propertyId: string | null },
  wantedVendor: string,
  input: { date: string; propertyId: string | null },
): number {
  const vendor = slugifyVendor(row.vendor);
  if (!vendorsRelate(vendor, wantedVendor)) return 0;

  let score = vendor === wantedVendor ? 10 : 5;
  if (row.date === input.date) score += 3;
  if (row.propertyId === input.propertyId) score += 2;
  return score;
}

/**
 * "Home Depot" and "The Home Depot #6112" are the same shop.
 *
 * Prefix containment rather than an edit distance: the way these two names
 * actually differ is a store number or an article bolted onto one end, not
 * characters transposed in the middle.
 */
function vendorsRelate(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  // Guard against a two-letter stub matching half the ledger.
  if (a.length < 4 || b.length < 4) return false;
  return a.startsWith(b) || b.startsWith(a) || a.includes(b) || b.includes(a);
}

/**
 * A vendor name reduced to something comparable.
 *
 * Shared with the receipt download filename, which needs the same reduction for
 * a different reason - see receipts.ts.
 */
export function slugifyVendor(vendor: string, max = 60): string {
  return (
    vendor
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, max) || ''
  );
}
