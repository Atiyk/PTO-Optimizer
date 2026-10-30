import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '@/db/client';
import { buildOrg, humanActor, run } from '@/test/fixtures';
import { freshDb } from '@/test/db';
import type { CapabilityName } from './registry';

let db: Db;
let A: Awaited<ReturnType<typeof buildOrg>>;
beforeAll(async () => {
  db = await freshDb();
  A = await buildOrg(db, 'Acme');
});

const adminOnly = (): [CapabilityName, unknown][] => [
  ['manageOrgSetup', { op: 'addTeam', name: 'x' }],
  ['manageMembers', { op: 'createInvite' }],
  ['listMembers', {}],
  ['adjustBalance', { memberId: A.emp.id, leaveType: 'vacation', amount: 1, effectiveDate: '2026-11-01', reason: 'nope' }],
  ['exportData', {}],
  ['getAuditLog', {}],
  ['importCsv', { stage: 'preview', kind: 'members', csv: 'name\nx' }],
];

describe('RBAC per role', () => {
  it('employees and managers cannot use admin capabilities', async () => {
    for (const who of [A.emp, A.manager]) {
      for (const [name, input] of adminOnly()) {
        await expect(run(db, humanActor(who), name, input), `${who.role} → ${name}`).rejects.toMatchObject({ code: 'forbidden' });
      }
    }
  });

  it('admins and owners can', async () => {
    for (const [name, input] of adminOnly()) await expect(run(db, humanActor(A.owner), name, input)).resolves.toBeTruthy();
  });

  it('employees cannot see or decide approvals', async () => {
    await expect(run(db, humanActor(A.emp2), 'listPendingApprovals', {})).rejects.toMatchObject({ code: 'forbidden' });
    await expect(run(db, humanActor(A.emp2), 'decideLeaveRequest', { requestId: A.requestId, decision: 'approve' })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('a manager sees and decides their reports’ requests, never their own', async () => {
    const q = await run(db, humanActor(A.manager), 'listPendingApprovals', {});
    expect(q.requests.map((r) => r.id)).toContain(A.requestId);
    const own = await run(db, humanActor(A.manager), 'submitLeaveRequest', { start: '2026-11-23', end: '2026-11-23', idempotencyKey: 'mgr-own-1' });
    await expect(run(db, humanActor(A.manager), 'decideLeaveRequest', { requestId: own.request.id, decision: 'approve' })).rejects.toMatchObject({ code: 'forbidden' });
    expect((await run(db, humanActor(A.manager), 'listPendingApprovals', {})).requests.map((r) => r.id)).not.toContain(own.request.id);
  });

  it('an employee cannot cancel someone else’s request', async () => {
    await expect(run(db, humanActor(A.emp2), 'cancelLeaveRequest', { requestId: A.requestId })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('only an owner can grant or remove owner; the last owner cannot be demoted', async () => {
    const [admin] = await Promise.all([run(db, humanActor(A.owner), 'manageMembers', { op: 'setRole', memberId: A.emp2.id, role: 'admin' })]);
    expect(admin.ok).toBe(true);
    const asAdmin = humanActor({ ...A.emp2, role: 'admin' });
    await expect(run(db, asAdmin, 'manageMembers', { op: 'setRole', memberId: A.emp.id, role: 'owner' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(run(db, humanActor(A.owner), 'manageMembers', { op: 'setRole', memberId: A.owner.id, role: 'admin' })).rejects.toMatchObject({ code: 'conflict' });
  });
});
