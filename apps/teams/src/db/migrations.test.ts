import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from './client';
import { freshDb, seedOrg } from '@/test/db';

/*
 * Coverage migrations are additive and reversible (COVERAGE-ARCHITECTURE §5): up → down → up
 * leaves the MVP's tables and rows exactly as they were.
 */

const statements = (file: string) =>
  readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);

async function snapshot(db: Awaited<ReturnType<typeof freshDb>>) {
  const tables = await db.execute(sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`);
  const orgs = await db.execute(sql`select id, name from organizations order by id`);
  const ledger = await db.execute(sql`select id, amount from balance_ledger order by id`);
  const rows = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? r) as Record<string, unknown>[];
  return { tables: rows(tables).map((t) => t.table_name as string), orgs: rows(orgs), ledger: rows(ledger) };
}

describe('0005 regulated coverage migration', () => {
  it('is additive: no DROP, no type changes, every new column nullable or defaulted', () => {
    const up = statements('0005_regulated_coverage.sql');
    expect(up.some((s) => /\bDROP\b/i.test(s))).toBe(false);
    expect(up.some((s) => /ALTER COLUMN/i.test(s))).toBe(false);
    for (const s of up.filter((x) => /ADD COLUMN/i.test(x))) expect(/NOT NULL/.test(s) ? /DEFAULT/.test(s) : true, s).toBe(true);
  });

  it('up → down → up keeps MVP tables and rows unchanged', async () => {
    const db = await freshDb();
    await seedOrg(db);
    const withCoverage = await snapshot(db);
    expect(withCoverage.tables).toEqual(expect.arrayContaining(['rooms', 'cover_events', 'hours_worked']));

    const down = readFileSync(path.join(MIGRATIONS_DIR, 'down', '0005_regulated_coverage.sql'), 'utf8');
    for (const s of down.replace(/^--.*$/gm, '').split(';').map((x) => x.trim()).filter(Boolean)) await db.execute(sql.raw(s));
    const after = await snapshot(db);
    expect(after.tables.filter((t) => ['rooms', 'cover_events', 'hours_worked', 'credentials'].includes(t))).toEqual([]);
    expect(after.orgs).toEqual(withCoverage.orgs.map(({ id, name }) => ({ id, name })));
    expect(after.ledger).toEqual(withCoverage.ledger);

    for (const s of statements('0005_regulated_coverage.sql')) await db.execute(sql.raw(s));
    const again = await snapshot(db);
    expect(again.tables).toEqual(withCoverage.tables);
    expect(again.ledger).toEqual(withCoverage.ledger);
  });
});
