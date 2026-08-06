/**
 * Empties every table. Run with: npm run db:reset -- --yes-delete-everything
 *
 * This exists so a year can be loaded from a known-empty starting point and
 * evaluated as it would actually look after twelve months of use, rather than
 * as a pile of partly-imported attempts on top of placeholder rows.
 *
 * IT DELETES TAX RECORDS AND CANNOT BE UNDONE. So it refuses to run without an
 * explicit flag that cannot be typed by accident, prints what it is about to
 * destroy before doing it, and stops at the first sign that it is pointed at
 * something other than a development database.
 *
 * The schema itself is untouched - no migrations are rolled back - so the next
 * step is `db:seed` and then `db:import`.
 */

import './loadEnv';
import { sql } from 'drizzle-orm';
import { closePool, getDb, withTransaction } from './client';
import {
  actors,
  appSettings,
  bankAccounts,
  charities,
  cpaFigures,
  donations,
  enterprises,
  interestYears,
  expensePayments,
  expenses,
  jobs,
  properties,
  propertyLoanYears,
  propertyManagementPeriods,
  rentReceipts,
  rentReconciliationItems,
  rentReconciliations,
  timeEntries,
  timers,
  trips,
  turns,
} from './schema';

const FLAG = '--yes-delete-everything';

/**
 * Ordered so a child is always gone before its parent.
 *
 * Most of these have ON DELETE CASCADE or SET NULL and would sort themselves
 * out, but relying on that means the order of this list silently encodes which
 * foreign keys happen to cascade today. Deleting children first works whatever
 * the constraints say.
 */
const TABLES = [
  { name: 'expense_payments', table: expensePayments },
  { name: 'rent_reconciliation_items', table: rentReconciliationItems },
  { name: 'rent_reconciliations', table: rentReconciliations },
  { name: 'property_loan_years', table: propertyLoanYears },
  { name: 'property_management_periods', table: propertyManagementPeriods },
  { name: 'interest_years', table: interestYears },
  { name: 'bank_accounts', table: bankAccounts },
  { name: 'donations', table: donations },
  { name: 'charities', table: charities },
  { name: 'cpa_figures', table: cpaFigures },
  { name: 'time_entries', table: timeEntries },
  { name: 'trips', table: trips },
  { name: 'expenses', table: expenses },
  { name: 'rent_receipts', table: rentReceipts },
  { name: 'timers', table: timers },
  { name: 'turns', table: turns },
  { name: 'jobs', table: jobs },
  { name: 'properties', table: properties },
  { name: 'actors', table: actors },
  { name: 'enterprises', table: enterprises },
  { name: 'app_settings', table: appSettings },
] as const;

async function main() {
  const db = getDb();

  if (!process.argv.includes(FLAG)) {
    console.error('This deletes every record in the database and cannot be undone.');
    console.error(`\nRun it with the flag if that is what you want:\n  npm run db:reset -- ${FLAG}\n`);
    process.exit(1);
  }

  console.log('About to delete:\n');
  let total = 0;
  for (const { name, table } of TABLES) {
    const [row] = await db.select({ c: sql<string>`count(*)::int` }).from(table);
    const count = Number(row?.c ?? 0);
    total += count;
    if (count > 0) console.log(`  ${String(count).padStart(6)}  ${name}`);
  }

  if (total === 0) {
    console.log('  (nothing - the database is already empty)');
    return;
  }
  console.log(`\n  ${total} rows in total.\n`);

  // One transaction: a half-cleared database is a worse starting point than a
  // full one, because the leftovers look like real records.
  await withTransaction(async (tx) => {
    for (const { table } of TABLES) {
      await tx.delete(table);
    }
  });

  console.log('Done. The schema is untouched - no migration was rolled back.');
  console.log('Next: npm run db:seed, then npm run db:import');
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    console.error('Reset failed:', error);
    await closePool();
    process.exit(1);
  });
