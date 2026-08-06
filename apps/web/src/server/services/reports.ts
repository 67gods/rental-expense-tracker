import {
  allocateExpense,
  contractorW9Warnings,
  contractorYearTotals,
  costTreatmentLabel,
  donationKind,
  formatCentsPlain,
  formatHoursDecimal,
  getHourCategory,
  getScheduleECategory,
  interestSource,
  listScheduleECategories,
  needsPropertyOrSplit,
  RECONCILIATION_KINDS,
  rollUpHours,
  SCHEDULE_E_RENTS_RECEIVED_LINE,
  sumCents,
  toCsv,
  type AllocationRule,
} from '@rental/domain';
import { expensesByIds, expensesTouchingYear, listExpenses } from './expenses';
import { listTimeEntries } from './timeEntries';
import { listTrips } from './trips';
import {
  listActors,
  listManagementPeriods,
  listProperties,
  listRentReceipts,
  toDomainProperties,
} from './reference';
import { listLoanYears, loanTotalsByProperty } from './loanYears';
import { listCpaFigures, scheduleEFiguresByProperty } from './cpaFigures';
import { listPayments, paidByExpenseInYear } from './payments';
import { getJobWithChildren, listJobs, jobTitlesById } from './jobs';
import { reconciliationsForYear } from './reconciliation';
import { listBankAccounts, listInterestYears } from './interest';
import { listDonations } from './donations';

/**
 * Year-end reports (§7.6, §10).
 *
 * Everything here derives from the stored records; nothing is recomputed in a
 * way that could disagree with what the app showed during the year. Shared
 * expenses are expanded through the domain's allocation rule at report time,
 * so the per-property figures sum back to the parent amounts exactly.
 */

/** Where a figure came from. Never merged - the CPA has to be able to see. */
export type FigureSource = 'ledger' | '1098' | 'cpa';

export interface ScheduleELine {
  line: number;
  categoryId: string;
  label: string;
  amountCents: number;
  source: FigureSource;
  /**
   * Spend the owner classified as a capital improvement.
   *
   * Reported separately and NOT included in the expense total, because an
   * improvement is not a Schedule E deduction - it is basis the CPA
   * depreciates. Summing it into line 19 alongside genuine other-expenses
   * overstates the year's deductions by whatever was spent on appliances,
   * flooring and furniture, which in 2025 was $20,869.57.
   *
   * This is not the app deciding anything. The classification is already on
   * the record, put there by whoever entered it; the report just stops
   * pretending it says something else.
   */
  isCapital: boolean;
  /** The same property and line, all sources, in the year before. */
  priorYearCents: number;
}

export interface SchedulePropertySummary {
  propertyId: string;
  nickname: string;
  address: string;
  /**
   * The placed-in-service date. Carried here because the properties are
   * already loaded to build this summary, and every screen showing these
   * figures wants to say which side of that line they fall on.
   */
  availableFrom: string | null;
  rentsReceivedCents: number;
  expenseLines: ScheduleELine[];
  /** Deductible expenses only. Capital additions are not in here. */
  totalExpenseCents: number;
  /** Capital additions, reported alongside rather than deducted. */
  capitalAdditionsCents: number;
  netCents: number;
}

/**
 * Per-property income and expenses grouped by Schedule E line (§10).
 *
 * THE AMOUNTS COME FROM PAYMENTS, NOT FROM EXPENSES. Cash basis deducts in the
 * year money moved, so the report starts from the payments settled in the year
 * and works back to the invoices they belong to - which means an invoice dated
 * December 2025 and paid in January 2026 lands in 2026, and an $8,244 invoice
 * with $2,500 paid in December contributes $2,500, not $8,244.
 *
 * Three sources feed it and none of them is merged into another:
 *
 *   ledger  what actually left the bank, allocated across properties
 *   1098    interest, tax and escrowed insurance, which never touch the ledger
 *   cpa     depreciation and anything else transcribed from the return
 *
 * A property with mortgage interest from both the ledger and a 1098 gets two
 * rows on line 12, not one sum. Merging them would hide a double count, which
 * is exactly the error worth catching.
 */
