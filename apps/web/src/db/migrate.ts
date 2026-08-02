/**
 * Applies pending migrations. Run with: npm run db:migrate
 *
 * Uses the direct Neon connection because the pooled endpoint cannot run DDL.
 */

import './loadEnv';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error(
      'DATABASE_URL_UNPOOLED (or DATABASE_URL) is not set. Copy .env.example to .env.local and fill in your Neon connection strings.',
    );
    process.exit(1);
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = path.join(here, 'migrations');

  console.log('Applying migrations from', migrationsFolder);
  await migrate(drizzle(neon(url)), { migrationsFolder });
  console.log('Migrations applied.');
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
