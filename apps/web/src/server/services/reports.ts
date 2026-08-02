import {
  allocateExpense,
  contractorW9Warnings,
  contractorYearTotals,
  formatCentsPlain,
  formatHoursDecimal,
  getHourCategory,
  getScheduleECategory,
  listScheduleECategories,
  rollUpHours,
  SCHEDULE_E_RENTS_RECEIVED_LINE,
  sumCents,
  toCsv,
  type AllocationRule,
  type ScheduleECategoryId,
} from '@rental/domain';
import { listExpenses } from './expenses';
import { listTimeEntries } from './timeEntries';
import { listTrips } from './trips';
import {
  listActors,
  listProperties,
  listRentReceipts,
  toDomainProperties,
} from './reference';

/**
 * Year-end reports (§7.6, §10).
 *
 * Everything here derives from the stored records; nothing is recomputed in a
 * way that could disagree with what the app showed during the year. Shared
 * expenses are expanded through the domain's allocation rule at report time,
 * so the per-property figures sum back to the parent amounts exactly.
 */

export interface ScheduleELine {
  line: number;
  categoryId: string;
  label: string;
  amountCents: number;
}

export interface SchedulePropertySummary {
  propertyId: string;
  nickname: string;
  address: string;
  rentsReceivedCents: number;
  expenseLines: ScheduleELine[];
  totalExpenseCents: number;
  netCents: number;
}

/** Per-property income and expenses grouped by Schedule E line (§10). */
export async function buildScheduleE(taxYear: number): Promise<SchedulePropertySummary[]> {
  const [properties, expenses, receipts] = await Promise.all([
    listProperties({ includeArchived: true }),
    listExpenses({ taxYear, limit: 10_000 }),
    listRentReceipts({ taxYear, limit: 10_000 }),
  ]);

  const domainProperties = toDomainProperties(properties);
  const byProperty = new Map<string, Map<string, number>>();
  for (const property of properties) byProperty.set(property.id, new Map());

  for (const expense of expenses) {
    // Expand the split. The parent record is untouched; these lines are derived
    // and reconcile to the penny.
    const lines = allocateExpense(
      expense.amountCents,
      expense.allocationRule as AllocationRule | null,
      domainProperties,
      expense.propertyId,
    );

    for (const line of lines) {
      const bucket = byProperty.get(line.propertyId);
      if (!bucket) continue; // allocated to a property that has since been removed
      bucket.set(
        expense.scheduleECategory,
        (bucket.get(expense.scheduleECategory) ?? 0) + line.amountCents,
      );
    }
  }

  const rentByProperty = new Map<string, number>();
  for (const receipt of receipts) {
    rentByProperty.set(
      receipt.propertyId,
      (rentByProperty.get(receipt.propertyId) ?? 0) + receipt.amountCents,
    );
  }

  return properties.map((property) => {
    const bucket = byProperty.get(property.id) ?? new Map<string, number>();
    const expenseLines = listScheduleECategories()
      .map((category) => ({
        line: category.line,
        categoryId: category.id as ScheduleECategoryId,
        label: category.label,
        amountCents: bucket.get(category.id) ?? 0,
      }))
      .filter((line) => line.amountCents !== 0);

    const totalExpenseCents = sumCents(expenseLines.map((l) => l.amountCents));
    const rentsReceivedCents = rentByProperty.get(property.id) ?? 0;

    return {
      propertyId: property.id,
      nickname: property.nickname,
      address: property.address,
      rentsReceivedCents,
      expenseLines,
      totalExpenseCents,
      netCents: rentsReceivedCents - totalExpenseCents,
    };
  });
}

export async function scheduleECsv(taxYear: number): Promise<string> {
  const summaries = await buildScheduleE(taxYear);

  interface Row {
    property: string;
    address: string;
    line: string;
    label: string;
    amount: number;
  }
  const rows: Row[] = [];

  for (const summary of summaries) {
    rows.push({
      property: summary.nickname,
      address: summary.address,
      line: String(SCHEDULE_E_RENTS_RECEIVED_LINE),
      label: 'Rents received',
      amount: summary.rentsReceivedCents,
    });
    for (const line of summary.expenseLines) {
      rows.push({
        property: summary.nickname,
        address: summary.address,
        line: String(line.line),
        label: line.label,
        amount: line.amountCents,
      });
    }
    rows.push({
      property: summary.nickname,
      address: summary.address,
      line: '',
      label: 'Total expenses',
      amount: summary.totalExpenseCents,
    });
  }

  return toCsv(rows, [
    { header: 'Property', value: (r) => r.property },
    { header: 'Address', value: (r) => r.address },
    { header: 'Schedule E line', value: (r) => r.line },
    { header: 'Description', value: (r) => r.label },
    { header: 'Amount', value: (r) => formatCentsPlain(r.amount) },
  ]);
}