export async function buildScheduleE(
  taxYear: number,
  options: { includePriorYear?: boolean } = {},
): Promise<SchedulePropertySummary[]> {
  const [properties, receipts, ledger, loans, cpa] = await Promise.all([
    listProperties({ includeArchived: true }),
    listRentReceipts({ taxYear, limit: 10_000 }),
    ledgerLinesFor(taxYear),
    loanTotalsByProperty(taxYear),
    scheduleEFiguresByProperty(taxYear),
  ]);

  // One extra pass, and only one: the recursive call is made with the flag off.
  const prior =
    options.includePriorYear === false
      ? []
      : await buildScheduleE(taxYear - 1, { includePriorYear: false });

  const priorByKey = new Map<string, number>();
  for (const summary of prior) {
    for (const line of summary.expenseLines) {
      const key = `${summary.propertyId}:${line.categoryId}`;
      priorByKey.set(key, (priorByKey.get(key) ?? 0) + line.amountCents);
    }
    priorByKey.set(`${summary.propertyId}:__rent`, summary.rentsReceivedCents);
  }

  const rentByProperty = new Map<string, number>();
  for (const receipt of receipts) {
    rentByProperty.set(
      receipt.propertyId,
      (rentByProperty.get(receipt.propertyId) ?? 0) + receipt.amountCents,
    );
  }

  return properties.map((property) => {
    const expenseLines: ScheduleELine[] = [];

    const push = (
      categoryId: string,
      amountCents: number,
      source: FigureSource,
      isCapital = false,
    ) => {
      if (amountCents === 0) return;
      const category = safeCategory(categoryId);
      expenseLines.push({
        line: category.line,
        categoryId,
        label: category.label,
        amountCents,
        source,
        isCapital,
        priorYearCents: priorByKey.get(`${property.id}:${categoryId}`) ?? 0,
      });
    };

    for (const category of listScheduleECategories()) {
      push(category.id, ledger.deductible.get(`${property.id}:${category.id}`) ?? 0, 'ledger');
    }
    for (const category of listScheduleECategories()) {
      push(category.id, ledger.capital.get(`${property.id}:${category.id}`) ?? 0, 'ledger', true);
    }

    // The 1098 figures. Interest to line 12, property tax to line 16, escrowed
    // insurance to line 9 - each of those is what the form itself says the box
    // is, so putting it there is transcription rather than judgement.
    //
    // Points and mortgage insurance are DELIBERATELY not placed on a line.
    // Points on a rental may have to be amortised over the loan term rather
    // than deducted, and where mortgage insurance belongs has moved more than
    // once. Both are exported in full by the loan-years report, where the CPA
    // can see them and decide. Guessing here would be the app reaching a tax
    // conclusion, which is the one thing it does not do.
    const loan = loans.get(property.id);
    if (loan) {
      push('mortgage_interest', loan.interestCents, '1098');
      push('taxes', loan.propertyTaxCents, '1098');
      push('insurance', loan.insuranceCents, '1098');
    }

    for (const category of listScheduleECategories()) {
      push(category.id, cpa.get(`${property.id}:${category.id}`) ?? 0, 'cpa');
    }

    const totalExpenseCents = sumCents(
      expenseLines.filter((l) => !l.isCapital).map((l) => l.amountCents),
    );
    const capitalAdditionsCents = sumCents(
      expenseLines.filter((l) => l.isCapital).map((l) => l.amountCents),
    );
    const rentsReceivedCents = rentByProperty.get(property.id) ?? 0;

    return {
      propertyId: property.id,
      nickname: property.nickname,
      address: property.address,
      availableFrom: property.placedInServiceDate,
      rentsReceivedCents,
      expenseLines,
      totalExpenseCents,
      capitalAdditionsCents,
      // Capital is not subtracted. Depreciation reaches this report as a `cpa`
      // figure on line 18 once the CPA sends one back, which is the only route
      // by which a capital cost should ever reduce the net.
      netCents: rentsReceivedCents - totalExpenseCents,
    };
  });
}

/**
 * What left the bank in the year, allocated across properties by Schedule E
 * line. Keyed `propertyId:categoryId`.
 *
 * The allocation rule is applied to the PAID amount rather than the invoice
 * total, so a split invoice paid in instalments splits the same way each time
 * and the pieces still sum back to what was paid, to the cent.
 */
async function ledgerLinesFor(
  taxYear: number,
): Promise<{ deductible: Map<string, number>; capital: Map<string, number> }> {
  const paidByExpense = await paidByExpenseInYear(taxYear);
  const [expenses, properties] = await Promise.all([
    expensesByIds([...paidByExpense.keys()]),
    listProperties({ includeArchived: true }),
  ]);

  const domainProperties = toDomainProperties(properties);
  const deductible = new Map<string, number>();
  const capital = new Map<string, number>();

  for (const [expenseId, paidCents] of paidByExpense) {
    const expense = expenses.get(expenseId);
    if (!expense || paidCents === 0) continue;
    // No property and no split yet - it's a review item (§6), not
    // Schedule E-ready. Counted once it is resolved, not before.
    if (needsPropertyOrSplit(expense.propertyId, expense.allocationRule as AllocationRule | null)) {
      continue;
    }

    const lines = allocateExpense(
      paidCents,
      expense.allocationRule as AllocationRule | null,
      domainProperties,
      expense.propertyId,
    );

    // Split on the classification already stored against the expense. An
    // improvement is basis, not a deduction, and merging the two would put
    // appliances and flooring on the same line as consumables.
    const target = expense.capitalClassification === 'improvement' ? capital : deductible;

    for (const line of lines) {
      const key = `${line.propertyId}:${expense.scheduleECategory}`;
      target.set(key, (target.get(key) ?? 0) + line.amountCents);
    }
  }

  return { deductible, capital };
}

export async function scheduleECsv(taxYear: number): Promise<string> {
  const summaries = await buildScheduleE(taxYear);

  interface Row {
    property: string;
    address: string;
    line: string;
    label: string;
    amount: number;
    source: string;
    prior: number | null;
  }
  const rows: Row[] = [];

  for (const summary of summaries) {
    rows.push({
      property: summary.nickname,
      address: summary.address,
      line: String(SCHEDULE_E_RENTS_RECEIVED_LINE),
      label: 'Rents received',
      amount: summary.rentsReceivedCents,
      source: 'ledger',
      prior: null,
    });
    for (const line of summary.expenseLines.filter((l) => !l.isCapital)) {
      rows.push({
        property: summary.nickname,
        address: summary.address,
        line: String(line.line),
        label: line.label,
        amount: line.amountCents,
        source: line.source,
        prior: line.priorYearCents,
      });
    }
    rows.push({
      property: summary.nickname,
      address: summary.address,
      line: '',
      label: 'Total expenses',
      amount: summary.totalExpenseCents,
      source: '',
      prior: null,
    });
    rows.push({
      property: summary.nickname,
      address: summary.address,
      line: '',
      label: 'Net',
      amount: summary.netCents,
      source: '',
      prior: null,
    });

    // Capital last, below the net, with no Schedule E line number - because it
    // does not have one. Putting it above would invite it into the total.
    for (const line of summary.expenseLines.filter((l) => l.isCapital)) {
      rows.push({
        property: summary.nickname,
        address: summary.address,
        line: '',
        label: `CAPITAL - ${line.label} - not deducted, see the expense detail for what it was`,
        amount: line.amountCents,
        source: 'ledger (capital)',
        prior: null,
      });
    }
    if (summary.capitalAdditionsCents !== 0) {
      rows.push({
        property: summary.nickname,
        address: summary.address,
        line: '',
        label: 'Total capital additions - depreciated by your CPA, not deducted here',
        amount: summary.capitalAdditionsCents,
        source: '',
        prior: null,
      });
    }
  }

  return toCsv(rows, [
    { header: 'Property', value: (r) => r.property },
    { header: 'Address', value: (r) => r.address },
    { header: 'Schedule E line', value: (r) => r.line },
    { header: 'Description', value: (r) => r.label },
    { header: 'Amount', value: (r) => formatCentsPlain(r.amount) },
    // Which of the three feeds this row came from. A line appearing twice with
    // different sources is not a bug in the report - it is two figures that
    // have not been reconciled, and seeing that is the point.
    { header: 'Source', value: (r) => r.source },
    { header: `Prior year (${taxYear - 1})`, value: (r) => (r.prior === null ? '' : formatCentsPlain(r.prior)) },
  ]);
}

