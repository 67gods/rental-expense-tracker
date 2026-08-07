/**
 * The portfolio-wide costs the 2025 workbook import left undivided.
 * Run with: npx tsx src/db/fix-shared-splits.ts
 *
 * An expense with neither a property nor an allocation rule is a REAL state
 * (§6) - "paid, not yet decided how to divide" - and `needsPropertyOrSplit`
 * keeps it off Schedule E on purpose, because the return is filed per property
 * and the app will not guess which one. The cost of that correctness is that
 * such a row is in NO figure on the overview: not in shared, not in operating,
 * not in line 20. It sits in the review list and nowhere else.
 *
 * Three rows were sitting there, and the largest was not small:
 *
 *   Home Office  $929.50  185.9 sq ft at the IRS simplified $5.00 rate
 *   Anthropic      $5.00  paid August 2026, so it would have done the same
 *                         thing to next year's page
 *   Claude         $0.00  no amount and no payment - the import's own note
 *                         said fill it in or delete it
 *
 * The first two get the SAME equal-across-four rule the other shared rows
 * already carry, so every portfolio-wide cost in the ledger is divided the one
 * way and the shared row can be explained in a sentence. Tin Roof is left out
 * of it - no acquired date, no activity, nothing to carry a share of.
 *
 * Two things this script does NOT decide, both deliberately:
 *
 *   - Whether a home office belongs on Schedule E at all. That turns on the
 *     rental rising to a trade or business, which is the CPA's call. This only
 *     puts the figure where it can be seen and argued about.
 *   - Creedmore closed 2025-11-17 and still takes a full quarter share of
 *     year-long costs. An even split is what the import chose and what the
 *     other shared rows use; prorating one row and not the others would be
 *     worse than either answer applied consistently.
 *
 * Idempotent: the rule is written by vendor and re-writing it is a no-op, and
 * the delete is keyed on a row that will not be there the second time.
 */

import './loadEnv';
import { and, eq, isNull } from 'drizzle-orm';
import { closePool, getDb } from './client';
import { expenses, properties } from './schema';

/** Everything that carries a share. Tin Roof has no activity to carry one. */
const SHARING = ['Kettlewell', 'Westmill', 'Arbordale way', 'Creedmore ct'];

/** Vendors to split equally across those four. */
const TO_SPLIT = ['Home Office', 'Anthropic'];

/** Vendors to remove: no amount, no payment, nothing to divide. */
const TO_DELETE = ['Claude'];

async function main() {
  const db = getDb();

  const props = await db.select().from(properties);
  const byNickname = new Map(props.map((p) => [p.nickname, p]));

  const propertyIds = SHARING.map((nickname) => {
    const property = byNickname.get(nickname);
    if (!property) throw new Error(`No property nicknamed "${nickname}".`);
    return property.id;
  });

  const rule = { type: 'equal' as const, propertyIds };

  // --- The splits ----------------------------------------------------------

  for (const vendor of TO_SPLIT) {
    // Only the undivided ones. A row that already has a property or a rule has
    // been decided by hand and is not this script's to overwrite.
    const updated = await db
      .update(expenses)
      .set({ allocationRule: rule, updatedAt: new Date() })
      .where(
        and(
          eq(expenses.vendor, vendor),
          isNull(expenses.propertyId),
          isNull(expenses.allocationRule),
        ),
      )
      .returning({ id: expenses.id, amountCents: expenses.amountCents });

    for (const row of updated) {
      console.log(
        `split  ${vendor} ${(row.amountCents / 100).toFixed(2)} equally across ${SHARING.length}`,
      );
    }
    if (updated.length === 0) console.log(`split  ${vendor} - already decided, left alone`);
  }

  // --- The empty row -------------------------------------------------------

  for (const vendor of TO_DELETE) {
    // Guarded on the amount, so this can never take a real expense with the
    // same vendor name that someone enters later. Payments cascade.
    const deleted = await db
      .delete(expenses)
      .where(and(eq(expenses.vendor, vendor), eq(expenses.amountCents, 0)))
      .returning({ id: expenses.id });

    console.log(
      deleted.length > 0
        ? `delete ${vendor} - ${deleted.length} row with no amount`
        : `delete ${vendor} - nothing to remove`,
    );
  }

  // --- What is left undivided ----------------------------------------------

  const remaining = await db
    .select({ vendor: expenses.vendor, amountCents: expenses.amountCents, date: expenses.date })
    .from(expenses)
    .where(and(isNull(expenses.propertyId), isNull(expenses.allocationRule)));

  console.log(
    remaining.length === 0
      ? '\nNothing left with no property and no split.'
      : `\nStill undivided, and so on no Schedule E:\n${remaining
          .map((r) => `  ${r.date} ${r.vendor} ${(r.amountCents / 100).toFixed(2)}`)
          .join('\n')}`,
  );

  await closePool();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
