import { eq, getTableColumns, getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/db/client';
import * as schema from '@/db/schema';
import { apiTokens, leaveRequests, members } from '@/db/schema';
import { buildOrg, humanActor, run, snapshotOrg } from '@/test/fixtures';
import { freshDb } from '@/test/db';

/* Phase 6 privacy: export and delete, per member and per workspace. */

let db: Db;
let A: Awaited<ReturnType<typeof buildOrg>>;
let B: Awaited<ReturnType<typeof buildOrg>>;
beforeEach(async () => {
  db = await freshDb();
  A = await buildOrg(db, 'Acme');
  B = await buildOrg(db, 'Globex');
});

const orgTables = () =>
  (Object.values(schema) as unknown[]).filter((t): t is PgTable => is(t, PgTable) && 'orgId' in getTableColumns(t));

describe('privacy (P6.2)', () => {
  it('per-member export holds that person’s data and nobody else’s', async () => {
    await run(db, humanActor(A.emp2), 'submitLeaveRequest', { start: '2026-12-07', end: '2026-12-07', note: 'dentist', idempotencyKey: 'privacy-1-key' });
    const out = await run(db, humanActor(A.owner), 'exportData', { format: 'json', memberId: A.emp2.id });
    const data = JSON.parse(out.files['export.json']!) as Record<string, { member_id?: string; id?: string; note?: string }[]>;
    expect(data.members!.map((m) => m.id)).toEqual([A.emp2.id]);
    expect(data.requests!.every((r) => r.member_id === A.emp2.id)).toBe(true);
    expect(data.requests!.map((r) => r.note)).toContain('dentist');
    expect(out.files['export.json']).not.toContain(A.emp.id);
    const csv = await run(db, humanActor(A.owner), 'exportData', { format: 'csv', memberId: A.emp2.id });
    expect(Object.keys(csv.files)).toEqual(expect.arrayContaining(['members.csv', 'requests.csv', 'ledger.csv']));
  });

  it('erasing a member removes personal data but keeps the org’s leave records', async () => {
    await run(db, humanActor(A.emp), 'submitLeaveRequest', { start: '2026-12-07', end: '2026-12-07', note: 'family thing', idempotencyKey: 'privacy-2-key' });
    await run(db, humanActor(A.emp), 'managePersonalTokens', { op: 'create', name: 't', scopes: ['leave:read'] });
    await db.update(members).set({ email: 'emp@acme.test', slackUserId: 'U123' }).where(eq(members.id, A.emp.id));
    const before = await db.select().from(leaveRequests).where(eq(leaveRequests.memberId, A.emp.id));
    await expect(run(db, humanActor(A.manager), 'eraseMember', { memberId: A.emp.id })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(run(db, humanActor(A.owner), 'eraseMember', { memberId: A.owner.id })).rejects.toMatchObject({ code: 'conflict' });
    await run(db, humanActor(A.owner), 'eraseMember', { memberId: A.emp.id });
    const [m] = await db.select().from(members).where(eq(members.id, A.emp.id));
    expect(m).toMatchObject({ name: 'Former member', email: null, slackUserId: null, tags: [] });
    expect(m!.deletedAt).not.toBeNull();
    const after = await db.select().from(leaveRequests).where(eq(leaveRequests.memberId, A.emp.id));
    expect(after.map((r) => [r.startDate, r.endDate, r.status])).toEqual(before.map((r) => [r.startDate, r.endDate, r.status]));
    expect(after.every((r) => r.note === null)).toBe(true);
    expect(await db.select().from(apiTokens).where(eq(apiTokens.memberId, A.emp.id))).toEqual([]);
    const dump = await run(db, humanActor(A.owner), 'exportData', { format: 'json' });
    expect(dump.files['export.json']).not.toContain('Acme Emp"');
    expect(dump.files['export.json']).not.toContain('family thing');
    expect(dump.files['export.json']).not.toContain('emp@acme.test');
    // Another org's admin cannot erase anyone here.
    await expect(run(db, humanActor(B.owner), 'eraseMember', { memberId: A.emp2.id })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('deleting a workspace removes every row of that org in every table, and nothing else', async () => {
    await run(db, humanActor(A.owner), 'manageWebhooks', { op: 'create', url: 'https://hooks.example.com/a', events: ['leave.requested'] });
    await run(db, humanActor(A.emp2), 'submitLeaveRequest', { start: '2026-12-07', end: '2026-12-07', idempotencyKey: 'privacy-3-key' });
    const bBefore = await snapshotOrg(db, B.org.id);
    await expect(run(db, humanActor(A.manager), 'deleteWorkspace', { confirmName: 'Acme' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(run(db, humanActor(A.owner), 'deleteWorkspace', { confirmName: 'acme' })).rejects.toMatchObject({ code: 'invalid_input' });
    await run(db, humanActor(A.owner), 'deleteWorkspace', { confirmName: 'Acme' });
    const tables = orgTables();
    expect(tables.length).toBeGreaterThan(15);
    for (const t of tables) {
      const rows = await db.execute(sql`select count(*)::int as n from ${t} where org_id = ${A.org.id}`);
      const n = (rows as unknown as { rows: { n: number }[] }).rows[0]!.n;
      expect(n, getTableName(t)).toBe(0);
    }
    expect(await snapshotOrg(db, B.org.id)).toEqual(bBefore);
  });
});
