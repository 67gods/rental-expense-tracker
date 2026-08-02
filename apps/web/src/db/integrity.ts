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
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  deriveShEligible,
  evaluateEnterpriseComposition,
  validateEnterpriseComposition,
} from '@rental/domain';
import { getDb } from './client';
import {
  actors,
  enterprises,
  expenses,
  properties,
  timeEntries,
  timers,
  trips,
} from './schema';

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
      if (deriveShEligible({ category: entry.category }).shEligible !== entry.shEligible) {
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
