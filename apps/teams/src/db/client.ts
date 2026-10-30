import path from 'node:path';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

/** Driver-agnostic handle: PGlite (dev/tests) and postgres-js (production) both satisfy it. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle');

// On globalThis, not module scope: Next bundles route handlers and pages into separate module
// graphs, and two PGlite instances on one data directory silently diverge.
const slot = globalThis as typeof globalThis & { __daysOffTeamsDb?: Promise<Db> };

/**
 * Production reads DATABASE_URL (e.g. a free Neon project). Without it, dev falls back to
 * an in-process PGlite database persisted under .pglite/. Tests inject their own with
 * setDb().
 */
export function getDb(): Promise<Db> {
  slot.__daysOffTeamsDb ??= open();
  return slot.__daysOffTeamsDb;
}

export function setDb(db: Db | undefined): void {
  slot.__daysOffTeamsDb = db ? Promise.resolve(db) : undefined;
}

/**
 * How this deployment stores data:
 *  - 'postgres': DATABASE_URL is set (production, e.g. Neon).
 *  - 'pglite': local dev, tests, or a production build with ALLOW_PGLITE=1 (e2e).
 *  - 'demo-only': a production deploy with no DATABASE_URL yet. It runs on in-memory PGlite so
 *    the demo works, and real sign-up is switched off because anything saved would vanish.
 */
export type DbMode = 'postgres' | 'pglite' | 'demo-only';
export function dbMode(): DbMode {
  if (process.env.DATABASE_URL) return 'postgres';
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PGLITE !== '1') return 'demo-only';
  return 'pglite';
}

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    if (process.env.AUTO_MIGRATE !== '0') await migratePostgres(url);
    const { default: postgres } = await import('postgres');
    const { drizzle } = await import('drizzle-orm/postgres-js');
    // prepare:false keeps it compatible with Neon's pooled (PgBouncer) endpoint.
    return drizzle(postgres(url, { prepare: false, max: 5 }), { schema }) as unknown as Db;
  }
  if (dbMode() === 'demo-only') return openPglite();
  return openPglite(process.env.PGLITE_DIR ?? path.join(process.cwd(), '.pglite'));
}

/** Arbitrary constant: every instance takes the same lock, so only one migrates at a time. */
const MIGRATION_LOCK = 4_170_293;

/**
 * Applies pending migrations once per process, so a fresh deploy needs no manual step.
 * Drizzle records what ran in drizzle.__drizzle_migrations, so this is a no-op when current;
 * the advisory lock keeps two cold starts from racing. AUTO_MIGRATE=0 turns it off.
 */
export async function migratePostgres(url: string): Promise<void> {
  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');
  // One connection: an advisory lock belongs to the session that took it.
  const client = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    await client`select pg_advisory_lock(${MIGRATION_LOCK})`;
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_DIR });
    await client`select pg_advisory_unlock(${MIGRATION_LOCK})`;
  } finally {
    await client.end();
  }
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
