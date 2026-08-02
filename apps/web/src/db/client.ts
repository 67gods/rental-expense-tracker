import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { env } from '@/env';
import * as schema from './schema';

/**
 * The database handle.
 *
 * Neon's HTTP driver suits serverless request handlers: no connection to hold
 * open, no pool to exhaust between cold starts. The tradeoff is no interactive
 * transactions - `db.transaction()` over HTTP batches statements rather than
 * holding one open - which is fine because the only multi-row write is a trip,
 * and that is a single batch.
 *
 * Created lazily so `next build` does not need DATABASE_URL bound.
 */
let cached: ReturnType<typeof create> | null = null;

function create() {
  return drizzle(neon(env.databaseUrl), { schema, casing: 'snake_case' });
}

export function getDb() {
  cached ??= create();
  return cached;
}

export type Db = ReturnType<typeof getDb>;
export { schema };
