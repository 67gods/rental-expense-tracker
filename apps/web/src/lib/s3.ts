import { randomUUID } from 'node:crypto';
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

  return { uploadUrl, key, expiresInSeconds: 900 };
}

/**
 * A short-lived URL for viewing a stored receipt. The bucket stays private -
 * these are tax records, and a guessable public URL is not an access model.
 */
export async function presignReceiptView(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: env.s3Bucket, Key: key }),
    { expiresIn },
  );
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
