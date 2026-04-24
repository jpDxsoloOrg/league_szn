import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB } from './schema';

let cached: Kysely<DB> | undefined;

export function getKyselyDb(): Kysely<DB> {
  if (cached) return cached;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Required for DB_DRIVER=postgres. ' +
        'Set it in .env (local) or the deployment env (Lambda).',
    );
  }

  // node-postgres over plain TCP/SSL. Works with Neon's pooled or direct
  // endpoint; no WebSocket transport is needed inside Node/Lambda. Neon
  // requires SSL — the sslmode=require query param in the URL handles that.
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  cached = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
  return cached;
}

export async function closeKyselyDb(): Promise<void> {
  if (cached) {
    await cached.destroy();
    cached = undefined;
  }
}