/**
 * The time log (§10): date, hours, description, and person, per enterprise.
 *
 * Eligibility is a separate column rather than a filter, so the CPA sees the
 * whole log and the basis for every inclusion instead of a pre-filtered subset.
 */
export async function timeLogCsv(taxYear: number, enterpriseId?: string): Promise<string> {
  const [entries, actors, properties, jobTitles] = await Promise.all([
    listTimeEntries({ taxYear, enterpriseId, limit: 20_000 }),
    listActors({ includeArchived: true }),
    listProperties({ includeArchived: true }),
    jobTitlesById(),
  ]);

  const actorNames = new Map(actors.map((a) => [a.id, a.name]));
  const propertyNames = new Map(properties.map((p) => [p.id, p.nickname]));

  const sorted = [...entries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (actorNames.get(a.actorId) ?? '').localeCompare(actorNames.get(b.actorId) ?? ''),
  );

  return toCsv(sorted, [
    { header: 'Date', value: (e) => e.date },
    { header: 'Person', value: (e) => actorNames.get(e.actorId) ?? 'Unattributed' },
    { header: 'Hours', value: (e) => formatHoursDecimal(e.minutes) },
    { header: 'Category', value: (e) => safeCategoryLabel(e.category) },
    { header: 'Counts toward 250', value: (e) => (e.shEligible ? 'Yes' : 'No') },
    {
      header: 'Pending classification',
      value: (e) => (e.isProvisional ? 'Yes' : ''),
    },
    { header: 'Property', value: (e) => (e.propertyId ? propertyNames.get(e.propertyId) ?? '' : '') },
    { header: 'Description', value: (e) => e.description },
    // The job column is what lets the CPA regroup any log by task, so the
    // laptop errand reads as one thing across three separate CSVs.
    { header: 'Job', value: (e) => (e.jobId ? jobTitles.get(e.jobId) ?? '' : '') },
    { header: 'How recorded', value: (e) => e.source },
    // Which rule set derived the eligibility flag. A row stamped with an older
    // version was judged under rules that have since moved.
    { header: 'Rules version', value: (e) => e.rulesVersion ?? '' },
    // Contemporaneity evidence (§6). Exported so the log can be defended, not
    // just read.
    { header: 'Recorded at', value: (e) => e.createdAt.toISOString() },
    { header: 'Logged after the fact', value: (e) => (e.isBackdated ? 'Yes' : '') },
  ]);
}

/** Per-person, per-category totals, kept separate because they cannot be pooled (§4). */
export async function timeSummaryByActor(taxYear: number, enterpriseId?: string) {
  const [entries, actors] = await Promise.all([
    listTimeEntries({ taxYear, enterpriseId, limit: 20_000 }),
    listActors({ includeArchived: true }),
  ]);

  const actorNames = new Map(actors.map((a) => [a.id, a.name]));
  const grouped = new Map<string, typeof entries>();

  for (const entry of entries) {
    const list = grouped.get(entry.actorId);
    if (list) list.push(entry);
    else grouped.set(entry.actorId, [entry]);
  }

  return [...grouped.entries()]
    .map(([actorId, actorEntries]) => ({
      actorId,
      name: actorNames.get(actorId) ?? 'Unattributed',
      totals: rollUpHours(
        actorEntries.map((e) => ({
          minutes: e.minutes,
          category: e.category,
          shEligible: e.shEligible,
          isProvisional: e.isProvisional,
          actorId: e.actorId,
          propertyId: e.propertyId,
        })),
      ),
    }))
    .sort((a, b) => b.totals.eligibleMinutes - a.totals.eligibleMinutes);
}

/**
 * The mileage log (§7.6).
 *
 * Date, start, destination, miles, and business purpose - the fields a mileage
 * record needs to stand up. No dollar column: the app does not assert a rate.
 */
