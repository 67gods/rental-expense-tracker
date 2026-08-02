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
  let text: string;

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new MoneyError(`Amount is not a finite number: ${input}`);
    }
    // Anything below half a cent is zero, which also sidesteps the exponential
    // notation String() produces for very small numbers.
    if (Math.abs(input) < 0.005) return 0;
    text = String(input);
    if (text.includes('e') || text.includes('E')) {
      throw new MoneyError(`Amount is too large to record precisely: ${input}`);
    }
  } else {
    text = input.trim().replace(/[$\s,]/g, '');
  }

  if (text === '') {
    throw new MoneyError('Amount is required.');
  }
  if (!/^-?\d*(\.\d+)?$/.test(text) || text === '-' || text === '.' || text === '-.') {
    throw new MoneyError(`Amount is not a valid number: "${input}"`);
  }

  return decimalStringToCents(text);
}

/**
 * Converts a decimal string to cents using integer arithmetic on the digits.
 *
 * Never multiplies the dollar value by 100. In binary floating point, 1.005
 * is stored as 1.00499999999999989, so `1.005 * 100` rounds down to $1.00 and
 * the receipt no longer matches the ledger. Reading the digits avoids the
 * representation entirely.
 */
function decimalStringToCents(text: string): number {
  const isNegative = text.startsWith('-');
  const unsigned = isNegative ? text.slice(1) : text;
  const [wholePart = '', fractionPart = ''] = unsigned.split('.');

  const whole = wholePart === '' ? 0 : Number(wholePart);
  // Pad to three digits so the third is available as the rounding digit.
  const padded = `${fractionPart}000`.slice(0, 3);
  const cents = Number(padded.slice(0, 2));
  const roundingDigit = Number(padded[2]);

  let total = whole * 100 + cents;
  if (roundingDigit >= 5) total += 1; // half away from zero

  if (!Number.isSafeInteger(total)) {
    throw new MoneyError(`Amount is too large to record precisely: "${text}"`);
  }

  return isNegative ? -total : total;
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
