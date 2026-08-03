/**
 * Data integrity audit. Run with: npm run db:check
 *
 * Foreign keys and CHECK constraints stop most bad states at the door. This
 * covers what they cannot: rules that span rows, and the acceptance criteria
 * from §10 that are properties of the data set rather than of any single row.
 *
 * It reports; it never repairs. An automatic fix to a tax record is exactly the
 * kind of silent change that makes a log indefensible.
 */

import './loadEnv';
import { and, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import {
  deriveShEligible,
  evaluateEnterpriseComposition,
  propertyDateProblems,
  RULES_VERSION,
  taxYearOf,
  validateEnterpriseComposition,
} from '@rental/domain';
import { getDb } from './client';
import {
  actors,
  enterprises,
  expenses,
  properties,
  rentReconciliations,
  timeEntries,
  timers,
  trips,
} from './schema';
// Imported rather than reimplemented. Two copies of a query is how the audit
// and the app come to disagree about what the data says - and Phase 9 found a
// correlated subquery in this codebase that type-checked, ran, and was silently
// wrong in both directions. One copy, exercised by both callers.
import { childlessJobIds } from '../server/services/jobs';
import { overlappingManagementPeriods } from '../server/services/reference';
import { unreconciledYears } from '../server/services/reconciliation';

export interface IntegrityFinding {
  severity: 'error' | 'warning' | 'info';
  check: string;
  message: string;
  count: number;
}

export async function runIntegrityChecks(): Promise<IntegrityFinding[]> {
  const db = getDb();
  const findings: IntegrityFinding[] = [];

  // §10: every expense linked to physical work has a classification or sits in
  // needs_review. Unclassified spend on a work category is the same gap.
  const [unclassified] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(expenses)
    .where(
      and(
        isNull(expenses.capitalClassification),
        sql`${expenses.scheduleECategory} IN ('repairs', 'cleaning_maintenance', 'supplies', 'other')`,
      ),
    );
  if ((unclassified?.count ?? 0) > 0) {
    findings.push({
      severity: 'warning',
      check: 'expense_classification',
      count: unclassified?.count ?? 0,
      message:
        'Expenses on physical work with no repair-or-improvement answer. They need one before year end.',
    });
  }

  // §5.2: stored eligibility must match what the rule produces today. A drift
  // here means a code change altered a rule without the rows being re-derived.
  const entries = await db
    .select({
      id: timeEntries.id,
      date: timeEntries.date,
      category: timeEntries.category,
      shEligible: timeEntries.shEligible,
      linkedExpenseId: timeEntries.linkedExpenseId,
    })
    .from(timeEntries)
    .where(isNull(timeEntries.linkedExpenseId));

  let mismatched = 0;
  let unknownCategory = 0;
  for (const entry of entries) {
    try {
      // Re-derived under the rules of the entry's own year. Checking a 2025 row
      // against 2026's rules would report drift that is not drift, and would
      // train the reader to ignore this finding.
      const current = deriveShEligible(
        { category: entry.category },
        taxYearOf(entry.date),
      );
      if (current.shEligible !== entry.shEligible) {
        mismatched += 1;
      }
    } catch {
      unknownCategory += 1;
    }
  }
  if (mismatched > 0) {
    findings.push({
      severity: 'error',
      check: 'eligibility_drift',
      count: mismatched,
      message:
        'Time entries whose stored eligibility disagrees with the current rule. Investigate before relying on the hours total.',
    });
  }
  if (unknownCategory > 0) {
    findings.push({
      severity: 'error',
      check: 'unknown_category',
      count: unknownCategory,
      message:
        'Time entries with a category the app no longer recognises. Their hours cannot be classified.',
    });
  }

  // §5.4: residential and commercial cannot share an enterprise.
  const [allEnterprises, allProperties] = await Promise.all([
    db.select().from(enterprises),
    db.select().from(properties),
  ]);

  const domainProperties = allProperties.map((p) => ({
    id: p.id,
    enterpriseId: p.enterpriseId,
    nickname: p.nickname,
    unadjustedBasisCents: p.unadjustedBasisCents,
    ownershipPct: Number(p.ownershipPct),
    isTripleNet: p.isTripleNet,
    hadPersonalUse: p.hadPersonalUse,
  }));

  for (const enterprise of allEnterprises) {
    const violations = validateEnterpriseComposition(enterprise, domainProperties);
    for (const violation of violations) {
      if (violation.code === 'empty_enterprise') continue; // normal on a fresh install
      findings.push({
        severity: 'error',
        check: 'enterprise_composition',
        count: violation.propertyIds.length,
        message: violation.message,
      });
    }

    const composition = evaluateEnterpriseComposition(enterprise, domainProperties);
    if (composition.excludedPropertyIds.length > 0) {
      findings.push({
        severity: 'info',
        check: 'excluded_properties',
        count: composition.excludedPropertyIds.length,
        message:
          'Properties outside their enterprise this year, from a triple-net lease or personal use. Their hours are logged but do not count toward the target.',
      });
    }
  }

  // §5.5: a trip should have produced the time entries it claims.
  const [orphanTrips] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(trips)
    .where(and(isNull(trips.driveTimeEntryId), isNull(trips.onsiteTimeEntryId)));
  if ((orphanTrips?.count ?? 0) > 0) {
    findings.push({
      severity: 'info',
      check: 'mileage_only_trips',
      count: orphanTrips?.count ?? 0,
      message:
        'Trips recorded as mileage only, with no drive or on-site time. Fine if intentional, but on-site time is usually the part that counts.',
    });
  }

  // Timers left running for more than a day are almost certainly forgotten.
  const [staleTimers] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(timers)
    .where(and(isNull(timers.stoppedAt), sql`${timers.startedAt} < now() - interval '24 hours'`));
  if ((staleTimers?.count ?? 0) > 0) {
    findings.push({
      severity: 'warning',
      check: 'stale_timers',
      count: staleTimers?.count ?? 0,
      message: 'Timers running for over a day. Stop and correct them before they distort the totals.',
    });
  }

  // §5.6: contractor expenses that name no contractor cannot feed the W-9 total.
  const [unattributedContractorSpend] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(expenses)
    .where(
      and(
        isNull(expenses.contractorActorId),
        sql`${expenses.scheduleECategory} IN ('repairs', 'cleaning_maintenance')`,
        sql`${expenses.amountCents} >= 60000`,
      ),
    );
  if ((unattributedContractorSpend?.count ?? 0) > 0) {
    findings.push({
      severity: 'warning',
      check: 'unattributed_contractor_spend',
      count: unattributedContractorSpend?.count ?? 0,
      message:
        'Work expenses of $600 or more with no contractor named. Those payments are not counting toward any W-9 total.',
    });
  }

  // Sanity: at least one person must be able to be attributed work.
  const [people] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(actors)
    .where(sql`${actors.type} IN ('owner', 'spouse')`);
  if ((people?.count ?? 0) === 0) {
    findings.push({
      severity: 'warning',
      check: 'no_people',
      count: 0,
      message: 'No household members recorded yet. Sign in once to create your actor record.',
    });
  }

  const [linkedEntries] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(timeEntries)
    .where(isNotNull(timeEntries.linkedExpenseId));
  findings.push({
    severity: 'info',
    check: 'linked_entries',
    count: linkedEntries?.count ?? 0,
    message: 'Time entries whose eligibility follows an expense classification.',
  });

  findings.push(...(await cashBasisChecks()));
  findings.push(...(await propertyChecks()));
  findings.push(...(await yearEndChecks()));
  findings.push(...(await jobChecks()));
  findings.push(...(await rulesVersionCheck()));

  return findings;
}

/**
 * The payments table has to hold two invariants that no constraint can express:
 * every expense that cost something has a cash event, and the cash events never
 * add up to more than the invoice claimed.
 */
async function cashBasisChecks(): Promise<IntegrityFinding[]> {
  const db = getDb();
  const findings: IntegrityFinding[] = [];

  // A zero-amount expense is exempt on purpose: there was no cash event, and
  // inventing a zero one to satisfy a rule would be a lie in the ledger.
  const [paymentless] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(expenses)
    .where(
      sql`${expenses.amountCents} > 0
        AND NOT EXISTS (
          SELECT 1 FROM "expense_payments" p WHERE p."expense_id" = "expenses"."id"
        )`,
    );
  if ((paymentless?.count ?? 0) > 0) {
    findings.push({
      severity: 'error',
      check: 'paymentless_expenses',
      count: paymentless?.count ?? 0,
      message:
        'Expenses with a cost but no payment row. They read as never paid, which drops them out of every report while still sitting in the ledger.',
    });
  }

  // Correlated on "expenses"."id" written out in full, not interpolated: an
  // unqualified ${expenses.id} inside the subquery would bind to
  // expense_payments.id and quietly compare the wrong two columns.
  const [overpaid] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(expenses)
    .where(
      sql`(
        SELECT COALESCE(sum(p."amount_cents"), 0)
        FROM "expense_payments" p
        WHERE p."expense_id" = "expenses"."id"
      ) > "expenses"."amount_cents"`,
    );
  if ((overpaid?.count ?? 0) > 0) {
    findings.push({
      severity: 'error',
      check: 'payments_over_invoice',
      count: overpaid?.count ?? 0,
      message:
        'Expenses carrying more in payments, settled and scheduled, than the invoice says they are worth. One of the two figures is wrong.',
    });
  }

  return findings;
}

/** Facts about a property that cannot all be true at once. */
async function propertyChecks(): Promise<IntegrityFinding[]> {
  const db = getDb();
  const findings: IntegrityFinding[] = [];

  const rows = await db
    .select({
      id: properties.id,
      nickname: properties.nickname,
      acquiredDate: properties.acquiredDate,
      placedInServiceDate: properties.placedInServiceDate,
      soldDate: properties.soldDate,
      wasPersonalResidence: properties.wasPersonalResidence,
    })
    .from(properties);

  // The same rule the create schema and the update service both ask, asked a
  // third time over what is actually stored - which catches rows that predate
  // the rule or arrived through the import.
  const impossible = rows.flatMap((row) => propertyDateProblems(row));
  if (impossible.length > 0) {
    findings.push({
      severity: 'error',
      check: 'impossible_property_dates',
      count: impossible.length,
      message: `Properties whose dates contradict each other: ${impossible[0]?.message ?? ''}`,
    });
  }

  const missingInService = rows.filter((r) => !r.placedInServiceDate && !r.soldDate).length;
  if (missingInService > 0) {
    findings.push({
      severity: 'warning',
      check: 'no_placed_in_service_date',
      count: missingInService,
      message:
        'Properties with no placed-in-service date. It is where depreciation starts and the line that decides which costs came before the property was earning, so every cost on them is being treated as operating by default.',
    });
  }

  const overlapping = await overlappingManagementPeriods();
  if (overlapping.length > 0) {
    findings.push({
      severity: 'error',
      check: 'overlapping_management_periods',
      count: overlapping.length,
      message:
        'Properties with management periods that overlap. Two managers cannot both have been in charge on the same day, so the history misstates who was.',
    });
  }

  return findings;
}

/** The January sitting, checked from the other side. */
async function yearEndChecks(): Promise<IntegrityFinding[]> {
  const db = getDb();
  const findings: IntegrityFinding[] = [];

  // Every year somebody has started a reconciliation for, rather than a year
  // guessed from today: a 2025 gap left open still matters in 2027.
  const years = await db
    .selectDistinct({ taxYear: rentReconciliations.taxYear })
    .from(rentReconciliations);

  let unreconciled = 0;
  for (const { taxYear } of years) {
    unreconciled += (await unreconciledYears(taxYear)).length;
  }

  if (unreconciled > 0) {
    findings.push({
      severity: 'warning',
      check: 'unreconciled_rent',
      count: unreconciled,
      message:
        'Property-years where the rent banked and the 1099 still do not agree, with the difference unexplained. A year waiting on its form is not counted here - only ones with a figure entered that does not square.',
    });
  }

  return findings;
}

/** A job with nothing in it is a header the owner should be told about. */
async function jobChecks(): Promise<IntegrityFinding[]> {
  const childless = await childlessJobIds();
  if (childless.length === 0) return [];

  return [
    {
      severity: 'warning',
      check: 'childless_jobs',
      count: childless.length,
      // Deliberately not cleaned up automatically. A job is never created
      // empty, so one that is empty now had its records deleted or moved, and
      // quietly removing a header the owner named would hide that.
      message:
        'Jobs with no records left in them. They were emptied by deletions or regrouping, and are safe to remove - nothing is inside them.',
    },
  ];
}

/**
 * Rows judged under a rule set that has since moved.
 *
 * `sh_eligible` is a cache of a derivation, not a fact. The stamp is what makes
 * a stale one detectable rather than believed - which is the whole reason the
 * column exists rather than the derivation simply being trusted.
 */
async function rulesVersionCheck(): Promise<IntegrityFinding[]> {
  const db = getDb();

  const [stale] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(timeEntries)
    .where(ne(timeEntries.rulesVersion, RULES_VERSION));

  const [unstamped] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(timeEntries)
    .where(isNull(timeEntries.rulesVersion));

  const findings: IntegrityFinding[] = [];

  if ((stale?.count ?? 0) > 0) {
    findings.push({
      severity: 'info',
      check: 'stale_rules_version',
      count: stale?.count ?? 0,
      message: `Time entries whose eligibility was derived under a rule set older than ${RULES_VERSION}. Not wrong - they were right when written - but re-derive before relying on the totals if a rule has changed since.`,
    });
  }

  if ((unstamped?.count ?? 0) > 0) {
    findings.push({
      severity: 'warning',
      check: 'unstamped_eligibility',
      count: unstamped?.count ?? 0,
      message:
        'Time entries with no rules version recorded. Their eligibility cannot be tied to any rule set, so there is no way to tell whether it is current.',
    });
  }

  return findings;
}

async function main() {
  const findings = await runIntegrityChecks();

  if (findings.length === 0) {
    console.log('No issues found.');
    return;
  }

  for (const finding of findings) {
    const marker =
      finding.severity === 'error' ? 'ERROR' : finding.severity === 'warning' ? 'WARN ' : 'INFO ';
    console.log(`${marker} [${finding.check}] ${finding.count} — ${finding.message}`);
  }

  const errors = findings.filter((f) => f.severity === 'error').length;
  if (errors > 0) {
    console.error(`\n${errors} check(s) need attention. Nothing was changed.`);
    process.exitCode = 1;
  }
}

// Only runs when invoked directly, so the checks can also be imported by the
// settings page without executing.
if (process.argv[1]?.includes('integrity')) {
  main().catch((error: unknown) => {
    console.error('Integrity check failed to run:', error);
    process.exit(1);
  });
}