export async function mileageLogCsv(taxYear: number): Promise<string> {
  const [trips, actors, properties, jobTitles] = await Promise.all([
    listTrips({ taxYear, limit: 20_000 }),
    listActors({ includeArchived: true }),
    listProperties({ includeArchived: true }),
    jobTitlesById(),
  ]);

  const actorNames = new Map(actors.map((a) => [a.id, a.name]));
  const propertyNames = new Map(properties.map((p) => [p.id, p.nickname]));
  const inService = new Map(properties.map((p) => [p.id, p.placedInServiceDate]));
  const sorted = [...trips].sort((a, b) => a.date.localeCompare(b.date));

  return toCsv(sorted, [
    { header: 'Date', value: (t) => t.date },
    { header: 'Driver', value: (t) => actorNames.get(t.actorId) ?? 'Unattributed' },
    { header: 'Start', value: (t) => t.origin },
    { header: 'Destination', value: (t) => t.destination },
    { header: 'Miles', value: (t) => Number(t.miles).toFixed(1) },
    { header: 'Business purpose', value: (t) => t.purpose },
    { header: 'Property', value: (t) => (t.propertyId ? propertyNames.get(t.propertyId) ?? '' : '') },
    // A date comparison against the property's placed-in-service date, and a
    // label. The app never says what to DO with acquisition-side mileage -
    // that is the CPA's call - it just hands the log over already sorted.
    {
      header: 'Cost treatment',
      value: (t) =>
        costTreatmentLabel(
          t.date,
          t.propertyId ? (inService.get(t.propertyId) ?? null) : null,
          asTreatment(t.costTreatmentOverride),
        ),
    },
    { header: 'Set by hand', value: (t) => (t.costTreatmentOverride ? 'Yes' : '') },
    { header: 'Job', value: (t) => (t.jobId ? jobTitles.get(t.jobId) ?? '' : '') },
    { header: 'Recorded at', value: (t) => t.createdAt.toISOString() },
  ]);
}

/** Contractor payments and W-9 status (§5.6, §7.6). */
export async function contractorCsv(taxYear: number): Promise<string> {
  const [expenses, actors] = await Promise.all([
    listExpenses({ taxYear, limit: 20_000 }),
    listActors({ includeArchived: true }),
  ]);

  const contractors = actors.filter((a) => a.type === 'contractor');
  const totals = contractorYearTotals(
    expenses.map((e) => ({
      contractorActorId: e.contractorActorId,
      amountCents: e.amountCents,
      date: e.date,
    })),
    contractors.map((c) => ({
      id: c.id,
      name: c.name,
      w9OnFile: c.w9OnFile,
      taxIdCollected: c.taxIdCollected,
    })),
    taxYear,
  );

  // The report's own year, not the current one. Running the 2025 report in
  // 2026 must apply 2025's $600 threshold, not 2026's $2,000.
  const needsW9 = new Set(
    contractorW9Warnings(totals, new Date(), taxYear).map((w) => w.actorId),
  );

  return toCsv(totals, [
    { header: 'Contractor', value: (t) => t.name },
    { header: 'Paid in year', value: (t) => formatCentsPlain(t.paidCents) },
    { header: 'W-9 on file', value: (t) => (t.w9OnFile ? 'Yes' : 'No') },
    { header: 'Tax ID collected', value: (t) => (t.taxIdCollected ? 'Yes' : 'No') },
    { header: 'Flagged for follow-up', value: (t) => (needsW9.has(t.actorId) ? 'Yes' : '') },
  ]);
}

/**
 * Every expense as recorded, for the CPA who wants the underlying rows.
 *
 * Both figures, side by side and never merged: the invoice total is what was
 * owed, `Paid in year` is what actually left the bank. On an ordinary expense
 * they are the same number; on the two a year that straddle a year boundary
 * they are not, and the difference is the whole reason the payments table
 * exists.
 *
 * Which is also why the rows come from `expensesTouchingYear` and not from the
 * invoice date. A December 2025 invoice paid off through 2026 is deducted on
 * the 2026 Schedule E; a 2026 detail export that omitted it would send the CPA
 * a backing sheet that does not add up to the summary it backs. The `Invoice
 * date in year` column marks the ones carried in.
 */
export async function expenseDetailCsv(taxYear: number): Promise<string> {
  const [{ expenses, paidByExpense: paidInYear }, properties, actors, jobTitles] =
    await Promise.all([
      expensesTouchingYear(taxYear, { limit: 20_000 }),
      listProperties({ includeArchived: true }),
      listActors({ includeArchived: true }),
      jobTitlesById(),
    ]);

  const propertyNames = new Map(properties.map((p) => [p.id, p.nickname]));
  const actorNames = new Map(actors.map((a) => [a.id, a.name]));
  const inService = new Map(properties.map((p) => [p.id, p.placedInServiceDate]));
  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date));

  return toCsv(sorted, [
    { header: 'Date', value: (e) => e.date },
    {
      header: 'Invoice date in year',
      value: (e) => (e.date.slice(0, 4) === String(taxYear) ? 'Yes' : 'No'),
    },
    { header: 'Vendor', value: (e) => e.vendor },
    { header: 'Invoice total', value: (e) => formatCentsPlain(e.amountCents) },
    { header: 'Paid in year', value: (e) => formatCentsPlain(paidInYear.get(e.id) ?? 0) },
    {
      header: 'Outstanding',
      value: (e) => formatCentsPlain(Math.max(0, e.amountCents - (paidInYear.get(e.id) ?? 0))),
    },
    { header: 'Schedule E line', value: (e) => String(safeScheduleELine(e.scheduleECategory)) },
    { header: 'Category', value: (e) => safeScheduleELabel(e.scheduleECategory) },
    {
      header: 'Property',
      value: (e) =>
        e.propertyId
          ? propertyNames.get(e.propertyId) ?? ''
          : needsPropertyOrSplit(e.propertyId, e.allocationRule as AllocationRule | null)
            ? 'Portfolio-wide (unresolved)'
            : 'Split',
    },
    {
      header: 'Repair or improvement',
      value: (e) => e.capitalClassification ?? 'Not answered',
    },
    {
      header: 'Cost treatment',
      value: (e) =>
        costTreatmentLabel(
          e.date,
          e.propertyId ? (inService.get(e.propertyId) ?? null) : null,
          asTreatment(e.costTreatmentOverride),
        ),
    },
    { header: 'Job', value: (e) => (e.jobId ? jobTitles.get(e.jobId) ?? '' : '') },
    { header: 'Contractor', value: (e) => (e.contractorActorId ? actorNames.get(e.contractorActorId) ?? '' : '') },
    { header: 'Receipt on file', value: (e) => (e.receiptKey ? 'Yes' : 'No') },
    { header: 'Entered by', value: (e) => actorNames.get(e.actorId) ?? '' },
    { header: 'Notes', value: (e) => e.notes ?? '' },
    { header: 'Recorded at', value: (e) => e.createdAt.toISOString() },
  ]);
}

