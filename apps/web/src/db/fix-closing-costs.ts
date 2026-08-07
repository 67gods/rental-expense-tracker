/**
 * Closing costs, reconciled against the expense ledger.
 * Run with: npx tsx src/db/fix-closing-costs.ts
 *
 * Both 2025 acquisitions stored `closing_costs_cents` as the Total Closing Costs
 * (J) figure off the closing disclosure. Some of the money inside that total was
 * ALSO entered as expense rows, and the two properties disagreed about which:
 *
 *   Creedmore  double-counted $1,347.56 - the prepaid hazard premium and the HOA
 *              conveyance fee sat in the lump AND in the ledger.
 *   Arbordale  not double-counted, but its $744.15 prepaid premium was buried in
 *              the lump, so the same kind of money was a deduction on one
 *              property and basis on the other.
 *
 * That mattered because `ledgerLinesFor` only diverts an expense out of the
 * deductible total when `capital_classification = 'improvement'`. An item is
 * either a deduction (a ledger row) or basis (`closing_costs_cents`); there is
 * no third state, so anything sitting in both is counted twice.
 *
 * The convention this script applies, identically to both: `closing_costs_cents`
 * holds only what may be capitalised or is a loan cost, and anything deductible
 * lives in the ledger. After it runs,
 *
 *     closing_costs_cents + closing-derived ledger rows == CD total (J)
 *
 * for each property, which is the sum the verification at the bottom prints.
 *
 * What it does NOT do is decide how much of the remaining lump is depreciable.
 * The VA funding fee and the assumption fee are loan costs and the title work is
 * not, and which of those reaches basis is the CPA's call - so the breakdown is
 * written into `properties.notes` where it can be taken apart, rather than being
 * split into figures the app would then appear to stand behind.
 *
 * Idempotent: the property figures are assignments, the new expense is guarded
 * by a lookup, and the notes block is rewritten from its marker each time.
 */

import './loadEnv';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { closePool, getDb, withTransaction } from './client';
import { actors, expensePayments, expenses, properties, propertyLoanYears } from './schema';

/** Everything below the marker is this script's; anything above it is a human's. */
const NOTES_MARKER = '--- CLOSING DISCLOSURE BREAKDOWN ---';

/** The vendor string the existing closing-derived insurance rows already use. */
const INSURANCE_VENDOR = 'Closing - hazardInsurance';

interface ClosingLine {
  /** Section and line on the closing disclosure, so the figure can be found. */
  ref: string;
  item: string;
  payee: string;
  cents: number;
}

/**
 * A line that belongs in the ledger, named by the vendor its expense row
 * carries. The vendor is what the reconciliation counts, so it has to be the
 * exact string on the row rather than a prefix - `Closing - propertyTax` is a
 * proration that was never inside J and must not be added back to it.
 */
interface LedgerLine extends ClosingLine {
  vendor: string;
  alreadyEntered: boolean;
}

interface ClosingPlan {
  nickname: string;
  /** Total Closing Costs (J), borrower-paid, as printed. */
  cdTotalCents: number;
  closingDate: string;
  /** The lines that stay in `closing_costs_cents`. */
  basis: ClosingLine[];
  /** The lines that belong in the ledger, and whether one has to be created. */
  ledger: LedgerLine[];
  /**
   * Money on the settlement statement that was never inside J - the section K
   * prorations, where the buyer reimburses the seller. Listed in the note so a
   * reader can see it was considered rather than missed; no row moves for it.
   */
  notInTotal: ClosingLine[];
}

