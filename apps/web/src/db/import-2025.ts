/**
 * Imports the 2025 hand-off payload. Run with: npm run db:import
 *
 * 2025 arrives as a LIVE, EDITABLE WORKING YEAR, not an archive. The point is
 * to have a full year loaded so the gaps show - the hours nobody logged, the
 * receipts nobody kept, the dates nobody wrote down - and then to fix them in
 * place. Everything imported can be edited afterwards like anything else.
 *
 * Back-filled records are flagged `is_backdated`, and that is correct rather
 * than unfortunate. A 2025 expense entered in 2026 IS a reconstruction, and
 * `created_at` is contemporaneity evidence that the client is never allowed to
 * set. A reconstructed log and a contemporaneous one are different evidence and
 * the difference has to survive.
 *
 * Idempotent: it records what it did in `app_settings` and refuses to run twice
 * without --force. Running it twice by accident would double a year's expenses,
 * which is the kind of error that is hard to see and harder to unpick.
 *
 * SECURITY. The payload carries names, addresses, dates and amounts. It carries
 * no SSN, no DOB, no bank or loan account numbers and no TINs. This script
 * verifies that before writing anything - the check is cheap and the file
 * crossed a repo boundary to get here.
 */

import './loadEnv';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { isScheduleECategoryId, taxYearRange } from '@rental/domain';
import { closePool, getDb, withTransaction, type TxDb } from './client';
import {
  actors,
  appSettings,
  enterprises,
  expensePayments,
  expenses,
  properties,
  propertyLoanYears,
  propertyManagementPeriods,
  rentReceipts,
  rentReconciliationItems,
  rentReconciliations,
  trips,
} from './schema';

const IMPORT_KEY = 'import:rental-import-2025';

// --- The payload shape ------------------------------------------------------

interface Payload {
  meta: { taxYear: number; generatedAt: string; source: string; contains: string };
  properties: PayloadProperty[];
  loanYears: PayloadLoanYear[];
  expenses: PayloadExpense[];
  payments: PayloadPaymentPlan[];
  rentReceipts: PayloadRentReceipt[];
  reconciliations: PayloadReconciliation[];
  mileage?: PayloadMileage[];
}

interface PayloadProperty {
  key: string;
  nickname: string;
  address: string;
  acquiredDate: string | null;
  purchasePriceCents: number | null;
  closingCostsCents: number | null;
  placedInServiceDate: string | null;
  placedInServiceEvidence: string | null;
  wasPersonalResidence: boolean;
  isSelfManaged: boolean;
  managedByName: string | null;
  managementNote: string | null;
  marketValueCents: number | null;
  section469Activity: string | null;
}

interface PayloadLoanYear {
  propertyKey: string;
  lenderName: string;
  interestCents: number | null;
  propertyTaxCents: number | null;
  propertyTaxSource: string | null;
  insurancePaidFromEscrowCents: number | null;
  insuranceSource: string | null;
  originationDate: string | null;
  interestRatePct: number | null;
  documentNote: string | null;
}

interface PayloadExpense {
  date: string;
  vendor: string;
  propertyKey: string | null;
  /** Null where the workbook recorded the expense but never priced it. */
  amountCents: number | null;
  scheduleECategory: string;
  capitalClassification: string | null;
  costTreatmentOverride: string | null;
  notes: string | null;
  sourceRow: number;
}

interface PayloadPaymentPlan {
  matchVendorLike: string;
  /** The date on the ledger row, so a repeat vendor+amount cannot mismatch. */
  matchDate?: string;
  /** What the LEDGER says - which is what was paid, not what was owed. */
  matchAmountCents: number;
  /** What the INVOICE says. The ledger never carried this figure. */
  invoiceTotalCents: number;
  note: string;
  rows: { paidDate: string; amountCents: number; isScheduled: boolean }[];
}

