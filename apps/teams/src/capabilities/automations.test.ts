import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '@/db/client';
import { leaveTypes, memberLocationHistory, members, organizations } from '@/db/schema';
import { setAiProvider, mockProvider, type AiProvider } from '@/ai/provider';
import { approvalRoute } from '@/domain/routing';
import { freshDb } from '@/test/db';
import { buildOrg, humanActor, NOW, run } from '@/test/fixtures';
import type { Actor } from './types';

/*
 * Approval routing, policy automations (scoped blackouts, probation, max away), the accrual plan
 * gate, groups, absence reports with the AI summary and its fallback, policy questions, team
 * events and employee data updates.
 */

let db: Db;
let O: Awaited<ReturnType<typeof buildOrg>>;
let lead: typeof members.$inferSelect;
let newbie: typeof members.$inferSelect;
const owner = () => humanActor(O.owner);

beforeAll(async () => {
  db = await freshDb();
  O = await buildOrg(db, 'Routed');
  [lead] = await db.insert(members).values({ orgId: O.org.id, name: 'Routed Lead', role: 'manager', locationId: O.location.id, startDate: '2020-01-01', email: 'lead@routed.test' }).returning();
  [newbie] = await db.insert(members).values({ orgId: O.org.id, name: 'Routed Newbie', role: 'employee', teamId: O.team.id, locationId: O.location.id, startDate: '2026-10-01' }).returning();
});