const PLANS: ClosingPlan[] = [
  {
    nickname: 'Creedmore ct',
    cdTotalCents: 520_457,
    closingDate: '2025-11-17',
    basis: [
      { ref: 'A.02', item: 'Assumption fee', payee: 'loanDepot.com LLC', cents: 30_000 },
      { ref: 'A.03', item: 'VA funding fee', payee: 'Dept of Veterans Affairs', cents: 151_821 },
      { ref: 'B.01', item: 'Credit report', payee: 'Xactus', cents: 22_500 },
      { ref: 'B.02', item: 'Flood certificate', payee: 'ServiceLink National Flood', cents: 800 },
      { ref: 'C.01', item: 'Title - title examination', payee: 'Patel & Shah PLLC', cents: 94_500 },
      { ref: 'C.02', item: "Title - lender's title insurance", payee: 'Investors Title', cents: 55_980 },
      { ref: 'E.01', item: 'Recording fees (deed 26 / mortgage 64)', payee: 'Mecklenburg County ROD', cents: 9_000 },
      { ref: 'E.02', item: 'eRecording fee', payee: 'Simplifile', cents: 1_000 },
      { ref: 'H.02', item: "Title - owner's policy (optional)", payee: 'Investors Title', cents: 20_100 },
    ],
    ledger: [
      { ref: 'F.01', item: "Homeowner's insurance, 12 months", payee: 'Allstate', cents: 107_256, vendor: 'Closing - hazardInsurance', alreadyEntered: true },
      { ref: 'H.01', item: 'HOA conveyance fee', payee: 'RealManage', cents: 27_500, vendor: 'Closing - hoaConveyanceFee', alreadyEntered: true },
    ],
    notInTotal: [
      { ref: 'K.09', item: 'County taxes, 2025-11-18 to 2026-01-01', payee: 'reimbursed to the seller', cents: 39_183 },
      { ref: 'K.10', item: 'Assessments (HOA), 2025-11-18 to 2026-01-01', payee: 'reimbursed to the seller', cents: 6_027 },
    ],
  },
  {
    nickname: 'Arbordale way',
    cdTotalCents: 370_618,
    closingDate: '2025-01-28',
    basis: [
      { ref: 'A.02', item: 'Assumption fee (304.00 at closing + 400.00 before)', payee: 'Freedom Mortgage', cents: 70_400 },
      { ref: 'B.01', item: 'Credit report (POC)', payee: 'Factual Data', cents: 7_000 },
      { ref: 'B.02', item: 'Flood certification', payee: 'CoreLogic', cents: 1_000 },
      { ref: 'B.03', item: 'VA funding fee', payee: 'Veterans Administration', cents: 123_611 },
      { ref: 'C.06', item: "Title - lender's title insurance", payee: 'Tryon Title Agency, LLC', cents: 44_128 },
      { ref: 'C.07', item: 'Title - title examination', payee: 'Patel & Shah PLLC', cents: 25_000 },
      { ref: 'E.01', item: 'Recording fees (deed 26 / mortgage 64)', payee: 'Gaston County ROD', cents: 9_000 },
      { ref: 'H.04', item: "Title - owner's title insurance (optional)", payee: 'Tryon Title Agency, LLC', cents: 16_064 },
    ],
    ledger: [
      { ref: 'F.01', item: 'Homeowners insurance, 12 months', payee: 'All State Indemnity', cents: 74_415, vendor: 'Closing - hazardInsurance', alreadyEntered: false },
    ],
    notInTotal: [
      { ref: 'K.11', item: 'HOA annual proration, 2025-01-29 to 2026-01-01', payee: 'reimbursed to the seller', cents: 27_699 },
    ],
  },
];

/**
 * The one figure on Arbordale that the paperwork does not settle.
 *
 * The 1098 supplemental says $905.02 of insurance was paid from escrow in 2025
 * and the servicer refunded $639.50. The premium below was paid direct to the
 * carrier before closing, outside escrow, so it is not the same money - but the
 * escrow account was assumed on 2025-01-28, and a disbursement dated before that
 * was the seller's. The transcribed figure is left exactly as the form prints
 * it; only the question is recorded.
 */
const ARBORDALE_ESCROW_QUESTION =
  'Buyer paid a 12-month premium of 744.15 direct to All State Indemnity before the 2025-01-28 closing (CD page 2, F.01), outside escrow - logged separately in the ledger. Whether the 905.02 escrow disbursement fell before closing (the seller’s money) and how the 639.50 refund relates to it still needs the Freedom Mortgage annual escrow statement.';

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const sum = (lines: { cents: number }[]) => lines.reduce((t, l) => t + l.cents, 0);