/**
 * Every cash event in the year, which is the row-level backing for every
 * amount on the Schedule E report.
 *
 * Scheduled rows are included and marked. They are deductible nowhere until
 * confirmed, and a CPA who can see the plan alongside what was actually paid
 * can tell the difference between an invoice that is half-unpaid and one that
 * is half-paid on purpose.
 */
export async function paymentsCsv(taxYear: number): Promise<string> {
  const payments = await listPayments({ taxYear, includeScheduled: true, limit: 20_000 });
  const [expenses, properties, jobTitles] = await Promise.all([
    expensesByIds(payments.map((p) => p.expenseId)),
    listProperties({ includeArchived: true }),
    jobTitlesById(),
  ]);
  const propertyNames = new Map(properties.map((p) => [p.id, p.nickname]));

  return toCsv(payments, [
    { header: 'Paid date', value: (p) => p.paidDate },
    { header: 'Amount', value: (p) => formatCentsPlain(p.amountCents) },
    { header: 'Status', value: (p) => (p.isScheduled ? 'Scheduled - not yet paid' : 'Paid') },
    { header: 'Vendor', value: (p) => expenses.get(p.expenseId)?.vendor ?? '' },
    { header: 'Invoice date', value: (p) => expenses.get(p.expenseId)?.date ?? '' },
    {
      header: 'Invoice total',
      value: (p) => {
        const expense = expenses.get(p.expenseId);
        return expense ? formatCentsPlain(expense.amountCents) : '';
      },
    },
    {
      header: 'Schedule E line',
      value: (p) => {
        const expense = expenses.get(p.expenseId);
        return expense ? String(safeScheduleELine(expense.scheduleECategory)) : '';
      },
    },
    {
      header: 'Property',
      value: (p) => {
        const expense = expenses.get(p.expenseId);
        if (!expense) return '';
        if (expense.propertyId) return propertyNames.get(expense.propertyId) ?? '';
        return needsPropertyOrSplit(expense.propertyId, expense.allocationRule as AllocationRule | null)
          ? 'Portfolio-wide (unresolved)'
          : 'Split';
      },
    },
    {
      header: 'Job',
      value: (p) => {
        const jobId = expenses.get(p.expenseId)?.jobId;
        return jobId ? (jobTitles.get(jobId) ?? '') : '';
      },
    },
    { header: 'Method', value: (p) => p.method ?? '' },
    { header: 'Reference', value: (p) => p.reference ?? '' },
    { header: 'Notes', value: (p) => p.notes ?? '' },
  ]);
}

/**
 * Rent banked against rent reported, and the itemised gap.
 *
 * The banked figure is summed from the receipts and the reported figure is
 * transcribed from the 1099. Nothing reconciles them automatically - each item
 * is a reason the owner supplied, and the residual is what is still unexplained.
 */
export async function rentReconciliationCsv(taxYear: number): Promise<string> {
  const views = await reconciliationsForYear(taxYear);

  interface Row {
    property: string;
    kind: string;
    amount: number | null;
    note: string;
  }
  const rows: Row[] = [];

  for (const view of views) {
    rows.push({
      property: view.propertyNickname,
      kind: 'Rent banked (from the receipts)',
      amount: view.receiptsCents,
      note: '',
    });
    rows.push({
      property: view.propertyNickname,
      kind: '1099 box 1 as issued',
      amount: view.reportedGrossCents,
      note: view.reportedGrossCents === null ? 'The form has not arrived' : '',
    });
    for (const item of view.items) {
      rows.push({
        property: view.propertyNickname,
        kind: safeReconciliationLabel(item.kind),
        amount: item.amountCents,
        note: [item.note, item.isUnusualSign ? 'Sign is unusual for this kind' : '']
          .filter(Boolean)
          .join(' · '),
      });
    }
    // Three states, not two. A property with no 1099 has nothing to reconcile
    // against, and calling that "not reconciled" reads as a problem the owner
    // has failed to fix rather than a form that was never issued - which is
    // exactly what a self-managed property looks like every year.
    rows.push({
      property: view.propertyNickname,
      kind: 'Still unexplained',
      amount: view.residualCents,
      note:
        view.reportedGrossCents === null
          ? 'No 1099 on file, so there is nothing to reconcile against'
          : view.isReconciled
            ? 'Reconciled'
            : 'Not reconciled - this difference still needs explaining',
    });
  }

  return toCsv(rows, [
    { header: 'Property', value: (r) => r.property },
    { header: 'Item', value: (r) => r.kind },
    { header: 'Amount', value: (r) => (r.amount === null ? '' : formatCentsPlain(r.amount)) },
    { header: 'Note', value: (r) => r.note },
  ]);
}

