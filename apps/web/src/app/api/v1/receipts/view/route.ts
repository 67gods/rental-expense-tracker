import { presignReceiptView } from '@/lib/s3';
import { query, route } from '@/server/http';
import { ValidationError } from '@/server/errors';
import { resolveReceipt } from '@/server/services/receipts';

/**
 * Opens or downloads a stored receipt.
 *
 * A redirect rather than a proxy: the app hands back a short-lived signed URL
 * and the browser fetches the bytes from S3 itself, the same shape as the
 * upload. Streaming a 12MB photo back through a serverless function to reach a
 * browser has the same timeout risk in this direction as the other.
 *
 * The redirect is what makes the link durable. The signed URL expires in
 * minutes, so a URL baked into the page would be dead by the time anyone
 * clicked it on a page left open over lunch; this one is signed on the click.
 */
export const GET = route(async (_user, request) => {
  const q = query(request);
  const key = q.string('key');
  if (!key) throw new ValidationError('Which receipt? The key is missing.');

  const receipt = await resolveReceipt(key);
  const url = await presignReceiptView(receipt.key, {
    expiresIn: 300,
    disposition: q.boolean('download') ? 'attachment' : 'inline',
    filename: receipt.filename,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      // The signed URL is single-use in practice and short-lived. A cached
      // redirect outlives it and the next click 403s.
      'Cache-Control': 'no-store',
    },
  });
});
