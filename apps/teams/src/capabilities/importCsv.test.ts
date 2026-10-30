import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/db/client';
import { members } from '@/db/schema';
import { buildOrg, humanActor, run } from '@/test/fixtures';
import { freshDb } from '@/test/db';
import { toCsv } from './actions/admin';

let db: Db;
let A: Awaited<ReturnType<typeof buildOrg>>;
const sample = (f: string) => readFile(path.join(process.cwd(), 'samples', f), 'utf8');
beforeEach(async () => {
  db = await freshDb();
  A = await buildOrg(db, 'Acme');
});

describe('CSV import', () => {
  it('Timetastic users: auto-maps, previews 12 clean rows, commits members, managers, teams and exact balances', async () => {
    const csv = await sample('timetastic-users.csv');
    const owner = humanActor(A.owner);
    const p = await run(db, owner, 'importCsv', { stage: 'preview', kind: 'members', csv });
    expect(p.rows).toHaveLength(12);
    expect(p.errorCount).toBe(0);
    expect(Object.keys(p.mapping).sort()).toEqual(['balance', 'email', 'manager', 'name', 'role', 'startDate', 'team', 'workWeek'].sort());
    expect((await db.select().from(members).where(eq(members.orgId, A.org.id))).length).toBe(4); // preview wrote nothing

    const c = await run(db, owner, 'importCsv', { stage: 'commit', kind: 'members', csv });
    expect(c.committed).toBe(12);
    const all = await db.select().from(members).where(eq(members.orgId, A.org.id));
    const tom = all.find((m) => m.name === 'Tom Becker')!;
    const priya = all.find((m) => m.name === 'Priya Shah')!;
    expect(tom.managerId).toBe(priya.id);
    expect(priya.role).toBe('manager');
    expect(tom.startDate).toBe('2023-03-15'); // day-first 15/03/2023
    expect(all.find((m) => m.name === 'Grace Kim')!.workWeek).toBe('1111000');
    // Balance import makes the engine's balance equal the file's "Remaining" (12.5 for Priya).
    const bal = await run(db, { ...humanActor({ ...priya, role: 'manager' }) }, 'getMyBalance', {});
    expect(bal.balance).toBe(12.5);
  });

  it('rejects the whole file if any row is bad, and writes nothing', async () => {
    const csv = 'Name,Email,Remaining\nGood Person,good@example.com,5\nBad Person,not-an-email,abc\n';
    const r = await run(db, humanActor(A.owner), 'importCsv', { stage: 'commit', kind: 'members', csv });
    expect(r.committed).toBe(0);
    expect(r.rows[1]!.errors).toEqual(['email is not valid', 'balance "abc" is not a number']);
    expect((await db.select().from(members).where(eq(members.orgId, A.org.id))).map((m) => m.name)).not.toContain('Good Person');
  });

  it('rolls back everything if a write fails part-way', async () => {
    // Second row's team name is fine for validation but the leave type for balances is missing,
    // which throws inside the transaction after members were inserted.
    const csv = 'Name,Remaining\nRoll Back One,5\nRoll Back Two,6\n';
    await expect(run(db, humanActor(A.owner), 'importCsv', { stage: 'commit', kind: 'members', csv, balanceLeaveType: 'nope' })).rejects.toMatchObject({ code: 'invalid_input' });
    const names = (await db.select().from(members).where(eq(members.orgId, A.org.id))).map((m) => m.name);
    expect(names).not.toContain('Roll Back One');
  });

  it('booked leave from a Vacation Tracker export: maps types, computes days with the engine', async () => {
    const owner = humanActor(A.owner);
    await run(db, owner, 'importCsv', { stage: 'commit', kind: 'members', csv: await sample('timetastic-users.csv') });
    const r = await run(db, owner, 'importCsv', { stage: 'commit', kind: 'leave', csv: await sample('vacation-tracker-leaves.csv') });
    expect(r.errorCount).toBe(0);
    expect(r.committed).toBe(5);
    // Tom: Mon Dec 21 – Thu Dec 24 = 4 working days ("Annual leave" → vacation).
    expect(r.rows[0]!.values).toMatchObject({ leaveType: 'vacation', deducts: '4' });
    // Ben's sick leave maps to sick.
    expect(r.rows[3]!.values.leaveType).toBe('sick');
  });

  it('CSV export neutralises spreadsheet formulas', () => {
    expect(toCsv([{ a: '=HYPERLINK("x")', b: 'plain', c: 'with,comma' }])).toBe('a,b,c\n"\'=HYPERLINK(""x"")",plain,"with,comma"\n');
  });
});