/**
 * One row per property: everything the CPA asks for that is not a transaction.
 *
 * This is literally the owner's "anything else that we will need to provide to
 * CPA" - the dates, the prices, the conversion facts, who managed it and when.
 */
export async function propertyFactsCsv(_taxYear?: number): Promise<string> {
  // The year is accepted and ignored, so this slots into REPORTS beside the
  // others. These are current-state facts - a purchase price does not have a
  // 2025 version and a 2026 one - and filtering by year would hide a property
  // from the very year it was bought in.
  const [properties, actors] = await Promise.all([
    listProperties({ includeArchived: true }),
    listActors({ includeArchived: true }),
  ]);
  const actorNames = new Map(actors.map((a) => [a.id, a.name]));

  const history = new Map<string, string>();
  for (const property of properties) {
    const periods = await listManagementPeriods(property.id);
    history.set(
      property.id,
      periods
        .slice()
        .reverse()
        .map(
          (p) =>
            `${p.startDate} to ${p.endDate ?? 'now'}: ${
              p.managerActorId ? (actorNames.get(p.managerActorId) ?? 'a manager') : 'self-managed'
            }`,
        )
        .join(' | '),
    );
  }

  return toCsv(properties, [
    { header: 'Property', value: (p) => p.nickname },
    { header: 'Address', value: (p) => p.address },
    { header: 'Acquired', value: (p) => p.acquiredDate ?? '' },
    { header: 'Placed in service', value: (p) => p.placedInServiceDate ?? '' },
    { header: 'In-service evidence', value: (p) => p.placedInServiceEvidence ?? '' },
    { header: 'First tenant', value: (p) => p.firstTenantDate ?? '' },
    { header: 'Purchase price', value: (p) => plain(p.purchasePriceCents) },
    { header: 'Closing costs', value: (p) => plain(p.closingCostsCents) },
    { header: 'Land value', value: (p) => plain(p.landValueCents) },
    { header: 'Unadjusted basis', value: (p) => plain(p.unadjustedBasisCents) },
    { header: 'Ownership %', value: (p) => String(Number(p.ownershipPct)) },
    { header: 'Was a personal residence', value: (p) => (p.wasPersonalResidence ? 'Yes' : '') },
    { header: 'Converted to rental', value: (p) => p.convertedToRentalDate ?? '' },
    { header: 'Market value at conversion', value: (p) => plain(p.fmvAtConversionCents) },
    { header: 'Sold', value: (p) => p.soldDate ?? '' },
    { header: 'Sale price', value: (p) => plain(p.salePriceCents) },
    { header: 'Triple-net leased', value: (p) => (p.isTripleNet ? 'Yes' : '') },
    { header: 'Personal use this year', value: (p) => (p.hadPersonalUse ? 'Yes' : '') },
    { header: 'Section 469 activity', value: (p) => p.section469Activity ?? '' },
    { header: 'Management history', value: (p) => history.get(p.id) ?? '' },
  ]);
}

/**
 * The loan and escrow facts, with the source of every figure.
 *
 * Points and mortgage insurance appear here and NOT on the Schedule E report.
 * Points on a rental may have to be amortised over the loan term rather than
 * deducted, and mortgage insurance has moved lines more than once. Putting them
 * on a line would be the app reaching a conclusion; putting them here hands the
 * CPA the figure and the document it came from.
 */
export async function loanYearsCsv(taxYear: number): Promise<string> {
  const [rows, properties] = await Promise.all([
    listLoanYears({ taxYear }),
    listProperties({ includeArchived: true }),
  ]);
  const propertyNames = new Map(properties.map((p) => [p.id, p.nickname]));

  return toCsv(rows, [
    { header: 'Property', value: (r) => propertyNames.get(r.propertyId) ?? '' },
    { header: 'Lender', value: (r) => r.lenderName },
    { header: 'Interest (box 1)', value: (r) => plain(r.interestCents) },
    { header: 'Property tax (box 10)', value: (r) => plain(r.propertyTaxCents) },
    { header: 'Property tax read from', value: (r) => r.propertyTaxSource ?? '' },
    { header: 'Insurance from escrow', value: (r) => plain(r.insurancePaidFromEscrowCents) },
    { header: 'Insurance read from', value: (r) => r.insuranceSource ?? '' },
    { header: 'Points (box 6)', value: (r) => plain(r.pointsCents) },
    { header: 'Mortgage insurance (box 5)', value: (r) => plain(r.mortgageInsuranceCents) },
    { header: 'Escrow balance', value: (r) => plain(r.escrowBalanceCents) },
    { header: 'Originated', value: (r) => r.originationDate ?? '' },
    { header: 'Original principal', value: (r) => plain(r.originalPrincipalCents) },
    { header: 'Rate %', value: (r) => r.interestRatePct ?? '' },
    { header: 'Note about the document', value: (r) => r.documentNote ?? '' },
  ]);
}

/**
 * Everything transcribed from the CPA's own file, back out in the same shape.
 *
 * A round trip on purpose: what they sent, returned unchanged, with the source
 * note that says which document each figure came off.
 */
