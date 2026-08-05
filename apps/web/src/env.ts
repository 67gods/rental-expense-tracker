/**
 * Validated environment contract.
 *
 * Missing configuration fails at first use with a sentence that says what to
 * do, rather than surfacing as a null pointer three screens into the app.
 * Validation is lazy so `next build` succeeds without secrets present - Vercel
 * builds before environment variables are bound at runtime.
 */

class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

function required(name: string, hint: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '' || value.startsWith('replace-me')) {
    throw new ConfigError(
      `${name} is not set. ${hint} See .env.example and the setup steps in README.md.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

export const env = {
  get databaseUrl(): string {
    return required('DATABASE_URL', 'This is the pooled Neon connection string.');
  },

  /** Migrations need a direct connection; the pooler does not support them. */
  get databaseUrlUnpooled(): string {
    return (
      process.env.DATABASE_URL_UNPOOLED ??
      required('DATABASE_URL', 'This is the Neon connection string.')
    );
  },

  get authSecret(): string {
    return required('AUTH_SECRET', 'Generate one with: npx auth secret');
  },

  get googleClientId(): string {
    return required('AUTH_GOOGLE_ID', 'From your Google Cloud OAuth client.');
  },

  get googleClientSecret(): string {
    return required('AUTH_GOOGLE_SECRET', 'From your Google Cloud OAuth client.');
  },

  /**
   * The only Google accounts allowed in. Two users, one household (§3) - this
   * list is the whole access control model, so an empty one locks everybody out
   * rather than letting everybody in.
   */
  get allowedEmails(): string[] {
    const raw = required(
      'ALLOWED_EMAILS',
      'List the Google accounts allowed to sign in, comma separated.',
    );
    const emails = raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (emails.length === 0) {
      throw new ConfigError(
        'ALLOWED_EMAILS is set but empty. Nobody would be able to sign in.',
      );
    }
    return emails;
  },

  get awsRegion(): string {
    return required('AWS_REGION', 'The region your receipts bucket lives in.');
  },

  get s3Bucket(): string {
    return required('AWS_S3_BUCKET', 'The bucket receipts are stored in.');
  },

  get awsAccessKeyId(): string {
    return required('AWS_ACCESS_KEY_ID', 'From the IAM user for this app.');
  },

  get awsSecretAccessKey(): string {
    return required('AWS_SECRET_ACCESS_KEY', 'From the IAM user for this app.');
  },

  get anthropicApiKey(): string {
    return required('ANTHROPIC_API_KEY', 'From console.anthropic.com. Reads uploaded receipts.');
  },

  /**
   * Every business date is anchored to this zone. Changing it after data exists
   * would move entries near midnight between days, so it is set once at setup.
   */
  get timeZone(): string {
    return optional('APP_TIMEZONE', 'America/New_York');
  },

  /** True when receipt storage is configured. The app degrades without it. */
  get hasS3(): boolean {
    return Boolean(
      process.env.AWS_S3_BUCKET &&
        process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY &&
        !process.env.AWS_ACCESS_KEY_ID.startsWith('replace-me'),
    );
  },

  /**
   * True when receipts can be read automatically.
   *
   * Deliberately a separate flag from `hasS3`: reading is an accelerator on top
   * of storing, and an unset key has to leave the upload working rather than
   * taking the receipt down with it.
   */
  get hasExtraction(): boolean {
    return Boolean(
      process.env.ANTHROPIC_API_KEY &&
        process.env.ANTHROPIC_API_KEY.trim() !== '' &&
        !process.env.ANTHROPIC_API_KEY.startsWith('replace-me'),
    );
  },
};

export { ConfigError };
