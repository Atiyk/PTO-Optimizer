import path from 'node:path';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

/** Driver-agnostic handle: PGlite (dev/tests) and postgres-js (production) both satisfy it. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle');

let current: Promise<Db> | undefined;

/**
 * Production reads DATABASE_URL (e.g. a free Neon project). Without it, dev falls back to
 * an in-process PGlite database persisted under .pglite/. Tests inject their own with
 * setDb().
 */
export function getDb(): Promise<Db> {
  current ??= open();
  return current;
}

export function setDb(db: Db | undefined): void {
  current = db ? Promise.resolve(db) : undefined;
}

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import('postgres');
    const { drizzle } = await import('drizzle-orm/postgres-js');
    // prepare:false keeps it compatible with Neon's pooled (PgBouncer) endpoint.
    return drizzle(postgres(url, { prepare: false, max: 5 }), { schema }) as unknown as Db;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required in production');
  }
  return openPglite(path.join(process.cwd(), '.pglite'));
}

/** In-process Postgres. `dataDir` undefined = in-memory (tests). Runs migrations. */
export async function openPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db as unknown as Db;
}

export { schema };
