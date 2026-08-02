/**
 * Money handling.
 *
 * Every amount in this system is an integer number of cents. Floating point
 * dollars are never stored, never summed, and never split. Reports have to
 * reconcile to the penny against receipts and bank records.
 */

export class MoneyError extends Error {
  override readonly name = 'MoneyError';
}

/**
 * Parses a user-typed amount into integer cents.
 *
 * Accepts "1234.56", "1,234.56", "$1,234.56", " 1234 ", and plain numbers.
 * Rejects anything else rather than guessing - a silently misparsed amount is
 * worse than a rejected one.
 */
export function parseAmountToCents(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new MoneyError(`Amount is not a finite number: ${input}`);
    }
    return roundHalfUp(input * 100);
  }

  const cleaned = input.trim().replace(/[$\s,]/g, '');
  if (cleaned === '') {
    throw new MoneyError('Amount is required.');
  }
  if (!/^-?\d*(\.\d+)?$/.test(cleaned) || cleaned === '-' || cleaned === '.') {
    throw new MoneyError(`Amount is not a valid number: "${input}"`);
  }
  const asNumber = Number(cleaned);
  if (!Number.isFinite(asNumber)) {
    throw new MoneyError(`Amount is not a valid number: "${input}"`);
  }
  return roundHalfUp(asNumber * 100);
}

/**
 * Rounds to the nearest integer, with .5 always going away from zero.
 * JavaScript's Math.round sends -0.5 to -0, which would drift a refund by a
 * penny. Money rounding has to be symmetric.
 */
export function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Formats cents as US currency, e.g. 123456 -> "$1,234.56". */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

/** Formats cents as a bare decimal for CSV export, e.g. 123456 -> "1234.56". */
export function formatCentsPlain(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Sums cents, guarding against the NaN that a single bad record would spread. */
export function sumCents(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isInteger(value)) {
      throw new MoneyError(`Expected integer cents, received: ${value}`);
    }
    total += value;
  }
  return total;
}

/**
 * Splits an integer amount across weighted buckets so the parts sum back to
 * exactly the original amount.
 *
 * Uses the largest-remainder method: floor every share, then hand the leftover
 * pennies to the buckets with the largest fractional remainders. Naive rounding
 * loses or invents pennies, which shows up as an unexplained variance in a
 * Schedule E total.
 */
export function distributeCents(
  totalCents: number,
  weights: readonly number[],
): number[] {
  if (!Number.isInteger(totalCents)) {
    throw new MoneyError(`Expected integer cents, received: ${totalCents}`);
  }
  if (weights.length === 0) {
    throw new MoneyError('Cannot split an amount across zero buckets.');
  }
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new MoneyError('Split weights must be finite and non-negative.');
  }

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) {
    throw new MoneyError('Split weights must add up to more than zero.');
  }

  const sign = totalCents < 0 ? -1 : 1;
  const magnitude = Math.abs(totalCents);

  const exact = weights.map((w) => (magnitude * w) / totalWeight);
  const floors = exact.map((v) => Math.floor(v));
  let remaining = magnitude - floors.reduce((a, b) => a + b, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  const result = [...floors];
  for (const { index } of byRemainder) {
    if (remaining <= 0) break;
    result[index] = (result[index] ?? 0) + 1;
    remaining -= 1;
  }

  return result.map((v) => v * sign);
}