describe('approval routing', () => {
  it('without team approvers: manager first, then admins', async () => {
    const r = await approvalRoute(db, O.org.id, O.emp);
    expect(r.basis).toBe('manager');
    expect(r.primary?.id).toBe(O.manager.id);
    expect(r.deciders.map((d) => d.id)).toEqual([O.manager.id, O.owner.id]);
  });

  it('only managers and admins can be team approvers', async () => {
    await expect(run(db, owner(), 'manageOrgSetup', { op: 'setTeamApprovers', teamId: O.team.id, approverMemberId: O.emp2.id })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(run(db, humanActor(O.manager), 'manageOrgSetup', { op: 'setTeamApprovers', teamId: O.team.id, approverMemberId: lead!.id })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('a team approver from outside the team can see and decide the team’s requests', async () => {
    const L = humanActor(lead!);
    expect((await run(db, L, 'listPendingApprovals', {})).requests).toEqual([]);
    await run(db, owner(), 'manageOrgSetup', { op: 'setTeamApprovers', teamId: O.team.id, approverMemberId: lead!.id, backupApproverMemberId: O.manager.id });
    const r = await approvalRoute(db, O.org.id, O.emp);
    expect(r).toMatchObject({ basis: 'team_approver', primary: { id: lead!.id }, backup: { id: O.manager.id } });
    const q = await run(db, L, 'listPendingApprovals', {});
    expect(q.requests.map((x) => x.id)).toContain(O.requestId);
    const d = await run(db, L, 'decideLeaveRequest', { requestId: O.requestId, decision: 'approve' });
    expect(d.request.status).toBe('approved');
    const setup = await run(db, owner(), 'getOrgSetup', {});
    expect(setup.teams.find((t) => t.id === O.team.id)).toMatchObject({ approverMemberId: lead!.id, backupApproverMemberId: O.manager.id });
  });

  it('a demoted approver drops out of the route', async () => {
    await db.update(members).set({ role: 'employee' }).where(eq(members.id, lead!.id));
    const r = await approvalRoute(db, O.org.id, O.emp);
    expect(r.primary?.id).toBe(O.manager.id);
    await db.update(members).set({ role: 'manager' }).where(eq(members.id, lead!.id));
  });
});

describe('policy automations', () => {
  const draft = (actor: Actor, start: string, end = start, leaveType = 'vacation') => run(db, actor, 'draftLeaveRequest', { leaveType, start, end });

  it('a blackout scoped to vacation at one site does not touch sick leave or other sites', async () => {
    await run(db, owner(), 'manageOrgSetup', { op: 'addBlackout', start: '2026-12-21', end: '2026-12-24', reason: 'Holiday rush', hard: true, leaveTypeKeys: ['vacation'], locationIds: [O.location.id] });
    const v = await draft(humanActor(O.emp2), '2026-12-22');
    expect(v.problems).toContain('Blackout 2026-12-21 to 2026-12-24: Holiday rush.');
    const s = await draft(humanActor(O.emp2), '2026-12-22', '2026-12-22', 'sick');
    expect(s.problems.join(' ')).not.toMatch(/Holiday rush/);
  });

  it('probation blocks leave until N days after the start date', async () => {
    await run(db, owner(), 'manageOrgSetup', { op: 'addPolicyRule', kind: 'probation', name: 'Probation', minDays: 90, leaveTypeKeys: ['vacation'] });
    const early = await draft(humanActor(newbie!), '2026-12-07');
    expect(early.problems).toContain('Probation: this leave can be taken from 2026-12-30 (90 days after the start date).');
    await expect(run(db, owner(), 'manageOrgSetup', { op: 'addPolicyRule', kind: 'probation', name: 'Bad', minDays: 0 })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('"max away" warns (soft) when a request would put too many people from the group out', async () => {
    const g = await run(db, owner(), 'manageOrgSetup', { op: 'addGroup', name: 'Front desk' });
    await run(db, owner(), 'manageOrgSetup', { op: 'setGroupMembers', groupId: g.id!, memberIds: [O.emp.id, O.emp2.id, O.manager.id] });
    await run(db, owner(), 'manageOrgSetup', { op: 'addPolicyRule', kind: 'max_out', name: 'Front desk cover', maxOut: 1, hard: false, groupIds: [g.id!] });
    // O.emp is already approved for 2026-11-16 to 17.
    const d = await draft(humanActor(O.emp2), '2026-11-17');
    expect(d.warnings).toContain('Front desk cover: on 2026-11-17 2 people would be away; the limit is 1.');
    expect(d.problems).toEqual([]);
    const setup = await run(db, owner(), 'getOrgSetup', {});
    expect(setup.groups.find((x) => x.name === 'Front desk')?.memberIds).toHaveLength(3);
    expect(setup.policyRules.map((r) => r.name)).toEqual(['Probation', 'Front desk cover']);
  });

  it('a team event on the day is a soft warning on the request', async () => {
    const e = await run(db, humanActor(O.manager), 'manageTeamEvents', { op: 'create', title: 'Quarterly planning', date: '2026-12-03', start: '10:00', end: '12:00', teamIds: [O.team.id] });
    expect(e).toMatchObject({ expected: 5, away: 0 });
    const d = await draft(humanActor(O.emp2), '2026-12-03');
    expect(d.warnings).toContain('Overlaps a team event: Quarterly planning on 2026-12-03.');
  });
});

describe('accrual schedules and the plan flag', () => {
  const biweekly = { unit: 'days', accrual: { method: 'per_pay_period', annualAllowance: 20, payPeriod: 'biweekly' }, planYear: { type: 'calendar' }, carryover: { type: 'upTo', max: 5 }, accrualCap: 30 };

  it('Starter: monthly works; weekly, biweekly and semimonthly need Complete; sick leave is exempt', async () => {
    await expect(run(db, owner(), 'manageOrgSetup', { op: 'savePolicy', leaveType: 'vacation', effectiveFrom: '2027-01-01', policy: biweekly })).rejects.toMatchObject({ code: 'forbidden' });
    await run(db, owner(), 'manageOrgSetup', { op: 'savePolicy', leaveType: 'vacation', effectiveFrom: '2027-01-01', policy: { ...biweekly, accrual: { ...biweekly.accrual, payPeriod: 'monthly' } } });
    const [sick] = await db.select().from(leaveTypes).where(and(eq(leaveTypes.orgId, O.org.id), eq(leaveTypes.key, 'sick')));
    if (sick) await run(db, owner(), 'manageOrgSetup', { op: 'savePolicy', leaveType: 'sick', effectiveFrom: '2027-01-01', policy: { ...biweekly, accrual: { ...biweekly.accrual, payPeriod: 'weekly' } } });
    expect((await run(db, owner(), 'getOrgSetup', {})).org.plan).toBe('starter');
  });

  it('Complete: any schedule, with caps and carryover', async () => {
    await db.update(organizations).set({ plan: 'complete' }).where(eq(organizations.id, O.org.id));
    for (const payPeriod of ['weekly', 'biweekly', 'semimonthly']) {
      await run(db, owner(), 'manageOrgSetup', { op: 'savePolicy', leaveType: 'vacation', effectiveFrom: '2027-02-01', policy: { ...biweekly, accrual: { ...biweekly.accrual, payPeriod } } });
    }
    await db.update(organizations).set({ plan: 'starter' }).where(eq(organizations.id, O.org.id));
  });
});

describe('absence report', () => {
  const window = { from: '2026-11-01', to: '2026-11-30' };

  it('engine numbers for the people the caller approves for; employees cannot run it', async () => {
    const r = await run(db, owner(), 'getAbsenceReport', window);
    expect(r.totals.approvedDays).toBe(2);
    expect(r.byType).toEqual([{ key: 'Vacation', label: 'Vacation', days: 2, requests: 1 }]);
    expect(r.approval).toMatchObject({ decided: 1, approved: 1, approvalRatePct: 100 });
    const mgr = await run(db, humanActor(O.manager), 'getAbsenceReport', window);
    expect(mgr.headcount).toBeLessThan(r.headcount);
    await expect(run(db, humanActor(O.emp), 'getAbsenceReport', window)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('the summary falls back to the template with AI off, and to the template when the model invents a number', async () => {
    const off = await run(db, owner(), 'explainAbsenceReport', window);
    expect(off.source.used).toBe('rules');
    expect(off.headline).toMatch(/^2 days of approved leave from 2026-11-01 to 2026-11-30/);
    const liar: AiProvider = {
      name: 'anthropic',
      async complete() {
        return { output: { headline: 'Leave rose 37% this month.', points: ['Approve faster.'] }, model: 'claude-opus-5-5', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 } };
      },
    };
    setAiProvider(liar);
    try {
      const r = await run(db, owner(), 'explainAbsenceReport', window);
      expect(r.source).toMatchObject({ used: 'rules', unavailableReason: expect.stringContaining('37') });
      setAiProvider(mockProvider);
      const m = await run(db, owner(), 'explainAbsenceReport', window);
      expect(m.source.used).toBe('demo');
    } finally {
      setAiProvider(undefined);
    }
  });
});

describe('policy questions', () => {
  it('answers from the engine summary, the rules and the approver, with AI off', async () => {
    const a = await run(db, humanActor(O.emp2), 'askPolicyQuestion', { question: 'When can I take vacation and who approves it?' });
    expect(a.source.used).toBe('rules');
    expect(a.text).toMatch(/Vacation:/);
    expect(a.text).toMatch(/Routed Lead/);
    expect(a.text).toMatch(/No leave from 2026-12-21 to 2026-12-24/);
  });
});

describe('team events', () => {
  it('lists events with who is away, and suggests the dates with fewest people out (managers only)', async () => {
    const list = await run(db, humanActor(O.emp), 'getTeamEvents', { from: '2026-12-01', to: '2026-12-31' });
    expect(list.events[0]).toMatchObject({ title: { untrusted_text: 'Quarterly planning' }, start: '10:00', end: '12:00', includesMe: true });
    const s = await run(db, humanActor(O.manager), 'getTeamEvents', { from: '2026-11-01', to: '2026-11-01', suggest: { from: '2026-11-16', to: '2026-11-20', teamIds: [O.team.id] } });
    expect(s.suggestions!.map((x) => x.date)).toEqual(['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-16', '2026-11-17']);
    expect(s.suggestions![3]).toMatchObject({ out: 1, reasons: { leave: 1 } });
    await expect(run(db, humanActor(O.emp), 'getTeamEvents', { from: '2026-11-01', to: '2026-11-01', suggest: { from: '2026-11-16', to: '2026-11-20' } })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(run(db, humanActor(O.emp), 'manageTeamEvents', { op: 'create', title: 'x', date: '2026-12-01' })).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('employee data updates', () => {
  it('a person proposes, their approver approves, and the record changes (site moves keep history)', async () => {
    const me = humanActor(O.emp2);
    await run(db, owner(), 'manageOrgSetup', { op: 'addLocation', name: 'Second site', countryCode: 'US' });
    const setup = await run(db, owner(), 'getOrgSetup', {});
    const second = setup.locations.find((l) => l.name === 'Second site')!;
    const n = await run(db, me, 'requestProfileChange', { op: 'create', field: 'name', value: 'Routed Emp Two' });
    const l = await run(db, me, 'requestProfileChange', { op: 'create', field: 'location', value: second.id, effectiveFrom: '2027-01-04' });
    await expect(run(db, me, 'requestProfileChange', { op: 'create', field: 'email', value: 'not-an-email' })).rejects.toMatchObject({ code: 'invalid_input' });
    const agent: Actor = { ...me, type: 'agent-on-behalf-of-user', clientId: 'x', onBehalfOfMemberId: O.emp2.id };
    await expect(run(db, agent, 'requestProfileChange', { op: 'create', field: 'name', value: 'Agent' })).rejects.toMatchObject({ code: 'forbidden' });

    const q = await run(db, humanActor(lead!), 'getProfileChanges', {});
    expect(q.toDecide.map((c) => c.field).sort()).toEqual(['location', 'name']);
    expect(q.toDecide.find((c) => c.field === 'location')).toMatchObject({ newValue: { untrusted_text: 'Second site' }, effectiveFrom: '2027-01-04' });
    await expect(run(db, me, 'decideProfileChange', { changeId: n.id, decision: 'approve' })).rejects.toMatchObject({ code: 'forbidden' });
    await run(db, humanActor(lead!), 'decideProfileChange', { changeId: n.id, decision: 'approve' });
    await run(db, humanActor(lead!), 'decideProfileChange', { changeId: l.id, decision: 'approve' });
    const [after] = await db.select().from(members).where(eq(members.id, O.emp2.id));
    expect(after).toMatchObject({ name: 'Routed Emp Two', locationId: second.id });
    const hist = await db.select().from(memberLocationHistory).where(eq(memberLocationHistory.memberId, O.emp2.id));
    expect(hist.at(-1)).toMatchObject({ locationId: second.id, effectiveFrom: '2027-01-04' });
    expect((await run(db, me, 'getProfileChanges', {})).mine.map((c) => c.status)).toEqual(['approved', 'approved']);
    await expect(run(db, humanActor(lead!), 'decideProfileChange', { changeId: n.id, decision: 'decline' })).rejects.toMatchObject({ code: 'conflict' });
  });
});

void NOW;
