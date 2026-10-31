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

const COVERAGE_MIGRATIONS = ['0005_regulated_coverage.sql', '0006_cover_workflow.sql', '0007_time_clock.sql', '0008_approvals_automations.sql'];
const downStatements = (file: string) =>
  readFileSync(path.join(MIGRATIONS_DIR, 'down', file), 'utf8')
    .replace(/^--.*$/gm, '')
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean);

describe('regulated coverage and time clock migrations (0005–0008)', () => {
  it.each(COVERAGE_MIGRATIONS)('%s is additive: no DROP, no type changes, every new column nullable or defaulted', (file) => {
    const up = statements(file);
    expect(up.some((s) => /\bDROP\b/i.test(s))).toBe(false);
    expect(up.some((s) => /ALTER COLUMN/i.test(s))).toBe(false);
    for (const s of up.filter((x) => /ADD COLUMN/i.test(x))) expect(/NOT NULL/.test(s) ? /DEFAULT/.test(s) : true, s).toBe(true);
  });

  it('up → down (newest first) → up keeps MVP tables and rows unchanged', async () => {
    const db = await freshDb();
    await seedOrg(db);
    const withCoverage = await snapshot(db);
    expect(withCoverage.tables).toEqual(expect.arrayContaining(['rooms', 'cover_events', 'hours_worked', 'passkeys', 'login_codes', 'push_subscriptions', 'time_punches', 'timesheet_approvals', 'groups', 'policy_rules', 'team_events', 'msteams_users']));

    for (const file of [...COVERAGE_MIGRATIONS].reverse()) for (const s of downStatements(file)) await db.execute(sql.raw(s));
    const after = await snapshot(db);
    expect(after.tables.filter((t) => ['rooms', 'cover_events', 'hours_worked', 'credentials', 'passkeys', 'login_codes', 'push_subscriptions', 'time_punches', 'timesheet_approvals', 'groups', 'policy_rules', 'team_events', 'profile_change_requests', 'msteams_tenants', 'msteams_users'].includes(t))).toEqual([]);
    expect(after.orgs).toEqual(withCoverage.orgs.map(({ id, name }) => ({ id, name })));
    expect(after.ledger).toEqual(withCoverage.ledger);

    for (const file of COVERAGE_MIGRATIONS) for (const s of statements(file)) await db.execute(sql.raw(s));
    const again = await snapshot(db);
    expect(again.tables).toEqual(withCoverage.tables);
    expect(again.ledger).toEqual(withCoverage.ledger);
  });
});
