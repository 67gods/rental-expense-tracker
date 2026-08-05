import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@/env';
import { ValidationError } from '@/server/errors';

/**
 * Receipt storage (§8.3: receipt images stored durably alongside the expense).
 *
 * The browser uploads straight to S3 with a presigned URL rather than routing
 * the image through the app. A 10MB photo taken in a hardware store aisle does
 * not need to pass through a serverless function to get where it is going.
 */

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
]);

let client: S3Client | null = null;

function getClient(): S3Client {
  client ??= new S3Client({
    region: env.awsRegion,
    credentials: {
      accessKeyId: env.awsAccessKeyId,
      secretAccessKey: env.awsSecretAccessKey,
    },
  });
  return client;
}

export interface PresignedUpload {
  /** PUT the file here with the same Content-Type. */
  uploadUrl: string;
  /** Store this on the expense record. Never store the signed URL - it expires. */
  key: string;
  /**
   * Proof that this key came from a presign of ours. Required to read the
   * object back before it belongs to a record. Never stored.
   */
  readToken: string;
  expiresInSeconds: number;
}

export async function presignReceiptUpload(input: {
  contentType: string;
  sizeBytes: number;
  filename?: string;
}): Promise<PresignedUpload> {
  if (!ALLOWED_TYPES.has(input.contentType)) {
    throw new ValidationError(
      'Receipts can be a photo (JPEG, PNG, WebP, HEIC) or a PDF. That file is neither.',
    );
  }
  if (input.sizeBytes > MAX_BYTES) {
    throw new ValidationError(
      `That file is ${(input.sizeBytes / 1024 / 1024).toFixed(1)}MB. The limit is 12MB - most phone cameras have a setting to reduce this.`,
    );
  }

  // Date-prefixed so the bucket stays browsable by hand, and random so two
  // receipts photographed in the same second cannot collide.
  const now = new Date();
  const extension = extensionFor(input.contentType, input.filename);
  const key = `receipts/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}${extension}`;

  const uploadUrl = await getSignedUrl(
    getClient(),
    new PutObjectCommand({
      Bucket: env.s3Bucket,
      Key: key,
      ContentType: input.contentType,
      ContentLength: input.sizeBytes,
    }),
    { expiresIn: 900 },
  );

  return { uploadUrl, key, readToken: readTokenFor(key), expiresInSeconds: 900 };
}

/**
 * A token that says "this app issued this key".
 *
 * resolveReceipt refuses any key no record claims, which is the right rule for
 * viewing but locks out the one moment reading is needed: between the upload
 * finishing and the expense being saved, the object belongs to nothing. This
 * token fills exactly that gap, and nothing wider - it is minted only by a
 * presign, so a key that was guessed rather than issued cannot carry one.
 *
 * AUTH_SECRET is already the app's signing key for sessions, so there is no
 * second secret to configure or rotate.
 */
function readTokenFor(key: string): string {
  return createHmac('sha256', env.authSecret).update(`receipt-read:${key}`).digest('hex');
}

/** Throws unless the token is the one `readTokenFor` would have minted. */
export function assertReadToken(key: string, token: string): void {
  const expected = Buffer.from(readTokenFor(key), 'utf8');
  const actual = Buffer.from(token, 'utf8');
  // Length is checked first because timingSafeEqual throws on a mismatch, and
  // the length of a hex digest is not a secret.
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new ValidationError('That receipt cannot be read.');
  }
}

export interface ReceiptBytes {
  bytes: Buffer;
  contentType: string;
}

/**
 * Pulls a stored receipt back into memory.
 *
 * Server-side rather than re-reading the file the browser already holds: the
 * bytes in the bucket are what every later reader sees, so they are what the
 * hash and the extraction have to be computed from.
 */
export async function getReceiptBytes(key: string): Promise<ReceiptBytes> {
  const response = await getClient().send(
    new GetObjectCommand({ Bucket: env.s3Bucket, Key: key }),
  );

  const body = response.Body;
  if (!body) throw new ValidationError('That receipt is empty.');

  return {
    bytes: Buffer.from(await body.transformToByteArray()),
    contentType: response.ContentType ?? 'application/octet-stream',
  };
}

/**
 * A short-lived URL for viewing a stored receipt. The bucket stays private -
 * these are tax records, and a guessable public URL is not an access model.
 *
 * `disposition: 'attachment'` asks S3 to set Content-Disposition on the
 * response, which is the only way to make a browser save a JPEG rather than
 * render it. A `download` attribute on the anchor cannot do it here: the href
 * points at another origin, and cross-origin downloads ignore the hint.
 */
export async function presignReceiptView(
  key: string,
  options: {
    expiresIn?: number;
    disposition?: 'inline' | 'attachment';
    /** What the saved file is called. Defaults to the key's last segment. */
    filename?: string;
  } = {},
): Promise<string> {
  const { expiresIn = 3600, disposition = 'inline', filename } = options;
  const name = sanitizeFilename(filename ?? key.split('/').pop() ?? 'receipt');

  return getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: env.s3Bucket,
      Key: key,
      ResponseContentDisposition: `${disposition}; filename="${name}"`,
    }),
    { expiresIn },
  );
}

/**
 * Content-Disposition is a header, so a quote or a newline in the name would
 * end the header early. Vendor names reach this from free text.
 */
function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^\w.\- ]+/g, '_').slice(0, 120);
  return cleaned.trim() || 'receipt';
}

function extensionFor(contentType: string, filename?: string): string {
  const fromName = filename?.match(/\.[a-z0-9]{1,5}$/i)?.[0];
  if (fromName) return fromName.toLowerCase();

  switch (contentType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/heic':
      return '.heic';
    case 'application/pdf':
      return '.pdf';
    default:
      return '';
  }
}
