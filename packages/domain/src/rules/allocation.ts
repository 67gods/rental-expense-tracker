/**
 * Shared-expense allocation (brief §6).
 *
 * An insurance or umbrella policy premium covers several properties. The
 * expense record stays whole - one payment, one receipt, one vendor - and the
 * split is derived from `allocation_rule` at report time. Writing five child
 * expenses instead would leave nothing to reconcile the receipt against.
 */

import { distributeCents, MoneyError } from '../money';
import type { DomainProperty } from '../types';

export type AllocationRuleType = 'equal' | 'basis' | 'ownership' | 'custom';

export type AllocationRule =
  /** Split evenly across the listed properties. */
  | { type: 'equal'; propertyIds: string[] }
  /** Split in proportion to each property's unadjusted basis. */
  | { type: 'basis'; propertyIds: string[] }
  /** Split in proportion to ownership percentage. */
  | { type: 'ownership'; propertyIds: string[] }
  /** Split by explicit percentages that must total 100. */
  | { type: 'custom'; shares: { propertyId: string; pct: number }[] };

export interface AllocationLine {
  propertyId: string;
  amountCents: number;
  /** Share of the parent amount, to two decimals. For display and export. */
  pct: number;
}

export class AllocationError extends Error {
  override readonly name = 'AllocationError';
}

/** Percentages must total 100 within this tolerance before rounding. */
const PCT_TOLERANCE = 0.01;

/**
 * Splits a parent expense into per-property lines that sum to exactly the
 * parent amount.
 *
 * The parent record is never modified. Callers render these lines; they do not
 * persist them as expenses.
 */
export function allocateExpense(
  amountCents: number,
  rule: AllocationRule | null | undefined,
  properties: readonly Pick<DomainProperty, 'id' | 'unadjustedBasisCents' | 'ownershipPct' | 'nickname'>[],
  fallbackPropertyId?: string | null,
): AllocationLine[] {
  if (!Number.isInteger(amountCents)) {
    throw new AllocationError(`Expected integer cents, received: ${amountCents}`);
  }

  // No rule means the expense belongs entirely to its own property.
  if (!rule) {
    if (!fallbackPropertyId) {
      throw new AllocationError(
        'An expense with no allocation rule must belong to a property.',
      );
    }
    return [{ propertyId: fallbackPropertyId, amountCents, pct: 100 }];
  }

  const byId = new Map(properties.map((p) => [p.id, p]));

  if (rule.type === 'custom') {
    if (rule.shares.length === 0) {
      throw new AllocationError('A custom split needs at least one property.');
    }
    const totalPct = rule.shares.reduce((sum, s) => sum + s.pct, 0);
    if (Math.abs(totalPct - 100) > PCT_TOLERANCE) {
      throw new AllocationError(
        `Custom split percentages add up to ${totalPct.toFixed(2)}%. They must total 100%.`,
      );
    }
    for (const share of rule.shares) {
      if (share.pct < 0) {
        throw new AllocationError('Split percentages cannot be negative.');
      }
      assertKnownProperty(byId, share.propertyId);
    }
    return buildLines(
      amountCents,
      rule.shares.map((s) => s.propertyId),
      rule.shares.map((s) => s.pct),
    );
  }

  if (rule.propertyIds.length === 0) {
    throw new AllocationError('A shared expense needs at least one property.');
  }
  for (const id of rule.propertyIds) assertKnownProperty(byId, id);

  const weights = rule.propertyIds.map((id) => {
    const property = byId.get(id);
    /* c8 ignore next -- assertKnownProperty above guarantees this is defined */
    if (!property) throw new AllocationError(`Unknown property: ${id}`);

    switch (rule.type) {
      case 'equal':
        return 1;
      case 'basis':
        return property.unadjustedBasisCents;
      case 'ownership':
        return property.ownershipPct;
    }
  });

  if (weights.every((w) => w === 0)) {
    const what = rule.type === 'basis' ? 'unadjusted basis' : 'ownership percentage';
    throw new AllocationError(
      `Cannot split by ${what}: every selected property has a ${what} of zero. Fill those in on the property records, or use an even split.`,
    );
  }

  return buildLines(amountCents, rule.propertyIds, weights);
}

function buildLines(
  amountCents: number,
  propertyIds: readonly string[],
  weights: readonly number[],
): AllocationLine[] {
  let amounts: number[];
  try {
    amounts = distributeCents(amountCents, weights);
  } catch (error) {
    if (error instanceof MoneyError) throw new AllocationError(error.message);
    /* c8 ignore next */
    throw error;
  }

  return propertyIds.map((propertyId, index) => {
    const cents = amounts[index] ?? 0;
    return {
      propertyId,
      amountCents: cents,
      pct:
        amountCents === 0 ? 0 : Math.round((cents / amountCents) * 10_000) / 100,
    };
  });
}

function assertKnownProperty(
  byId: ReadonlyMap<string, unknown>,
  propertyId: string,
): void {
  if (!byId.has(propertyId)) {
    throw new AllocationError(
      `Split refers to a property that does not exist: ${propertyId}`,
    );
  }
}

/**
 * Describes a rule in one line for the expense list, so a shared expense is
 * recognisable without opening it.
 */
export function describeAllocationRule(
  rule: AllocationRule | null | undefined,
  propertyNames: ReadonlyMap<string, string>,
): string {
  if (!rule) return 'Single property';

  const names = (ids: readonly string[]) =>
    ids.map((id) => propertyNames.get(id) ?? 'Unknown').join(', ');

  switch (rule.type) {
    case 'equal':
      return `Split evenly across ${rule.propertyIds.length} properties: ${names(rule.propertyIds)}`;
    case 'basis':
      return `Split by unadjusted basis across ${rule.propertyIds.length} properties: ${names(rule.propertyIds)}`;
    case 'ownership':
      return `Split by ownership share across ${rule.propertyIds.length} properties: ${names(rule.propertyIds)}`;
    case 'custom':
      return `Custom split: ${rule.shares
        .map((s) => `${propertyNames.get(s.propertyId) ?? 'Unknown'} ${s.pct}%`)
        .join(', ')}`;
  }
}

/**
 * True once an expense has neither a property nor a split rule - a
 * portfolio-wide expense logged before anyone decided how to divide it (§6).
 *
 * It cannot be placed on Schedule E, which is filed per property, so callers
 * building the ledger exclude it rather than calling `allocateExpense` and
 * hitting `AllocationError`. It surfaces instead as a review item, the same
 * way an unanswered repair-or-improvement question does.
 */
export function needsPropertyOrSplit(
  propertyId: string | null | undefined,
  allocationRule: AllocationRule | null | undefined,
): boolean {
  return propertyId == null && allocationRule == null;
}

/** Every property an expense touches, whether directly or through a split. */
export function propertiesTouchedBy(
  rule: AllocationRule | null | undefined,
  fallbackPropertyId?: string | null,
): string[] {
  if (!rule) return fallbackPropertyId ? [fallbackPropertyId] : [];
  return rule.type === 'custom'
    ? rule.shares.map((s) => s.propertyId)
    : [...rule.propertyIds];
}
