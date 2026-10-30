/*
 * Applies the SQL migrations in drizzle/ to DATABASE_URL (Neon in production).
 * Usage: DATABASE_URL=postgres://… npm run db:migrate -w @daysoff/teams
 */
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL first.');
  process.exit(1);
}
const client = postgres(url, { prepare: false, max: 1 });
await migrate(drizzle(client), { migrationsFolder: path.join(import.meta.dirname, '../drizzle') });
await client.end();
console.log('Migrations applied.');