/** The breakdown, as the property record will carry it. */
function notesBlock(plan: ClosingPlan): string {
  const basisTotal = sum(plan.basis);
  const row = (l: ClosingLine) =>
    `  ${l.ref.padEnd(5)} ${l.item} (${l.payee}) - ${money(l.cents)}`;

  return [
    NOTES_MARKER,
    `Closing disclosure, ${plan.closingDate}. Total closing costs (J), borrower-paid: ${money(plan.cdTotalCents)}.`,
    '',
    `Held in the closing-costs figure - basis or loan cost, ${money(basisTotal)}:`,
    ...plan.basis.map(row),
    '',
    'Deductible, so held in the expense ledger instead of the closing-costs figure:',
    ...plan.ledger.map(row),
    '',
    'On the settlement statement but never inside J - prorations reimbursed to the seller, already in the ledger:',
    ...plan.notInTotal.map(row),
    '',
    `${money(basisTotal)} + ${money(sum(plan.ledger))} = ${money(basisTotal + sum(plan.ledger))}, which is J.`,
    'How much of the closing-costs figure is depreciable is your CPA’s call: the title work and',
    'recording are costs of the property, the funding and assumption fees are costs of the loan.',
  ].join('\n');
}

/** Replaces this script's block, leaving anything written above it alone. */
function withBlock(existing: string | null, block: string): string {
  const before = (existing ?? '').split(NOTES_MARKER)[0]!.trimEnd();
  return before ? `${before}\n\n${block}` : block;
}