/**
 * The time log (§10): date, hours, description, and person, per enterprise.
 *
 * Eligibility is a separate column rather than a filter, so the CPA sees the
 * whole log and the basis for every inclusion instead of a pre-filtered subset.
 */
export async function timeLogCsv(taxYear: number, enterpriseId?: string): Promise<string> {
  const [entries, actors, properties] = await Promise.all([
    listTimeEntries({ taxYear, enterpriseId, limit: 20_000 }),
    listActors({ includeArchived: true }),
    listProperties({ includeArchived: true }),
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
    { header: 'How recorded', value: (e) => e.source },
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
  const [trips, actors, properties] = await Promise.all([
    listTrips({ taxYear, limit: 20_000 }),
    listActors({ includeArchived: true }),
    listProperties({ includeArchived: true }),
  ]);

  const actorNames = new Map(actors.map((a) => [a.id, a.name]));
  const propertyNames = new Map(properties.map((p) => [p.id, p.nickname]));
  const sorted = [...trips].sort((a, b) => a.date.localeCompare(b.date));

  return toCsv(sorted, [
    { header: 'Date', value: (t) => t.date },
    { header: 'Driver', value: (t) => actorNames.get(t.actorId) ?? 'Unattributed' },
    { header: 'Start', value: (t) => t.origin },
    { header: 'Destination', value: (t) => t.destination },
    { header: 'Miles', value: (t) => Number(t.miles).toFixed(1) },
    { header: 'Business purpose', value: (t) => t.purpose },
    { header: 'Property', value: (t) => (t.propertyId ? propertyNames.get(t.propertyId) ?? '' : '') },
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

/** Every expense as recorded, for the CPA who wants the underlying rows. */
export async function expenseDetailCsv(taxYear: number): Promise<string> {
  const [expenses, properties, actors] = await Promise.all([
    listExpenses({ taxYear, limit: 20_000 }),
    listProperties({ includeArchived: true }),
    listActors({ includeArchived: true }),
  ]);

  const propertyNames = new Map(properties.map((p) => [p.id, p.nickname]));
  const actorNames = new Map(actors.map((a) => [a.id, a.name]));
  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date));

  return toCsv(sorted, [
    { header: 'Date', value: (e) => e.date },
    { header: 'Vendor', value: (e) => e.vendor },
    { header: 'Amount', value: (e) => formatCentsPlain(e.amountCents) },
    { header: 'Schedule E line', value: (e) => String(safeScheduleELine(e.scheduleECategory)) },
    { header: 'Category', value: (e) => safeScheduleELabel(e.scheduleECategory) },
    {
      header: 'Property',
      value: (e) => (e.propertyId ? propertyNames.get(e.propertyId) ?? '' : 'Split'),
    },
    {
      header: 'Repair or improvement',
      value: (e) => e.capitalClassification ?? 'Not answered',
    },
    { header: 'Contractor', value: (e) => (e.contractorActorId ? actorNames.get(e.contractorActorId) ?? '' : '') },
    { header: 'Receipt on file', value: (e) => (e.receiptKey ? 'Yes' : 'No') },
    { header: 'Entered by', value: (e) => actorNames.get(e.actorId) ?? '' },
    { header: 'Notes', value: (e) => e.notes ?? '' },
    { header: 'Recorded at', value: (e) => e.createdAt.toISOString() },
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

export const REPORTS = {
  'schedule-e': { label: 'Schedule E summary by property', build: scheduleECsv },
  'time-log': { label: 'Time log', build: timeLogCsv },
  'mileage-log': { label: 'Mileage log', build: mileageLogCsv },
  contractors: { label: 'Contractor payments and W-9 status', build: contractorCsv },
  'expense-detail': { label: 'Every expense', build: expenseDetailCsv },
  'income-detail': { label: 'Rent received', build: incomeDetailCsv },
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
