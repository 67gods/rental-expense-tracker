import { daysBetween, formatDateShort } from '@rental/domain';
import type { CaptureHints } from '@/server/services/expenses';

/**
 * Property tiles, labelled with when each was last spent against.
 *
 * The recency line is the whole point of the tile layout. Four nicknames tell
 * you nothing you did not already know; four nicknames where one says "used
 * today" tell you which one you are almost certainly about to pick, without
 * picking it for you. Getting this wrong is expensive in a way a mistyped
 * vendor is not - an expense filed against the wrong property is wrong on two
 * Schedule Es and looks correct on both.
 */
export interface PropertyOption {
  id: string;
  label: string;
  hint?: string;
}

export function propertyOptions(
  properties: readonly { id: string; nickname: string }[],
  hints: CaptureHints,
  today: string,
): PropertyOption[] {
  return properties.map((property) => ({
    id: property.id,
    label: property.nickname,
    hint: lastUsedLabel(hints.lastUsedByProperty[property.id], today),
  }));
}

function lastUsedLabel(lastUsed: string | undefined, today: string): string {
  if (!lastUsed) return 'Nothing logged yet';

  // A backdated entry can sit ahead of today's date; it is still the last thing
  // recorded, and "used in -2 days" is not a sentence.
  const days = Math.max(0, daysBetween(lastUsed, today));
  if (days === 0) return 'Used today';
  if (days === 1) return 'Used yesterday';
  if (days <= 30) return `Used ${days} days ago`;
  return `Last used ${formatDateShort(lastUsed)}`;
}
