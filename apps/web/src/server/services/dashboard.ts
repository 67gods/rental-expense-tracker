import {
  contractorW9Warnings,
  contractorYearTotals,
  safeHarborProgress,
  sumCents,
  type ContractorWarning,
  type ContractorYearTotal,
  type SafeHarborProgress,
} from '@rental/domain';
import { countNeedsReview, listExpenses } from './expenses';
import { countProvisionalEntries, listTimeEntries } from './timeEntries';
import { excludedPropertyIds, listContractors, listRentReceipts } from './reference';

/**
 * Everything the dashboard shows (§7.1), assembled in one place so the page is
 * a rendering concern rather than a calculation one.
 */
export interface DashboardData {
  /** Carries total and eligible together - they are never merged (§10). */
  hours: SafeHarborProgress;
  ytdExpenseCents: number;
  ytdIncomeCents: number;
  needsReviewCount: number;
  provisionalCount: number;
  w9Warnings: ContractorWarning[];
  contractorTotals: ContractorYearTotal[];
  excludedPropertyIds: string[];
  taxYear: number;
}

export async function getDashboardData(
  enterpriseId: string,
  taxYear: number,
  asOf: Date = new Date(),
): Promise<DashboardData> {
  const [entries, expenseRows, rentRows, contractors, excluded] = await Promise.all([
    listTimeEntries({ enterpriseId, taxYear, limit: 5000 }),
    listExpenses({ taxYear, limit: 5000 }),
    listRentReceipts({ taxYear, limit: 5000 }),
    listContractors(),
    excludedPropertyIds(enterpriseId),
  ]);

  const hours = safeHarborProgress(
    entries.map((e) => ({
      minutes: e.minutes,
      category: e.category,
      shEligible: e.shEligible,
      isProvisional: e.isProvisional,
      actorId: e.actorId,
      propertyId: e.propertyId,
      date: e.date,
    })),
    taxYear,
    { excludedPropertyIds: excluded },
  );

  const contractorTotals = contractorYearTotals(
    expenseRows.map((e) => ({
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

  const [needsReviewCount, provisionalCount] = await Promise.all([
    countNeedsReview(taxYear),
    countProvisionalEntries(enterpriseId, taxYear),
  ]);

  return {
    hours,
    ytdExpenseCents: sumCents(expenseRows.map((e) => e.amountCents)),
    ytdIncomeCents: sumCents(rentRows.map((r) => r.amountCents)),
    needsReviewCount,
    provisionalCount,
    w9Warnings: contractorW9Warnings(contractorTotals, asOf, taxYear),
    contractorTotals,
    excludedPropertyIds: excluded,
    taxYear,
  };
}
