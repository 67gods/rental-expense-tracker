import { defineConfig } from 'drizzle-kit';

/**
 * Migrations run against the direct (unpooled) Neon connection. The pooled
 * endpoint does not support the session-level statements DDL needs.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: {
    url:
      process.env.DATABASE_URL_UNPOOLED ??
      process.env.DATABASE_URL ??
      'postgresql://localhost:5432/placeholder',
  },
  strict: true,
  verbose: true,
});