/** A year total, not a journey. The individual trips were never logged. */
interface PayloadMileage {
  propertyKey: string | null;
  miles: number;
  valueCents: number;
  treatment: string;
  detail: string | null;
  note: string | null;
}

interface PayloadRentReceipt {
  date: string;
  propertyKey: string;
  amountCents: number;
  source: string;
  notes: string | null;
}

interface PayloadReconciliation {
  propertyKey: string;
  reportedGrossCents: number | null;
  payerName: string | null;
  documentNote: string | null;
  items: { kind: string; amountCents: number; note: string | null }[];
}

// --- The security check, before anything is written -------------------------

/**
 * Refuses a payload carrying anything it should not.
 *
 * The exporter already scans on the way out. This scans on the way in, because
 * the file crossed a repo boundary and the two checks are cheap. A file that
 * was hand-edited between the two would be caught here and nowhere else.
 */
function assertNoIdentifiers(raw: string): void {
  const rules: { name: string; pattern: RegExp }[] = [
    { name: 'SSN or ITIN', pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
    { name: 'EIN', pattern: /\b\d{2}-\d{7}\b/ },
    { name: 'long digit run in text', pattern: /\d{7,}/ },
    { name: 'bank reference', pattern: /\bref\s*#/i },
    { name: 'masked account tail', pattern: /(x{3,}|\*{3,}|ending in\s*)\d{3,}/i },
  ];

  // String values only. Amounts are in cents and are allowed, so a property
  // worth over a million dollars is a nine-digit integer that a whole-file
  // scan would report as an account number.
  const text = [...raw.matchAll(/(?<!\\)"((?:[^"\\]|\\.)*)"\s*(?=[,}\]\r\n])/g)]
    .map((m) => m[1])
    .join('\n');

  const hits = rules.filter((rule) => rule.pattern.test(text));
  if (hits.length > 0) {
    throw new Error(
      `The payload contains something it must not: ${hits.map((h) => h.name).join(', ')}. ` +
        'Nothing was imported. Regenerate it with scripts/export-to-rental.ps1.',
    );
  }
}

// --- Import -----------------------------------------------------------------

export interface ImportResult {
  properties: number;
  managementPeriods: number;
  loanYears: number;
  expenses: number;
  payments: number;
  rentReceipts: number;
  trips: number;
  reconciliations: number;
  reconciliationItems: number;
  skipped: string[];
}

/**
 * The whole import, in ONE transaction.
 *
 * This was not the first design and the first one was wrong. The idempotency
 * stamp is written at the end, so a run that failed part-way left the rows it
 * had already written and no stamp - and the next run, seeing no stamp,
 * imported everything again. Two failed runs during development produced three
 * copies of every expense before anyone looked.
 *
 * A partial import is worse than no import: the duplicates are individually
 * plausible, so nothing about the data looks wrong. Either the whole year lands
 * or none of it does.
 */
async function importPayload(payload: Payload, force: boolean): Promise<ImportResult> {
  const preflight = getDb();
  const taxYear = payload.meta.taxYear;

  const [already] = await preflight
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, IMPORT_KEY))
    .limit(1);

  if (already && !force) {
    throw new Error(
      `This payload was already imported (${JSON.stringify(already.value)}). ` +
        'Running it again would double a year of expenses. Pass --force if you really mean to.',
    );
  }

  return withTransaction((db) => runImport(db, payload, taxYear));
}

