import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { expensePayments, expenses } from '@/db/schema';
import { NotFoundError } from '../errors';

/**
 * Reading a receipt back out of storage.
 *
 * The bucket is private and the app holds the only credentials, so every read
 * goes through here to get a signed URL. That makes this the choke point where
 * the key has to be justified: an object key is not a capability, and a signed
 * request for `receipts/2025/03/<uuid>.jpg` is indistinguishable from a signed
 * request for anything else in the bucket. So a key is only honoured when some
 * record actually claims it, which keeps a logged-in session from walking the
 * bucket by guessing paths.
 */

export interface ReceiptRef {
  key: string;
  /** What the file should be called once it is on disk. */
  filename: string;
}

/**
 * Resolves a stored key to the record that owns it.
 *
 * Both expenses and payments carry a receipt, and the caller does not
 * necessarily know which one it is looking at - the key travels alone in a
 * link. Checking both is cheaper than making the link say.
 */
export async function resolveReceipt(key: string): Promise<ReceiptRef> {
  const db = getDb();

  const [expense] = await db
    .select({ vendor: expenses.vendor, date: expenses.date })
    .from(expenses)
    .where(eq(expenses.receiptKey, key))
    .limit(1);

  if (expense) {
    return { key, filename: nameFor(expense.vendor, expense.date, key) };
  }

  const [payment] = await db
    .select({ paidDate: expensePayments.paidDate, expenseId: expensePayments.expenseId })
    .from(expensePayments)
    .where(eq(expensePayments.receiptKey, key))
    .limit(1);

  if (payment) {
    const [parent] = await db
      .select({ vendor: expenses.vendor })
      .from(expenses)
      .where(eq(expenses.id, payment.expenseId))
      .limit(1);
    return { key, filename: nameFor(parent?.vendor ?? 'payment', payment.paidDate, key) };
  }

  // Deliberately the same answer as a key that was never uploaded. Whether an
  // object exists in the bucket is not something an unowned key should reveal.
  throw new NotFoundError('That receipt is not attached to anything.');
}

/**
 * `Home Depot` + `2025-03-14` -> `home-depot-2025-03-14.jpg`.
 *
 * A folder of receipts named by their UUIDs is unusable at tax time, and the
 * CPA gets these as attachments.
 */
function nameFor(vendor: string, date: string, key: string): string {
  const slug =
    vendor
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'receipt';
  const extension = key.match(/\.[a-z0-9]{1,5}$/i)?.[0]?.toLowerCase() ?? '';
  return `${slug}-${date}${extension}`;
}
