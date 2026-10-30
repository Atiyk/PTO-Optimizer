import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/db/client';
import { auditLog } from '@/db/schema';
import { invokeCapability } from './registry';
import { buildOrg, humanActor, NOW, run } from '@/test/fixtures';
import { freshDb } from '@/test/db';

let db: Db;
let A: Awaited<ReturnType<typeof buildOrg>>;
beforeEach(async () => {
  db = await freshDb();
  A = await buildOrg(db, 'Acme');
  // Vacation opts in to auto-approval for requests up to 2 days.
  await run(db, humanActor(A.owner), 'manageOrgSetup', { op: 'upsertLeaveType', key: 'vacation', name: 'Vacation', autoApprove: true, maxAutoApproveDays: 2 });
});
const level = (l: 0 | 1 | 2 | 3) =>
  run(db, humanActor(A.owner), 'manageOrgSetup', { op: 'setAutonomy', capability: 'decideLeaveRequest', actorClass: 'assistant', level: l, reversibleMinutes: 60 });
const submit = (start: string, end: string, key: string) => run(db, humanActor(A.emp2), 'submitLeaveRequest', { start, end, idempotencyKey: key });

describe('auto-approval (3D) and autonomy levels (R6)', () => {
  it('L0: everything waits for the manager, no suggestion shown', async () => {
    await level(0);
    const s = await submit('2026-12-07', '2026-12-07', 'auto-l0-1');
    expect(s.request.status).toBe('pending');
    const p = await run(db, humanActor(A.manager), 'listPendingApprovals', {});
    expect(p.requests.every((r) => r.autoApproval === null)).toBe(true);
  });

  it('L1 (default) suggests: the manager sees which requests the rules would approve, and why not', async () => {
    await submit('2026-12-07', '2026-12-07', 'auto-l1-1');
    await submit('2026-12-14', '2026-12-16', 'auto-l1-2'); // 3 days > limit
    const p = await run(db, humanActor(A.manager), 'listPendingApprovals', {});
    const byStart = Object.fromEntries(p.requests.map((r) => [r.start, r.autoApproval]));
    expect(byStart['2026-12-07']).toEqual({ eligible: true, blockers: [] });
    expect(byStart['2026-12-14']!.blockers.join(' ')).toMatch(/2 days auto-approval limit/);
  });

  it('L2 drafts: still the manager confirms', async () => {
    await level(2);
    expect((await submit('2026-12-07', '2026-12-07', 'auto-l2-draft')).request.status).toBe('pending');
  });

  it('L3 approves clean requests reversibly, audits as the assistant, and the manager can undo within the window', async () => {
    await level(3);
    const s = await submit('2026-12-07', '2026-12-08', 'auto-l2-1');
    expect(s.request).toMatchObject({ status: 'approved', autoApproved: true });
    expect((await run(db, humanActor(A.emp2), 'getMyBalance', {})).usable).toBe(18);
    const [audit] = await db.select().from(auditLog).where(and(eq(auditLog.orgId, A.org.id), eq(auditLog.clientId, 'auto-approval')));
    expect(audit).toMatchObject({ actorType: 'service-agent', capability: 'decideLeaveRequest' });
    expect(audit!.summary).toMatch(/Vacation, 2 days \(limit 2\).*reverse until/);

    const p = await run(db, humanActor(A.manager), 'listPendingApprovals', {});
    expect(p.recentAutoApprovals.map((r) => r.id)).toEqual([s.request.id]);
    await run(db, humanActor(A.manager), 'decideLeaveRequest', { requestId: s.request.id, decision: 'decline', note: 'release week' });
    expect((await run(db, humanActor(A.emp2), 'getMyBalance', {})).usable).toBe(20);
  });

  it('L3 never auto-approves past the limit, a coverage gap or a blackout', async () => {
    await level(3);
    expect((await submit('2026-12-14', '2026-12-16', 'auto-l3-big')).request.status).toBe('pending'); // over limit
    expect((await submit('2026-12-30', '2026-12-30', 'auto-l3-bl')).request.status).toBe('pending'); // soft blackout
  });

  it('after the window closes the auto-approval stands', async () => {
    await level(3);
    const s = await submit('2026-12-07', '2026-12-07', 'auto-l3-late');
    const later = { db, actor: humanActor(A.manager), now: new Date(NOW.getTime() + 61 * 60_000) };
    await expect(invokeCapability('decideLeaveRequest', later, { requestId: s.request.id, decision: 'decline' })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('only admins can change the level', async () => {
    await expect(
      run(db, humanActor(A.manager), 'manageOrgSetup', { op: 'setAutonomy', capability: 'decideLeaveRequest', actorClass: 'assistant', level: 3 }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});
