import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/db/client';
import { auditLog, hrTasks, leaveRequests, members, shadowDecisions } from '@/db/schema';
import { advanceEscalations } from '@/domain/escalation';
import { invokeCapability, type CapabilityName } from './registry';
import { buildOrg, humanActor, NOW, run } from '@/test/fixtures';
import { freshDb } from '@/test/db';
import type { Actor } from './types';

/*
 * The automated decision flow (0009): one decision packet, per-team approval policies, the
 * soft-rule fix, the submit lock, protected leave, declines with reasons and review, approve all
 * clean, escalation, request windows and shadow replay. The route never declines.
 */

let db: Db;
let A: Awaited<ReturnType<typeof buildOrg>>;
const at = <N extends CapabilityName>(actor: Actor, name: N, input: unknown, now: Date) => invokeCapability(name, { db, actor, now }, input);
const owner = () => humanActor(A.owner);
const level = (l: 0 | 1 | 2 | 3) => run(db, owner(), 'manageOrgSetup', { op: 'setAutonomy', capability: 'decideLeaveRequest', actorClass: 'assistant', level: l });
const optIn = (max = 3) => run(db, owner(), 'manageOrgSetup', { op: 'upsertLeaveType', key: 'vacation', name: 'Vacation', autoApprove: true, maxAutoApproveDays: max });
const submit = (who: 'emp' | 'emp2', start: string, end: string, key: string, extra: object = {}) =>
  run(db, humanActor(A[who]), 'submitLeaveRequest', { start, end, idempotencyKey: key, ...extra });

beforeEach(async () => {
  db = await freshDb();
  A = await buildOrg(db, 'Acme');
});

describe('the soft-rule bug and the submit lock', () => {
  it('a soft "max away" warning no longer auto-approves, and the requester gets better dates', async () => {
    await level(3);
    await optIn(2);
    await run(db, owner(), 'manageOrgSetup', { op: 'addPolicyRule', kind: 'max_out', name: 'Eng max 1', hard: false, maxOut: 1, teamIds: [A.team.id] });
    // emp already has Nov 16–17 pending (fixture). emp2 asks for Nov 16.
    const draft = await run(db, humanActor(A.emp2), 'draftLeaveRequest', { start: '2026-11-16', end: '2026-11-16' });
    expect(draft.canSubmit).toBe(true);
    expect(draft.decision!.route).toBe('needs_person');
    expect(draft.decision!.blockers.join(' ')).toMatch(/Eng max 1: on 2026-11-16 2 people would be away; the limit is 1/);
    expect(draft.decision!.checklist).toContainEqual(expect.objectContaining({ kind: 'max_out', status: 'warn', fix: expect.stringMatching(/suggested dates/) }));
    expect(draft.decision!.alternatives.length).toBeGreaterThan(0);
    expect(draft.decision!.alternatives.every((a) => a.start !== '2026-11-16' && a.start !== '2026-11-17')).toBe(true);
    expect(draft.decision!.alternatives[0]!.wouldAutoApprove).toBe(true);
    const s = await submit('emp2', '2026-11-16', '2026-11-16', 'soft-max-1');
    expect(s.request.status).toBe('pending');
    // The suggested date auto-approves.
    const alt = draft.decision!.alternatives[0]!;
    expect((await submit('emp2', alt.start, alt.end, 'soft-max-2')).request.status).toBe('approved');
  });

  it('two requests at once against "max 1 away" give one approved and one pending', async () => {
    await level(3);
    await optIn(2);
    await run(db, owner(), 'manageOrgSetup', { op: 'addPolicyRule', kind: 'max_out', name: 'Eng max 1', hard: false, maxOut: 1, teamIds: [A.team.id] });
    const [a, b] = await Promise.all([submit('emp', '2026-12-07', '2026-12-07', 'race-a-1'), submit('emp2', '2026-12-07', '2026-12-07', 'race-b-1')]);
    expect([a.request.status, b.request.status].sort()).toEqual(['approved', 'pending']);
  });
});

