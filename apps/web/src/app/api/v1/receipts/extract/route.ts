import { createHash } from 'node:crypto';
import { z } from 'zod';
import { todayInZone } from '@rental/domain';
import { env } from '@/env';
import { assertReadToken, getReceiptBytes } from '@/lib/s3';
import { jsonBody, ok, route } from '@/server/http';
import { extractReceipt } from '@/server/services/extraction';
import { findExactDuplicate, findLikelyDuplicate } from '@/server/services/receiptMatches';

/**
 * Reads a just-uploaded receipt and reports what it says.
 *
 * Runs inline rather than on a queue. The person is standing at the form
 * waiting for the answer, so there is nothing to be gained by handing the work
 * to a worker and polling for it - and a queue would be the first piece of
 * background infrastructure in the app, added for one call that takes a few
 * seconds.
 */

// Comfortably over a slow read of a multi-page PDF, and under Vercel's ceiling.
export const maxDuration = 60;

const schema = z.object({
  key: z.string().min(1).max(500),
  readToken: z.string().min(1).max(200),
  propertyId: z.string().uuid().nullable().optional().default(null),
  /** Set when re-reading a receipt on an expense that already exists. */
  expenseId: z.string().uuid().nullable().optional().default(null),
  /**
   * Whether the model is wanted at all.
   *
   * `attach` is the correction case: an invoice or a payment being fixed months
   * later already has its figures, entered or checked by the owner, and the
   * document arriving now is evidence for them rather than a source for them.
   * Reading it there would offer to overwrite a considered number with a guess,
   * which is the wrong direction of authority - and it would bill for the
   * privilege every time somebody swaps a blurred photo.
   *
   * The hash is still computed and the duplicate check still runs. Neither
   * involves the model, and both are worth having on every path: the hash is
   * what the record stores, and attaching a receipt that is already on another
   * expense is worth saying out loud whichever screen you are on.
   */
  mode: z.enum(['read', 'attach']).optional().default('read'),
});

export const POST = route(async (_user, request) => {
  const input = schema.parse(await jsonBody(request));

  // The key alone is not authority to read. See assertReadToken.
  assertReadToken(input.key, input.readToken);

  const { bytes, contentType } = await getReceiptBytes(input.key);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  // Asked before the model, not after: the same file uploaded twice is settled
  // by the hash, and there is no point paying to read a receipt we have already
  // read once.
  const exact = await findExactDuplicate(sha256, input.expenseId);
  if (exact) {
    return ok({ sha256, extraction: { status: 'skipped', reason: 'duplicate' }, duplicate: exact });
  }

  if (input.mode === 'attach') {
    return ok({
      sha256,
      extraction: { status: 'skipped', reason: 'not_requested' },
      duplicate: null,
    });
  }

  const result = await extractReceipt({
    bytes,
    contentType,
    today: todayInZone(env.timeZone),
  });

  const duplicate =
    result.status === 'extracted'
      ? await findLikelyDuplicate({
          amountCents: result.extracted.amountCents,
          date: result.extracted.date,
          vendor: result.extracted.vendor,
          propertyId: input.propertyId,
          excludeExpenseId: input.expenseId,
        })
      : null;

  return ok({ sha256, extraction: result, duplicate });
});
