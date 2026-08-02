import { neon, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as drizzleWs } from 'drizzle-orm/neon-serverless';
import { env } from '@/env';
import * as schema from './schema';

/**
 * Two handles, because Neon offers two drivers and they are good at different
 * things.
 *
 * `getDb()` - the HTTP driver. Suits serverless request handlers: no connection
 * held open, no pool to exhaust between cold starts. It is the right default
 * and almost every read and single-row write uses it.
 *
 * `withTransaction()` - the WebSocket driver, which is the only one that can
 * hold a real interactive transaction open. The HTTP driver throws
 * "No transactions support in neon-http driver" on `db.transaction()`.
 *
 * That distinction is not academic here. Several writes in this app are only
 * correct as a unit:
 *
 *   - an expense and the payment row that says what was actually paid, since a
 *     half-written pair leaves an expense that reads as never paid;
 *   - closing one management period and opening the next, since a gap or an
 *     overlap both misstate who was managing the property;
 *   - a trip and the two time entries it produces.
 *
 * Both are created lazily so `next build` does not need DATABASE_URL bound.
 */
let cached: ReturnType<typeof create> | null = null;
let pool: Pool | null = null;

function create() {
  return drizzle(neon(env.databaseUrl), { schema, casing: 'snake_case' });
}

export function getDb() {
  cached ??= create();
  return cached;
}

function getPool(): Pool {
  // The unpooled connection string, because PgBouncer in transaction mode
  // cannot hold an interactive transaction across statements.
  pool ??= new Pool({ connectionString: env.databaseUrlUnpooled });
  return pool;
}

export type TxDb = Parameters<
  Parameters<ReturnType<typeof drizzleWs<typeof schema>>['transaction']>[0]
>[0];

/**
 * Runs `fn` inside one transaction, rolling back if it throws.
 *
 * Reach for this only when several writes have to succeed or fail together.
 * Ordinary single-row work should stay on `getDb()`, which is cheaper.
 */
export async function withTransaction<T>(fn: (tx: TxDb) => Promise<T>): Promise<T> {
  const db = drizzleWs(getPool(), { schema, casing: 'snake_case' });
  return db.transaction(fn);
}

/** Releases the WebSocket pool. For scripts; request handlers never need it. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export type Db = ReturnType<typeof getDb>;
export { schema };