describe('approval policies per team', () => {
  it('auto needs autonomy L3 (master switch); limits on size and notice; the most specific policy wins', async () => {
    await run(db, owner(), 'manageOrgSetup', { op: 'setApprovalPolicy', name: 'Everyone', mode: 'off' });
    await run(db, owner(), 'manageOrgSetup', { op: 'setApprovalPolicy', name: 'Eng fast lane', mode: 'auto', teamIds: [A.team.id], leaveTypeKeys: ['vacation'], maxDays: 3, minNoticeDays: 7, toleratedWarnings: ['event'] });
    // L1 (default): auto only suggests.
    const d1 = await run(db, humanActor(A.emp2), 'draftLeaveRequest', { start: '2026-12-08', end: '2026-12-08' });
    expect(d1.decision).toMatchObject({ route: 'needs_person', wouldAutoApprove: true, policy: { name: 'Eng fast lane', mode: 'suggest' } });
    await level(3);
    const ok = await submit('emp2', '2026-12-08', '2026-12-08', 'pol-ok-1');
    expect(ok.request).toMatchObject({ status: 'approved', autoApproved: true });
    const [audit] = await db.select().from(auditLog).where(and(eq(auditLog.orgId, A.org.id), eq(auditLog.clientId, 'auto-approval')));
    expect(audit!.summary).toMatch(/policy "Eng fast lane"/);
    // Under 7 days' notice: waits.
    expect((await submit('emp2', '2026-11-05', '2026-11-05', 'pol-notice-1')).request.status).toBe('pending');
    // 4 days > 3.
    expect((await submit('emp2', '2026-12-14', '2026-12-17', 'pol-size-1')).request.status).toBe('pending');
    // A tolerated warning (team event) still auto-approves.
    await run(db, owner(), 'manageTeamEvents', { op: 'create', title: 'Retro', date: '2026-12-21' });
    expect((await submit('emp2', '2026-12-21', '2026-12-21', 'pol-event-1')).request.status).toBe('approved');
    // L0 turns everything off.
    await level(0);
    expect((await run(db, humanActor(A.emp2), 'draftLeaveRequest', { start: '2026-12-09', end: '2026-12-09' })).decision!.policy.mode).toBe('off');
  });

  it('only admins manage approval policies', async () => {
    await expect(run(db, humanActor(A.manager), 'manageOrgSetup', { op: 'setApprovalPolicy', name: 'x', mode: 'auto' })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('shadow mode records what it would do next to the human decision, and the replay counts it', async () => {
    await level(3);
    const pol = await run(db, owner(), 'manageOrgSetup', { op: 'setApprovalPolicy', name: 'Eng shadow', mode: 'shadow', teamIds: [A.team.id] });
    const s = await submit('emp2', '2026-12-08', '2026-12-08', 'shadow-1');
    expect(s.request.status).toBe('pending');
    const [row] = await db.select().from(shadowDecisions).where(eq(shadowDecisions.requestId, s.request.id));
    expect(row).toMatchObject({ wouldAutoApprove: true, humanDecision: null });
    await run(db, humanActor(A.manager), 'decideLeaveRequest', { requestId: s.request.id, decision: 'approve' });
    expect((await db.select().from(shadowDecisions).where(eq(shadowDecisions.requestId, s.request.id)))[0]!.humanDecision).toBe('approved');
    await run(db, humanActor(A.manager), 'decideLeaveRequest', { requestId: A.requestId, decision: 'decline', reason: 'coverage' });
    const replay = await run(db, owner(), 'getShadowReplay', { policyId: pol.id });
    expect(replay).toMatchObject({ decided: 2, wouldAutoApprove: 2, approvedOfThose: 1 });
    expect(replay.declinedOfThose).toEqual([expect.objectContaining({ requestId: A.requestId, reason: 'coverage' })]);
  });
});

describe('protected and health-related leave', () => {
  it('protected leave is recorded, routed to HR with a due date, and never approved or declined', async () => {
    await run(db, owner(), 'manageOrgSetup', { op: 'upsertLeaveType', key: 'jury', name: 'Jury duty', countsAgainstBalance: false, protectedCategory: 'jury' });
    const d = await run(db, humanActor(A.emp2), 'draftLeaveRequest', { leaveType: 'jury', start: '2026-11-24', end: '2026-11-24' });
    expect(d.decision).toMatchObject({ route: 'recorded_protected', alternatives: [] });
    const s = await submit('emp2', '2026-11-24', '2026-11-24', 'jury-0001', { leaveType: 'jury' });
    expect(s.request.status).toBe('recorded');
    const tasks = await run(db, owner(), 'listHrTasks', {});
    expect(tasks.tasks).toEqual([expect.objectContaining({ kind: 'protected_ack', dueAt: '2026-11-09', request: expect.objectContaining({ id: s.request.id }) })]);
    await expect(run(db, humanActor(A.manager), 'decideLeaveRequest', { requestId: s.request.id, decision: 'decline', reason: 'coverage' })).rejects.toMatchObject({ code: 'conflict' });
    expect((await run(db, humanActor(A.manager), 'listPendingApprovals', {})).requests.map((r) => r.id)).not.toContain(s.request.id);
    // Calendars show the person as out, never the category.
    const who = await run(db, humanActor(A.emp), 'whoIsOut', { from: '2026-11-24', to: '2026-11-24' });
    expect(who.teams.flatMap((t) => t.out)).toContainEqual(expect.objectContaining({ memberId: A.emp2.id, status: 'approved', leaveType: null }));
    await run(db, owner(), 'completeHrTask', { taskId: tasks.tasks[0]!.id });
    expect((await run(db, owner(), 'listHrTasks', {})).tasks).toEqual([]);
    await expect(run(db, humanActor(A.manager), 'listHrTasks', {})).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('a long sick absence starts a possible-FMLA task (facts, not a determination); hard rules on sick are refused', async () => {
    const s = await submit('emp2', '2026-11-09', '2026-11-12', 'sick-long-1', { leaveType: 'sick' });
    expect(s.request.status).toBe('approved');
    const [task] = (await run(db, owner(), 'listHrTasks', {})).tasks;
    expect(task).toMatchObject({ kind: 'fmla_notice', dueAt: '2026-11-09', citation: { section: '825.300(b)(1)' }, facts: { startDate: '2024-01-01' } });
    expect(task!.request!.leaveType).toBe('leave');
    // Three calendar days is not "more than three".
    await submit('emp', '2026-11-23', '2026-11-25', 'sick-short-1', { leaveType: 'sick' });
    expect((await db.select().from(hrTasks).where(eq(hrTasks.orgId, A.org.id))).length).toBe(1);
    await expect(run(db, owner(), 'manageOrgSetup', { op: 'addBlackout', start: '2026-12-01', end: '2026-12-31', reason: 'x', hard: true, leaveTypeKeys: ['sick'] })).rejects.toMatchObject({
      code: 'invalid_input',
      message: expect.stringMatching(/246\.5/),
    });
    await expect(run(db, owner(), 'manageOrgSetup', { op: 'addPolicyRule', kind: 'max_out', name: 'x', maxOut: 1, leaveTypeKeys: ['sick'] })).rejects.toMatchObject({ code: 'invalid_input' });
    // A hard org-wide rule still never blocks sick leave.
    await run(db, owner(), 'manageOrgSetup', { op: 'addBlackout', start: '2026-12-01', end: '2026-12-31', reason: 'Freeze', hard: true });
    expect((await submit('emp2', '2026-12-02', '2026-12-02', 'sick-in-freeze', { leaveType: 'sick' })).request.status).toBe('approved');
    await expect(submit('emp2', '2026-12-03', '2026-12-03', 'vac-in-freeze')).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('declines, reviews and approve all clean', () => {
  it('a decline needs a reason, carries other dates, and the requester can ask a different person to review once', async () => {
    const mgr = humanActor(A.manager);
    await expect(run(db, mgr, 'decideLeaveRequest', { requestId: A.requestId, decision: 'decline' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(run(db, mgr, 'decideLeaveRequest', { requestId: A.requestId, decision: 'decline', reason: 'other' })).rejects.toMatchObject({ code: 'invalid_input' });
    const d = await run(db, mgr, 'decideLeaveRequest', { requestId: A.requestId, decision: 'decline', reason: 'coverage' });
    expect(d.request.status).toBe('declined');
    expect(d.alternatives!.length).toBeGreaterThan(0);
    const [row] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, A.requestId));
    expect(row!.declineReason).toBe('coverage');

    await run(db, humanActor(A.emp), 'requestReview', { requestId: A.requestId });
    expect((await run(db, mgr, 'listPendingApprovals', {})).requests.map((r) => r.id)).not.toContain(A.requestId);
    const q = await run(db, owner(), 'listPendingApprovals', {});
    expect(q.requests.find((r) => r.id === A.requestId)!.waiting.review).toBe(true);
    await run(db, owner(), 'decideLeaveRequest', { requestId: A.requestId, decision: 'decline', reason: 'peak_period' });
    await expect(run(db, humanActor(A.emp), 'requestReview', { requestId: A.requestId })).rejects.toMatchObject({ code: 'conflict' });
    await expect(run(db, humanActor(A.emp2), 'requestReview', { requestId: A.requestId })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('approve all clean approves only requests every check passes for', async () => {
    await optIn(2);
    const clean = await submit('emp2', '2026-12-07', '2026-12-07', 'clean-0001');
    const big = await submit('emp2', '2026-12-14', '2026-12-16', 'big-00001');
    const r = await run(db, humanActor(A.manager), 'approveAllClean', {});
    expect(r.approved).toContain(clean.request.id);
    expect(r.approved).not.toContain(big.request.id);
    expect(r.skipped).toBeGreaterThanOrEqual(1);
    const audits = await db.select().from(auditLog).where(and(eq(auditLog.orgId, A.org.id), eq(auditLog.capability, 'decideLeaveRequest')));
    expect(audits.length).toBeGreaterThanOrEqual(r.approved.length);
  });

  it('the approver card shows every check, the recommendation and what changed since submit', async () => {
    await run(db, owner(), 'manageOrgSetup', { op: 'addPolicyRule', kind: 'max_out', name: 'Eng max 1', hard: false, maxOut: 1, teamIds: [A.team.id] });
    const q = await run(db, humanActor(A.manager), 'listPendingApprovals', {});
    const item = q.requests.find((r) => r.id === A.requestId)!;
    expect(item.decision.checklist.map((c) => c.kind)).toEqual(expect.arrayContaining(['balance', 'coverage', 'blackout', 'max_out', 'event']));
    expect(item.changedSinceSubmit).toEqual([]);
    await submit('emp2', '2026-11-16', '2026-11-16', 'second-away');
    const q2 = await run(db, humanActor(A.manager), 'listPendingApprovals', {});
    const again = q2.requests.find((r) => r.id === A.requestId)!;
    expect(again.decision.recommendation).toBe('likely_decline');
    expect(again.changedSinceSubmit.join(' ')).toMatch(/2 people would be away/);
  });
});

describe('escalation (exceptions only, never approval by silence)', () => {
  it('reminds after the SLA, escalates to the backup, skips an approver who is away, and never approves', async () => {
    await run(db, owner(), 'manageOrgSetup', { op: 'setTeamApprovers', teamId: A.team.id, approverMemberId: A.manager.id, backupApproverMemberId: A.owner.id });
    const s = await submit('emp2', '2026-12-14', '2026-12-14', 'esc-00001');
    const [row] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, s.request.id));
    const t0 = row!.createdAt.getTime();
    const h = (n: number) => new Date(t0 + n * 3_600_000);
    // The fixture's own request (Nov 16) is older; only look at ours.
    const mine = (steps: Awaited<ReturnType<typeof advanceEscalations>>) => steps.filter((x) => x.requestId === s.request.id);
    expect(mine(await advanceEscalations(db, A.org.id, h(2)))).toEqual([]);
    expect(mine(await advanceEscalations(db, A.org.id, h(25)))).toEqual([{ requestId: s.request.id, kind: 'reminder', to: [A.manager.id], level: 0 }]);
    expect(mine(await advanceEscalations(db, A.org.id, h(26)))).toEqual([]); // idempotent
    expect(mine(await advanceEscalations(db, A.org.id, h(49)))).toEqual([{ requestId: s.request.id, kind: 'escalated', to: [A.owner.id], level: 1 }]);
    const [after] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, s.request.id));
    expect(after!.status).toBe('pending');
    expect(after!.escalationLevel).toBe(1);
  });

  it('a request starting within 2 working days escalates at once; an away approver is skipped', async () => {
    await run(db, owner(), 'manageOrgSetup', { op: 'setTeamApprovers', teamId: A.team.id, approverMemberId: A.manager.id, backupApproverMemberId: A.owner.id });
    // The manager is on approved leave today.
    await db.insert(leaveRequests).values({ orgId: A.org.id, memberId: A.manager.id, leaveTypeId: A.vacation.id, status: 'approved', startDate: '2026-11-02', endDate: '2026-11-06', engineSnapshot: { amount: 5, unit: 'days', chargedDates: [] } });
    const s = await submit('emp2', '2026-11-04', '2026-11-04', 'esc-urgent');
    const steps = (await advanceEscalations(db, A.org.id, NOW)).filter((x) => x.requestId === s.request.id);
    // Ladder without the away manager: [owner]; urgent → level 1 is capped at the last person, so a reminder goes to the owner.
    expect(steps[0]!.to).toEqual([A.owner.id]);
    expect((await db.select().from(members).where(eq(members.id, A.manager.id)))[0]!.role).toBe('manager');
  });
});

describe('request windows (no first come, first served)', () => {
  it('collects, then shares places by the tie-break; a person confirms and the others get a reason and dates', async () => {
    await level(3);
    await optIn(3);
    const rule = await run(db, owner(), 'manageOrgSetup', {
      op: 'addPolicyRule',
      kind: 'request_window',
      name: 'Holidays',
      start: '2026-12-21',
      end: '2026-12-31',
      collectUntil: '2026-11-15',
      slots: 1,
      tieBreak: 'seniority',
      teamIds: [A.team.id],
    });
    await db.update(members).set({ startDate: '2020-05-01' }).where(eq(members.id, A.emp2.id));
    const a = await submit('emp', '2026-12-22', '2026-12-22', 'win-a-0001');
    const b = await submit('emp2', '2026-12-22', '2026-12-22', 'win-b-0001');
    expect([a.request.status, b.request.status]).toEqual(['pending', 'pending']);
    const coll = await run(db, humanActor(A.emp), 'getRequestWindows', {});
    expect(coll.windows[0]).toMatchObject({ status: 'collecting', requests: 2, allocation: [] });
    await expect(run(db, humanActor(A.manager), 'confirmRequestWindow', { ruleId: rule.id })).rejects.toMatchObject({ code: 'conflict' });

    const later = new Date('2026-11-16T09:00:00Z');
    const ready = await at(humanActor(A.manager), 'getRequestWindows', {}, later);
    expect(ready.windows[0]!.status).toBe('ready');
    expect(ready.windows[0]!.allocation.map((x) => [x.requestId, x.in])).toEqual([
      [b.request.id, true],
      [a.request.id, false],
    ]);
    const c = await at(humanActor(A.manager), 'confirmRequestWindow', { ruleId: rule.id }, later);
    expect(c).toEqual({ approved: 1, declined: 1, skipped: 0 });
    const [ra] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, a.request.id));
    expect(ra).toMatchObject({ status: 'declined', declineReason: 'peak_period' });
    expect((await at(humanActor(A.manager), 'getRequestWindows', {}, later)).windows[0]!.status).toBe('confirmed');
  });
});

describe('reports', () => {
  it('count auto-approvals, reversals and HR tasks', async () => {
    await level(3);
    await optIn(2);
    const s = await submit('emp2', '2026-11-23', '2026-11-23', 'rep-auto-1');
    await submit('emp', '2026-11-24', '2026-11-25', 'rep-auto-2');
    await run(db, humanActor(A.manager), 'decideLeaveRequest', { requestId: s.request.id, decision: 'decline' });
    const r = await run(db, owner(), 'getAbsenceReport', { from: '2026-11-01', to: '2026-11-30' });
    expect(r.automation).toMatchObject({ autoApproved: 1, reversed: 1 });
  });
});