async function main() {
  const db = getDb();
  const allProperties = await db.select().from(properties);
  const byNickname = new Map(allProperties.map((p) => [p.nickname, p]));

  // The actor already carrying the closing-derived rows, so the new one is
  // attributed the same way rather than to whoever happens to be first.
  const [existingClosingRow] = await db
    .select({ actorId: expenses.actorId })
    .from(expenses)
    .where(eq(expenses.vendor, INSURANCE_VENDOR))
    .limit(1);

  const [fallbackOwner] = await db
    .select({ id: actors.id })
    .from(actors)
    .where(eq(actors.type, 'owner'))
    .limit(1);

  const actorId = existingClosingRow?.actorId ?? fallbackOwner?.id;
  if (!actorId) throw new Error('No actor to attribute the expense to.');

  for (const plan of PLANS) {
    const property = byNickname.get(plan.nickname);
    if (!property) throw new Error(`No property nicknamed "${plan.nickname}".`);

    const basisTotal = sum(plan.basis);
    if (basisTotal + sum(plan.ledger) !== plan.cdTotalCents) {
      throw new Error(
        `${plan.nickname}: the lines sum to ${money(basisTotal + sum(plan.ledger))}, not the ${money(plan.cdTotalCents)} on the disclosure.`,
      );
    }

    console.log(`\n${plan.nickname}`);
    console.log(`  closing costs: ${money(Number(property.closingCostsCents ?? 0))} -> ${money(basisTotal)}`);

    // The property figure and the expense pair move together: a run that wrote
    // one and not the other would leave the money either doubled or missing.
    await withTransaction(async (tx) => {
      await tx
        .update(properties)
        .set({
          closingCostsCents: basisTotal,
          notes: withBlock(property.notes, notesBlock(plan)),
          updatedAt: new Date(),
        })
        .where(eq(properties.id, property.id));

      for (const line of plan.ledger) {
        if (line.alreadyEntered) {
          console.log(`  ledger: ${money(line.cents)} ${line.item} - already entered, left alone`);
          continue;
        }

        const note = `${line.item}, to ${line.payee}. From the closing disclosure: CD page 2, ${line.ref} - paid before closing (POC), direct to the carrier, outside escrow.`;

        const [duplicate] = await tx
          .select({ id: expenses.id })
          .from(expenses)
          .where(
            and(
              eq(expenses.propertyId, property.id),
              eq(expenses.vendor, line.vendor),
              eq(expenses.date, plan.closingDate),
            ),
          )
          .limit(1);

        // The note is rewritten rather than only set at insert, so correcting
        // the wording here fixes the row a previous run created instead of
        // leaving the database holding an older sentence than the script does.
        if (duplicate) {
          await tx
            .update(expenses)
            .set({ notes: note, updatedAt: new Date() })
            .where(eq(expenses.id, duplicate.id));
          console.log(`  ledger: ${money(line.cents)} ${line.item} - already present, note refreshed`);
          continue;
        }

        const [row] = await tx
          .insert(expenses)
          .values({
            date: plan.closingDate,
            actorId,
            propertyId: property.id,
            amountCents: line.cents,
            vendor: line.vendor,
            scheduleECategory: 'insurance',
            notes: note,
            // Reconstructed from the disclosure months after the fact, and the
            // record says so.
            isBackdated: true,
          })
          .returning({ id: expenses.id });

        // Reports sum settled payments, not invoice totals - without this row
        // the expense reaches no export.
        await tx.insert(expensePayments).values({
          expenseId: row!.id,
          paidDate: plan.closingDate,
          amountCents: line.cents,
          isScheduled: false,
        });

        console.log(`  ledger: ${money(line.cents)} ${line.item} - inserted, dated ${plan.closingDate}`);
      }
    });

    console.log(`  notes: breakdown written, ${plan.basis.length} lines held as basis`);
  }

  // --- The open question on Arbordale's escrow figure -----------------------

  const arbordale = byNickname.get('Arbordale way')!;
  const [loanYear] = await db
    .select({ note: propertyLoanYears.documentNote, lender: propertyLoanYears.lenderName })
    .from(propertyLoanYears)
    .where(
      and(eq(propertyLoanYears.propertyId, arbordale.id), eq(propertyLoanYears.taxYear, 2025)),
    )
    .limit(1);

  if (!loanYear) {
    console.log('\n  ! Arbordale way: no 2025 loan row to record the escrow question on');
  } else if (loanYear.note?.includes('outside escrow')) {
    console.log('\nArbordale way 2025 loan row: escrow question already recorded');
  } else {
    await db
      .update(propertyLoanYears)
      .set({
        documentNote: [loanYear.note, ARBORDALE_ESCROW_QUESTION].filter(Boolean).join(' '),
        updatedAt: new Date(),
      })
      .where(
        and(eq(propertyLoanYears.propertyId, arbordale.id), eq(propertyLoanYears.taxYear, 2025)),
      );
    console.log(`\nArbordale way 2025 loan row (${loanYear.lender}): escrow question recorded`);
    console.log('  insurance_paid_from_escrow_cents left at 905.02, as the 1098 supplemental prints it');
  }

  // --- What the two sides now add up to ------------------------------------

  console.log('\nReconciliation');
  let mismatch = false;

  for (const plan of PLANS) {
    const property = byNickname.get(plan.nickname)!;

    // Read the rows back rather than trusting the constants: the point of the
    // check is to catch a row that did not land, and a figure taken from PLANS
    // would agree with itself no matter what the database holds. Only the
    // vendors named in `ledger` count - the prorations were never inside J.
    const [ledgerTotal] = await db
      .select({ cents: sql<string>`coalesce(sum(${expenses.amountCents}), 0)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.propertyId, property.id),
          inArray(expenses.vendor, plan.ledger.map((l) => l.vendor)),
        ),
      );

    const [fresh] = await db
      .select({ cents: properties.closingCostsCents })
      .from(properties)
      .where(eq(properties.id, property.id));

    const basisCents = Number(fresh?.cents ?? 0);
    const fromClosing = Number(ledgerTotal?.cents ?? 0);
    const total = basisCents + fromClosing;
    if (total !== plan.cdTotalCents) mismatch = true;

    console.log(
      `  ${plan.nickname.padEnd(14)} ${money(basisCents)} basis + ${money(fromClosing)} ledger = ${money(total)}  (J = ${money(plan.cdTotalCents)})  ${total === plan.cdTotalCents ? 'OK' : 'MISMATCH'}`,
    );
  }

  if (mismatch) {
    throw new Error('A property no longer reconciles to its closing disclosure. Nothing above was rolled back - read the lines and fix the one that moved.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closePool);