async function runImport(
  db: TxDb,
  payload: Payload,
  taxYear: number,
): Promise<ImportResult> {
  const [enterprise] = await db.select().from(enterprises).limit(1);
  if (!enterprise) {
    throw new Error('No enterprise on file. Run npm run db:seed first.');
  }

  const result: ImportResult = {
    properties: 0,
    managementPeriods: 0,
    loanYears: 0,
    expenses: 0,
    payments: 0,
    rentReceipts: 0,
    trips: 0,
    reconciliations: 0,
    reconciliationItems: 0,
    skipped: [],
  };

  // The one owner record everything is attributed to. Hours are per person and
  // cannot be pooled, so a reconstructed year is attributed to whoever the
  // household's first actor is rather than being spread by guesswork.
  const [owner] = await db
    .select()
    .from(actors)
    .where(sql`${actors.type} IN ('owner', 'spouse')`)
    .limit(1);
  if (!owner) throw new Error('No owner actor on file. Sign in once, or run npm run db:seed.');

  // --- Properties, matched on nickname so a re-run updates rather than doubles
  const propertyIdByKey = new Map<string, string>();

  for (const p of payload.properties) {
    const [existing] = await db
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.nickname, p.nickname))
      .limit(1);

    const values = {
      enterpriseId: enterprise.id,
      nickname: p.nickname,
      address: p.address,
      acquiredDate: p.acquiredDate,
      placedInServiceDate: p.placedInServiceDate,
      placedInServiceEvidence: p.placedInServiceEvidence as null,
      purchasePriceCents: p.purchasePriceCents,
      closingCostsCents: p.closingCostsCents,
      wasPersonalResidence: p.wasPersonalResidence,
      isSelfManaged: p.isSelfManaged,
      section469Activity: p.section469Activity,
    };

    let propertyId: string;
    if (existing) {
      await db.update(properties).set({ ...values, updatedAt: new Date() }).where(eq(properties.id, existing.id));
      propertyId = existing.id;
    } else {
      const [row] = await db.insert(properties).values(values).returning({ id: properties.id });
      propertyId = row!.id;
    }
    propertyIdByKey.set(p.key, propertyId);
    result.properties += 1;

    // The manager, as an actor and an open period. The workbook records the
    // arrangement as prose ("JKN Realty until ~2025-03, then self-managed"),
    // which this script does not try to parse into a period history - it opens
    // the CURRENT arrangement and keeps the prose as a note for the owner to
    // correct on the property page.
    if (p.managedByName) {
      const managerId = await ensureActor(db, p.managedByName, 'pm');
      const [open] = await db
        .select({ id: propertyManagementPeriods.id })
        .from(propertyManagementPeriods)
        .where(
          and(
            eq(propertyManagementPeriods.propertyId, propertyId),
            sql`${propertyManagementPeriods.endDate} IS NULL`,
          ),
        )
        .limit(1);

      if (!open) {
        await db.insert(propertyManagementPeriods).values({
          propertyId,
          managerActorId: managerId,
          startDate: p.acquiredDate ?? `${taxYear}-01-01`,
          notes: p.managementNote,
        });
        result.managementPeriods += 1;
      }
    }
  }

  // --- Loan years, upserted on (property, year, lender)
  for (const l of payload.loanYears) {
    const propertyId = propertyIdByKey.get(l.propertyKey);
    if (!propertyId) {
      result.skipped.push(`loan year for unknown property "${l.propertyKey}"`);
      continue;
    }

    const values = {
      propertyId,
      taxYear,
      lenderName: l.lenderName,
      interestCents: l.interestCents,
      propertyTaxCents: l.propertyTaxCents,
      propertyTaxSource: l.propertyTaxSource as null,
      insurancePaidFromEscrowCents: l.insurancePaidFromEscrowCents,
      insuranceSource: l.insuranceSource as null,
      originationDate: l.originationDate,
      interestRatePct: l.interestRatePct === null ? null : String(l.interestRatePct),
      documentNote: l.documentNote,
    };

    await db
      .insert(propertyLoanYears)
      .values(values)
      .onConflictDoUpdate({
        target: [propertyLoanYears.propertyId, propertyLoanYears.taxYear, propertyLoanYears.lenderName],
        set: { ...values, updatedAt: new Date() },
      });
    result.loanYears += 1;
  }

  // --- Expenses, each with its identity payment row in one transaction
  //
  // Written directly rather than through createExpense() on purpose: the
  // service stamps is_backdated from the clock, and every row here is a
  // reconstruction that must be marked as one regardless of when it is run.
  const expenseIdByRow = new Map<number, string>();

  const allPropertyIds = [...propertyIdByKey.values()];

  for (const e of payload.expenses) {
    const propertyId = e.propertyKey ? (propertyIdByKey.get(e.propertyKey) ?? null) : null;
    if (e.propertyKey && !propertyId) {
      result.skipped.push(`expense row ${e.sourceRow} for unknown property "${e.propertyKey}"`);
      continue;
    }

    // An expense belongs to a property, or it says how it is shared. Neither is
    // not a valid state, and the database enforces that.
    //
    // The workbook has three portfolio overheads with no split decided - cloud
    // storage, a subscription, the mileage for a shared purchase. They get an
    // explicit equal split rather than being dropped, because $37 of real spend
    // is worth more than a tidy import, and the note says the split is a
    // placeholder so the owner can change it to whatever they actually intend.
    let allocationRule: Record<string, unknown> | null = null;
    let notes = e.notes;
    if (!propertyId) {
      if (allPropertyIds.length === 0) {
        result.skipped.push(`expense row ${e.sourceRow}: portfolio-wide but no properties exist`);
        continue;
      }
      allocationRule = { type: 'equal', propertyIds: allPropertyIds };
      notes = [
        notes,
        'The workbook recorded this as portfolio-wide with no split decided. Split equally across every property as a placeholder - change it if that is not what you intend.',
      ]
        .filter(Boolean)
        .join(' ');
    }

    // The workbook has one row recorded with no amount yet. It comes across as
    // zero rather than being dropped, because a zero-amount expense is a state
    // the app already handles deliberately - it gets no payment row and the
    // integrity audit exempts it - and an expense the owner remembered but
    // never priced is exactly the kind of gap 2025 is loaded to expose.
    let amountCents = e.amountCents;
    if (amountCents === null || amountCents === undefined) {
      amountCents = 0;
      notes = [notes, 'No amount was recorded for this in the workbook. Fill it in or delete it.']
        .filter(Boolean)
        .join(' ');
    }

    const category = isScheduleECategoryId(e.scheduleECategory) ? e.scheduleECategory : 'other';

    // No nested transaction: the whole import is already inside one.
    const expenseId = await (async () => {
      const [row] = await db
        .insert(expenses)
        .values({
          date: e.date,
          actorId: owner.id,
          propertyId,
          amountCents,
          vendor: e.vendor,
          scheduleECategory: category,
          capitalClassification: e.capitalClassification as null,
          costTreatmentOverride: e.costTreatmentOverride,
          allocationRule,
          notes,
          // Honest, and the whole point. This year was reconstructed from a
          // workbook, not logged as it happened, and the record says so.
          isBackdated: true,
        })
        .returning({ id: expenses.id });

      if (amountCents > 0) {
        await db.insert(expensePayments).values({
          expenseId: row!.id,
          paidDate: e.date,
          amountCents,
          isScheduled: false,
        });
      }
      return row!.id;
    })();

    expenseIdByRow.set(e.sourceRow, expenseId);
    result.expenses += 1;
  }

  // --- The invoice that straddles the year boundary
  //
  // The ledger row is what was PAID in 2025 - $2,500 - and the $8,244 invoice
  // total appears nowhere in it, because a workbook that records payments has
  // no way to say what was owed. So the row is raised to the real invoice
  // total, the $2,500 stays as the settled payment, and the balance goes in as
  // scheduled rows that reach no export until the money actually moves.
  //
  // This is the single row in the whole import that the payments table was
  // built for, and importing it at face value would have put $2,500 into 2025
  // as a complete expense and lost $5,750 entirely.
  for (const plan of payload.payments) {
    const match = payload.expenses.find(
      (e) =>
        e.vendor.includes(plan.matchVendorLike) &&
        e.amountCents === plan.matchAmountCents &&
        (!plan.matchDate || e.date === plan.matchDate),
    );
    if (!match) {
      result.skipped.push(
        `payment plan for "${plan.matchVendorLike}" ${plan.matchAmountCents} - no matching expense`,
      );
      continue;
    }
    const expenseId = expenseIdByRow.get(match.sourceRow);
    if (!expenseId) continue;

    await db
      .update(expenses)
      .set({
        amountCents: plan.invoiceTotalCents,
        notes: [match.notes, plan.note].filter(Boolean).join(' '),
        updatedAt: new Date(),
      })
      .where(eq(expenses.id, expenseId));

    await db.delete(expensePayments).where(eq(expensePayments.expenseId, expenseId));
    for (const row of plan.rows) {
      await db.insert(expensePayments).values({
        expenseId,
        paidDate: row.paidDate,
        amountCents: row.amountCents,
        isScheduled: row.isScheduled,
        notes: plan.note,
      });
    }
    result.payments += plan.rows.length;
  }

  // --- Mileage
  //
  // One trip row per bucket, so the miles are visible at all. The dollar value
  // already came across as an expense on the ledger; this is the mileage LOG,
  // which is what a CPA asks for and what the workbook could not produce.
  //
  // Written straight rather than through createTrip(), because that builds the
  // linked drive and on-site time entries from a real journey's minutes. There
  // are no minutes here and inventing them would be fiction.
  for (const m of payload.mileage ?? []) {
    const propertyId = m.propertyKey ? (propertyIdByKey.get(m.propertyKey) ?? null) : null;
    if (m.miles <= 0) continue;

    await db.insert(trips).values({
      date: `${taxYear}-12-31`,
      actorId: owner.id,
      propertyId,
      origin: 'Various',
      destination: 'Various',
      destinationKind: 'other',
      miles: String(m.miles),
      // A trip has no notes column, and the business purpose is the right home
      // for this anyway: it is the field a CPA reads to judge whether the
      // mileage stands up, so saying plainly that it is a year total belongs
      // there rather than in a footnote.
      purpose: m.detail
        ? `${taxYear} mileage total (${m.detail}) - aggregated from the MileIQ log, not a single journey`
        : `${taxYear} mileage total - aggregated from the MileIQ log, not a single journey`,
      costTreatmentOverride: m.treatment === 'acquisition' ? 'acquisition' : null,
      source: 'manual',
      isBackdated: true,
    });
    result.trips += 1;
  }

  // --- Rent received
  for (const r of payload.rentReceipts) {
    const propertyId = propertyIdByKey.get(r.propertyKey);
    if (!propertyId) {
      result.skipped.push(`rent receipt for unknown property "${r.propertyKey}"`);
      continue;
    }
    await db.insert(rentReceipts).values({
      date: r.date,
      actorId: owner.id,
      propertyId,
      amountCents: r.amountCents,
      source: r.source as 'property_manager',
      notes: r.notes,
      isBackdated: true,
    });
    result.rentReceipts += 1;
  }

  // --- Rent banked against the 1099
  for (const rec of payload.reconciliations) {
    const propertyId = propertyIdByKey.get(rec.propertyKey);
    if (!propertyId) {
      result.skipped.push(`reconciliation for unknown property "${rec.propertyKey}"`);
      continue;
    }

    const payerActorId = rec.payerName ? await ensureActor(db, rec.payerName, 'pm') : null;
    const values = {
      propertyId,
      taxYear,
      payerActorId,
      reportedGrossCents: rec.reportedGrossCents,
      documentNote: rec.documentNote,
    };

    const [header] = await db
      .insert(rentReconciliations)
      .values(values)
      .onConflictDoUpdate({
        target: [rentReconciliations.propertyId, rentReconciliations.taxYear],
        set: { ...values, updatedAt: new Date() },
      })
      .returning({ id: rentReconciliations.id });
    result.reconciliations += 1;

    await db
      .delete(rentReconciliationItems)
      .where(eq(rentReconciliationItems.reconciliationId, header!.id));

    for (const item of rec.items) {
      await db.insert(rentReconciliationItems).values({
        reconciliationId: header!.id,
        kind: item.kind as 'management_fee_withheld',
        amountCents: item.amountCents,
        note: item.note,
      });
      result.reconciliationItems += 1;
    }
  }

  // --- Record that it ran
  const stamp = {
    at: new Date().toISOString(),
    taxYear,
    generatedAt: payload.meta.generatedAt,
    source: payload.meta.source,
    counts: { ...result, skipped: result.skipped.length },
  };
  await db
    .insert(appSettings)
    .values({ key: IMPORT_KEY, value: stamp })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: stamp, updatedAt: new Date() } });

  return result;
}