export async function cpaFiguresCsv(taxYear: number): Promise<string> {
  const [figures, properties, actors] = await Promise.all([
    listCpaFigures({ taxYear }),
    listProperties({ includeArchived: true }),
    listActors({ includeArchived: true }),
  ]);
  const propertyNames = new Map(properties.map((p) => [p.id, p.nickname]));
  const actorNames = new Map(actors.map((a) => [a.id, a.name]));

  return toCsv(figures, [
    {
      header: 'Property',
      value: (f) => (f.propertyId ? (propertyNames.get(f.propertyId) ?? '') : 'Whole portfolio'),
    },
    { header: 'Kind', value: (f) => f.kind.replace(/_/g, ' ') },
    { header: 'Label', value: (f) => f.label },
    { header: 'Amount', value: (f) => formatCentsPlain(f.amountCents) },
    { header: 'Schedule E line', value: (f) => (f.categoryId ? String(safeScheduleELine(f.categoryId)) : '') },
    { header: 'Category', value: (f) => (f.categoryId ? safeScheduleELabel(f.categoryId) : '') },
    { header: 'Recovery period', value: (f) => f.recoveryYears ?? '' },
    { header: 'Where it came from', value: (f) => f.sourceNote },
    { header: 'Entered by', value: (f) => actorNames.get(f.enteredByActorId) ?? '' },
    { header: 'Entered at', value: (f) => f.createdAt.toISOString() },
  ]);
}

/**
 * One row per job, with the rollup derived at export time under the report's
 * own year - so the same jobs exported for 2025 and 2026 answer differently,
 * and neither answer was stored.
 */
export async function jobsCsv(taxYear: number): Promise<string> {
  const [jobs, properties] = await Promise.all([
    listJobs({ limit: 500 }),
    listProperties({ includeArchived: true }),
  ]);
  const propertyNames = new Map(properties.map((p) => [p.id, p.nickname]));

  // One query set per job. There are tens of jobs, not thousands; if that ever
  // stops being true this is the single place to batch.
  const rows = [];
  for (const job of jobs) {
    const { rollup } = await getJobWithChildren(job.id, taxYear);
    rows.push({ job, rollup });
  }

  return toCsv(rows, [
    { header: 'Job', value: (r) => r.job.title },
    {
      header: 'Property',
      value: (r) =>
        r.job.propertyId ? (propertyNames.get(r.job.propertyId) ?? '') : 'Portfolio-wide',
    },
    { header: 'Records', value: (r) => String(r.rollup.recordCount) },
    { header: 'Hours total', value: (r) => r.rollup.totalHours.toFixed(2) },
    { header: 'Hours counting toward 250', value: (r) => r.rollup.eligibleHours.toFixed(2) },
    { header: 'Miles', value: (r) => r.rollup.totalMiles.toFixed(1) },
    { header: 'Miles - operating', value: (r) => r.rollup.operatingMiles.toFixed(1) },
    { header: 'Miles - acquisition', value: (r) => r.rollup.acquisitionMiles.toFixed(1) },
    { header: 'Invoiced', value: (r) => formatCentsPlain(r.rollup.invoicedCents) },
    { header: 'Paid in year', value: (r) => formatCentsPlain(r.rollup.paidInYearCents) },
    { header: 'Outstanding', value: (r) => formatCentsPlain(r.rollup.outstandingCents) },
    { header: 'Spend - operating', value: (r) => formatCentsPlain(r.rollup.operatingSpendCents) },
    { header: 'Spend - acquisition', value: (r) => formatCentsPlain(r.rollup.acquisitionSpendCents) },
    { header: 'Notes', value: (r) => r.job.notes ?? '' },
  ]);
}

/** Rent received, row by row. */
export async function incomeDetailCsv(taxYear: number): Promise<string> {
  const [receipts, properties] = await Promise.all([
    listRentReceipts({ taxYear, limit: 20_000 }),
    listProperties({ includeArchived: true }),
  ]);

  const propertyNames = new Map(properties.map((p) => [p.id, p.nickname]));
  const sorted = [...receipts].sort((a, b) => a.date.localeCompare(b.date));

  return toCsv(sorted, [
    { header: 'Date', value: (r) => r.date },
    { header: 'Property', value: (r) => propertyNames.get(r.propertyId) ?? '' },
    { header: 'Amount', value: (r) => formatCentsPlain(r.amountCents) },
    { header: 'Source', value: (r) => r.source.replace(/_/g, ' ') },
    { header: 'Notes', value: (r) => r.notes ?? '' },
    { header: 'Recorded at', value: (r) => r.createdAt.toISOString() },
  ]);
}

/**
 * Interest income, one row per account per year.
 *
 * A file of its own rather than a block on the Schedule E export, because this
 * income is not on Schedule E at all - it belongs on Schedule B, and a column
 * of it sitting under the rental figures is exactly how it would end up added
 * to them. The holder column names a person or a business and says which.
 */
export async function interestIncomeCsv(taxYear: number): Promise<string> {
  const [rows, accounts] = await Promise.all([
    listInterestYears({ taxYear }),
    listBankAccounts({ includeArchived: true }),
  ]);

  const byId = new Map(accounts.map((a) => [a.id, a]));
  const sorted = [...rows].sort((a, b) => {
    const left = byId.get(a.bankAccountId)?.bankName ?? '';
    const right = byId.get(b.bankAccountId)?.bankName ?? '';
    return left.localeCompare(right);
  });

  const money = (cents: number | null) => (cents === null ? '' : formatCentsPlain(cents));

  return toCsv(sorted, [
    { header: 'Bank', value: (r) => byId.get(r.bankAccountId)?.bankName ?? '' },
    { header: 'Account', value: (r) => byId.get(r.bankAccountId)?.label ?? '' },
    { header: 'Held by', value: (r) => byId.get(r.bankAccountId)?.holderLabel ?? '' },
    { header: 'Holder kind', value: (r) => byId.get(r.bankAccountId)?.holderKind ?? '' },
    { header: 'Tax year', value: (r) => String(r.taxYear) },
    { header: 'Interest - box 1', value: (r) => formatCentsPlain(r.interestCents) },
    { header: 'Tax-exempt interest - box 8', value: (r) => money(r.taxExemptInterestCents) },
    { header: 'Federal tax withheld - box 4', value: (r) => money(r.federalTaxWithheldCents) },
    {
      header: 'Early withdrawal penalty - box 2',
      value: (r) => money(r.earlyWithdrawalPenaltyCents),
    },
    { header: 'Savings bond interest - box 3', value: (r) => money(r.savingsBondInterestCents) },
    { header: 'Read from', value: (r) => safeInterestSourceLabel(r.documentSource) },
    { header: 'Note', value: (r) => r.documentNote ?? '' },
    { header: 'Recorded at', value: (r) => r.createdAt.toISOString() },
  ]);
}

