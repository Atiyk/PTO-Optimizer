import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/db/client';
import { balanceLedger, organizations } from '@/db/schema';
import { buildOrg, humanActor, run } from '@/test/fixtures';
import { freshDb } from '@/test/db';

/*
 * The core request lifecycle. Holidays come from the committed US snapshot
 * (public/holidays/US-2026.json): Thanksgiving is Thu 2026-11-26.
 * Default vacation policy: 20 days front-loaded per calendar year, carry up to 5.
 */

let db: Db;
let A: Awaited<ReturnType<typeof buildOrg>>;
beforeEach(async () => {
  db = await freshDb();
  A = await buildOrg(db, 'Acme');
});

describe('leave requests', () => {
  it('draft shows exact cost, holiday not deducted, balance after', async () => {
    // Mon Nov 23 – Fri Nov 27: 5 weekdays, Thanksgiving excluded → 4 days.
    // Emp has 20 granted, 2 pending (Nov 16–17) → before 18, after 14.
    const d = await run(db, humanActor(A.emp), 'draftLeaveRequest', { start: '2026-11-23', end: '2026-11-27' });
    expect(d.deducts).toBe(4);
    expect(d.excluded).toContainEqual({ date: '2026-11-26', reason: 'holiday', name: 'Thanksgiving Day' });
    expect([d.balanceBefore, d.balanceAfter]).toEqual([18, 14]);
    expect(d.canSubmit).toBe(true);
  });

  it('submit → pending; approve → deducted; cancel → given back', async () => {
    const s = await run(db, humanActor(A.emp2), 'submitLeaveRequest', { start: '2026-12-07', end: '2026-12-08', idempotencyKey: 'k-approve-1' });
    expect(s.request.status).toBe('pending');
    const again = await run(db, humanActor(A.emp2), 'submitLeaveRequest', { start: '2026-12-07', end: '2026-12-08', idempotencyKey: 'k-approve-1' });
    expect(again.request.id).toBe(s.request.id); // idempotent retry
    await run(db, humanActor(A.manager), 'decideLeaveRequest', { requestId: s.request.id, decision: 'approve' });
    // Booked for December: today's balance is still 20, but only 18 can still be booked.
    expect(await run(db, humanActor(A.emp2), 'getMyBalance', {})).toMatchObject({ balance: 20, usable: 18, bookedAhead: 2 });
    await run(db, humanActor(A.emp2), 'cancelLeaveRequest', { requestId: s.request.id });
    expect(await run(db, humanActor(A.emp2), 'getMyBalance', {})).toMatchObject({ balance: 20, usable: 20, bookedAhead: 0 });
    const rows = await db.select().from(balanceLedger).where(and(eq(balanceLedger.orgId, A.org.id), eq(balanceLedger.requestId, s.request.id)));
    expect(rows.map((r) => Number(r.amount)).sort()).toEqual([-2, 2]); // append-only: deduction + reversal
  });

  it('decline leaves the balance alone and records the note', async () => {
    await run(db, humanActor(A.manager), 'decideLeaveRequest', { requestId: A.requestId, decision: 'decline', note: 'release week' });
    const mine = await run(db, humanActor(A.emp), 'listMyRequests', {});
    expect(mine.requests[0]).toMatchObject({ status: 'declined', decisionNote: { untrusted_text: 'release week' } });
    expect((await run(db, humanActor(A.emp), 'getMyBalance', {})).balance).toBe(20);
  });

  it('blocks overlaps, over-balance requests and too-old retroactive ones', async () => {
    const overlap = await run(db, humanActor(A.emp), 'draftLeaveRequest', { start: '2026-11-17', end: '2026-11-18' });
    expect(overlap.problems.join()).toMatch(/Overlaps your pending request/);
    const tooMuch = await run(db, humanActor(A.emp2), 'draftLeaveRequest', { start: '2026-11-30', end: '2026-12-31' });
    expect(tooMuch.problems.join()).toMatch(/Not enough balance/);
    const old = await run(db, humanActor(A.emp2), 'draftLeaveRequest', { start: '2026-09-01', end: '2026-09-01' });
    expect(old.problems.join()).toMatch(/at most 30 days in the past/);
    await expect(run(db, humanActor(A.emp2), 'submitLeaveRequest', { start: '2026-11-30', end: '2026-12-31', idempotencyKey: 'too-much-1' })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('half days and hours', async () => {
    const half = await run(db, humanActor(A.emp2), 'draftLeaveRequest', { start: '2026-11-20', end: '2026-11-20', part: 'pm' });
    expect(half.deducts).toBe(0.5);
    const hrs = await run(db, humanActor(A.emp2), 'draftLeaveRequest', { start: '2026-11-20', end: '2026-11-20', part: 'hours', hours: 2 });
    expect(hrs.deducts).toBe(0.25); // 2 h of an 8 h day
  });

  it('coverage: a request that leaves the team short warns the approver', async () => {
    // Rule: ≥1 engineer. Team: owner, manager, emp, emp2 (all engineers). Emp is out Nov 16–17
    // (pending). Put manager and owner out Nov 16 too → emp2 asking Nov 16 leaves 0.
    await run(db, humanActor(A.manager), 'submitLeaveRequest', { start: '2026-11-16', end: '2026-11-16', idempotencyKey: 'cov-m-1-key' });
    await run(db, humanActor(A.owner), 'submitLeaveRequest', { start: '2026-11-16', end: '2026-11-16', idempotencyKey: 'cov-o-1-key' });
    const d = await run(db, humanActor(A.emp2), 'draftLeaveRequest', { start: '2026-11-16', end: '2026-11-16' });
    expect(d.coverage).toEqual([{ date: '2026-11-16', required: 1, present: 0, tag: 'engineer' }]);
    expect(d.canSubmit).toBe(true); // a warning, not a block
  });

  it('health data: sick leave rejects notes unless the org enabled them', async () => {
    const d = await run(db, humanActor(A.emp2), 'draftLeaveRequest', { leaveType: 'sick', start: '2026-11-03', end: '2026-11-03', note: 'flu' });
    expect(d.problems.join()).toMatch(/Notes are not stored for sick requests/);
    const ok = await run(db, humanActor(A.emp2), 'submitLeaveRequest', { leaveType: 'sick', start: '2026-11-03', end: '2026-11-03', idempotencyKey: 'sick-1-key' });
    expect(ok.request).toMatchObject({ status: 'approved', note: null }); // no approval needed, no balance
    await db.update(organizations).set({ sickNotesEnabled: true }).where(eq(organizations.id, A.org.id));
    const withNote = await run(db, humanActor(A.emp2), 'submitLeaveRequest', { leaveType: 'sick', start: '2026-11-04', end: '2026-11-04', note: 'flu', idempotencyKey: 'sick-2-key' });
    expect(withNote.request.note).toEqual({ untrusted_text: 'flu' });
  });

  it('whoIsOut shows names and dates, never the sick type', async () => {
    await run(db, humanActor(A.emp2), 'submitLeaveRequest', { leaveType: 'sick', start: '2026-11-05', end: '2026-11-05', idempotencyKey: 'sick-3-key' });
    await db.update(organizations).set({ showLeaveType: true }).where(eq(organizations.id, A.org.id));
    const out = await run(db, humanActor(A.emp), 'whoIsOut', { from: '2026-11-02', to: '2026-11-08' });
    const row = out.teams.flatMap((t) => t.out).find((o) => o.memberId === A.emp2.id)!;
    expect(row.leaveType).toBeNull();
  });

  it('team visibility: an employee only sees their own team', async () => {
    const { members } = await import('@/db/schema');
    const other = await run(db, humanActor(A.owner), 'manageOrgSetup', { op: 'addTeam', name: 'Sales' });
    await db.update(members).set({ teamId: other.id }).where(eq(members.id, A.emp2.id));
    await run(db, humanActor(A.emp2), 'submitLeaveRequest', { start: '2026-11-19', end: '2026-11-19', idempotencyKey: 'vis-1-key' });
    await run(db, humanActor(A.manager), 'decideLeaveRequest', { requestId: (await run(db, humanActor(A.emp2), 'listMyRequests', {})).requests[0]!.id, decision: 'approve' });
    await db.update(organizations).set({ visibility: 'team' }).where(eq(organizations.id, A.org.id));
    const seen = await run(db, humanActor(A.emp), 'whoIsOut', { from: '2026-11-19', to: '2026-11-19' });
    expect(seen.teams.flatMap((t) => t.out.map((o) => o.memberId))).not.toContain(A.emp2.id);
    const adminSees = await run(db, humanActor(A.owner), 'whoIsOut', { from: '2026-11-19', to: '2026-11-19' });
    expect(adminSees.teams.flatMap((t) => t.out.map((o) => o.memberId))).toContain(A.emp2.id);
  });

  it('adjustments append to the ledger with a reason and are audited', async () => {
    await run(db, humanActor(A.owner), 'adjustBalance', { memberId: A.emp2.id, leaveType: 'vacation', amount: 1.5, effectiveDate: '2026-11-01', reason: 'Worked a holiday' });
    expect((await run(db, humanActor(A.emp2), 'getMyBalance', {})).balance).toBe(21.5);
    const ex = await run(db, humanActor(A.emp2), 'explainBalance', {});
    expect(ex.entries.at(-1)).toMatchObject({ kind: 'adjustment', amount: 1.5, balanceAfter: 21.5, reason: { untrusted_text: 'Worked a holiday' } });
    const audit = await run(db, humanActor(A.owner), 'getAuditLog', {});
    expect(audit.entries[0]!.summary.untrusted_text).toBe('Adjusted vacation by 1.5 on 2026-11-01');
  });
});
