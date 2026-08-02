import { z } from 'zod';
import { presignReceiptUpload } from '@/lib/s3';
import { jsonBody, ok, route } from '@/server/http';

const schema = z.object({
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  filename: z.string().max(300).optional(),
});

/**
 * Hands back a short-lived URL the client PUTs the image to directly.
 * The returned `key` is what gets stored on the expense - the signed URL
 * expires and must never be persisted.
 */
export const POST = route(async (_user, request) => {
  const input = schema.parse(await jsonBody(request));
  return ok(await presignReceiptUpload(input));
});