/**
 * Charitable giving, one row per gift.
 *
 * Its own file for the same reason the interest is: this is Schedule A, and a
 * column of it sitting under the rental figures is exactly how it would end up
 * added to them.
 *
 * The last two columns are the ones the CPA actually reads. An amount without an
 * acknowledgment is not a deduction at $250 and up, so "Letter on file" is
 * exported as a plain Yes/No rather than being left implied by whether a file
 * happens to be attached - those are different facts, and only one of them is
 * the one the IRS asks about.
 */
export async function donationsCsv(taxYear: number): Promise<string> {
  const gifts = await listDonations({ taxYear });

  // Grouped by charity, oldest first within each. A CPA checking letters works
  // charity by charity, because that is how the letters arrive.
  const sorted = [...gifts].sort(
    (a, b) => a.charityName.localeCompare(b.charityName) || a.date.localeCompare(b.date),
  );

  return toCsv(sorted, [
    { header: 'Date', value: (r) => r.date },
    { header: 'Tax ID', value: (r) => r.charityTaxId ?? '' },
    { header: 'Name', value: (r) => r.charityName },
    { header: 'Amount', value: (r) => formatCentsPlain(r.amountCents) },
    { header: 'Kind', value: (r) => safeDonationKindLabel(r.kind) },
    { header: 'What was given', value: (r) => r.nonCashDescription ?? '' },
    { header: 'Letter on file', value: (r) => (r.acknowledgmentOnFile ? 'Yes' : 'No') },
    { header: 'File attached', value: (r) => (r.receiptKey ? 'Yes' : 'No') },
    { header: 'Note', value: (r) => r.note ?? '' },
    { header: 'Recorded at', value: (r) => r.createdAt.toISOString() },
  ]);
}

/**
 * The CPA hand-off.
 *
 * Ordered as the accountant reads them: the summary first, then the rows
 * behind it, then the facts that are not transactions at all.
 */
export const REPORTS = {
  'schedule-e': { label: 'Schedule E summary by property', build: scheduleECsv },
  'expense-detail': { label: 'Every expense, invoiced and paid', build: expenseDetailCsv },
  payments: { label: 'Every payment, including scheduled', build: paymentsCsv },
  'income-detail': { label: 'Rent received', build: incomeDetailCsv },
  'rent-reconciliation': { label: 'Rent banked against the 1099', build: rentReconciliationCsv },
  'time-log': { label: 'Time log', build: timeLogCsv },
  'mileage-log': { label: 'Mileage log', build: mileageLogCsv },
  jobs: { label: 'Jobs, rolled up', build: jobsCsv },
  contractors: { label: 'Contractor payments and W-9 status', build: contractorCsv },
  'loan-years': { label: 'Mortgage and escrow, from the 1098s', build: loanYearsCsv },
  'cpa-figures': { label: 'Figures your CPA sent back', build: cpaFiguresCsv },
  'property-facts': { label: 'Property facts and management history', build: propertyFactsCsv },
  // Last, and separate. Schedule B and Schedule A - nothing in these two files
  // belongs anywhere near the rental figures above them.
  'interest-income': { label: 'Interest income, from the 1099-INTs', build: interestIncomeCsv },
  'charitable-donations': {
    label: 'Charitable donations, for Schedule A',
    build: donationsCsv,
  },
} as const;

export type ReportId = keyof typeof REPORTS;

export function isReportId(value: string): value is ReportId {
  return Object.hasOwn(REPORTS, value);
}

function safeCategoryLabel(id: string): string {
  try {
    return getHourCategory(id).label;
  } catch {
    return id;
  }
}

/** Guarded: an id the picker no longer offers exports as blank, not a crash. */
function safeInterestSourceLabel(id: string | null): string {
  return id && interestSource.has(id) ? interestSource.get(id).label : '';
}

/** Guarded the same way, but exporting the raw id rather than blank - a gift's
    kind is never absent, so a value here that is not in the list is worth
    seeing rather than hiding. */
function safeDonationKindLabel(id: string): string {
  return donationKind.has(id) ? donationKind.get(id).label : id;
}

function safeCategory(id: string): { line: number; label: string } {
  try {
    const category = getScheduleECategory(id);
    return { line: category.line, label: category.label };
  } catch {
    return { line: 0, label: id };
  }
}

function safeReconciliationLabel(id: string): string {
  return RECONCILIATION_KINDS.find((k) => k.id === id)?.label ?? id;
}

/** An empty money box means "not recorded", which is not the same as zero. */
function plain(cents: number | null): string {
  return cents === null ? '' : formatCentsPlain(cents);
}

function asTreatment(value: string | null): 'operating' | 'acquisition' | null {
  return value === 'operating' || value === 'acquisition' ? value : null;
}

function safeScheduleELabel(id: string): string {
  try {
    return getScheduleECategory(id).label;
  } catch {
    return id;
  }
}

function safeScheduleELine(id: string): number | string {
  try {
    return getScheduleECategory(id).line;
  } catch {
    return '';
  }
}