/** Finds a person or company by name, creating them if this is the first sight. */
async function ensureActor(db: TxDb, name: string, type: 'pm' | 'contractor'): Promise<string> {
  const [existing] = await db.select({ id: actors.id }).from(actors).where(eq(actors.name, name)).limit(1);
  if (existing) return existing.id;
  const [row] = await db.insert(actors).values({ name, type }).returning({ id: actors.id });
  return row!.id;
}

// --- CLI --------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const fileArg = args.find((a) => !a.startsWith('--'));

  const candidates = [
    fileArg,
    resolve(process.cwd(), 'rental-import-2025.json'),
    resolve(process.cwd(), '../../rental-import-2025.json'),
  ].filter((c): c is string => Boolean(c));

  const path = candidates.find((c) => existsSync(c));
  if (!path) {
    console.error('Could not find rental-import-2025.json. Looked in:');
    for (const c of candidates) console.error(`  ${c}`);
    console.error('\nGenerate it in the Tax-Manager repo with scripts/export-to-rental.ps1,');
    console.error('then copy it to the root of this repo. It is gitignored in both.');
    process.exit(1);
  }

  console.log(`Reading ${path}`);
  // The BOM is stripped rather than assumed away: the exporter runs under
  // Windows PowerShell 5.1, whose `Set-Content -Encoding utf8` writes one, and
  // JSON.parse refuses a leading U+FEFF outright.
  const raw = readFileSync(path, 'utf8').replace(/^﻿/, '');

  assertNoIdentifiers(raw);
  console.log('Security scan passed: no SSN, DOB, account numbers or TINs.');

  const payload = JSON.parse(raw) as Payload;
  console.log(`Payload for ${payload.meta.taxYear}, generated ${payload.meta.generatedAt}.`);

  const result = await importPayload(payload, force);

  console.log('\nImported:');
  console.log(`  properties            ${result.properties}`);
  console.log(`  management periods    ${result.managementPeriods}`);
  console.log(`  loan years            ${result.loanYears}`);
  console.log(`  expenses              ${result.expenses}`);
  console.log(`  payment rows          ${result.payments}`);
  console.log(`  rent receipts         ${result.rentReceipts}`);
  console.log(`  mileage rows          ${result.trips}`);
  console.log(`  reconciliations       ${result.reconciliations}`);
  console.log(`  reconciliation items  ${result.reconciliationItems}`);

  if (result.skipped.length > 0) {
    console.log(`\nSkipped ${result.skipped.length}:`);
    for (const s of result.skipped) console.log(`  ${s}`);
  }

  const range = taxYearRange(payload.meta.taxYear);
  console.log(`\n${payload.meta.taxYear} is loaded and editable (${range.start} to ${range.end}).`);
  console.log('Every imported record is flagged as logged after the fact, which it was.');
  console.log('Run npm run db:check to see what the year is still missing.');
}

if (process.argv[1]?.includes('import-2025')) {
  main()
    .then(() => closePool())
    .catch(async (error: unknown) => {
      console.error('\nImport failed:', error instanceof Error ? error.message : error);
      await closePool();
      process.exit(1);
    });
}
