import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/db/client';
import { aiUsage, auditLog, coverageRules, leaveRequests, members } from '@/db/schema';
import { invokeCapability } from '@/capabilities/registry';
import { verifyHandbookProposal } from '@/ai/handbook';
import { importHandbookTask } from '@/ai/tasks/importHandbook';
import fixture from '@/demo/handbookFixture.json';
import { DEMO_HANDBOOK } from '@/demo/handbookText';
import { createOrganization } from '@/server/bootstrap';
import { freshDb } from '@/test/db';
import { buildOrg, humanActor, run, snapshotOrg, TODAY } from '@/test/fixtures';
import { readFile } from 'node:fs/promises';

/*
 * Phase 8 acceptance scenarios, one block each, through the same capability layer every surface
 * uses. Scenarios that need HTTP, MCP or Slack plumbing live next to that plumbing and are listed
 * in docs/teams/ACCEPTANCE.md: A8 (src/slack/slack.test.ts), A9, A10 and A12
 * (src/server/agents.test.ts). A1 also has a browser run with clicks and seconds (e2e/walkthrough.mjs).
 * Tests run with AI off (vitest env), so A2 and A3 exercise the no-AI path; the model path is in
 * the evals and the demo's stored real-model result.
 */

let db: Db;
let A: Awaited<ReturnType<typeof buildOrg>>;
beforeEach(async () => {
  db = await freshDb();
  A = await buildOrg(db, 'Acme');
});
const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('acceptance', () => {
  it('A1: sign up and import 12 people from a Timetastic export, well under 5 minutes', async () => {
    const t0 = performance.now();
    const { org, owner } = await createOrganization(
      db,
      { provider: 'dev', subject: 'a1-owner', name: 'Olivia Owner', email: null, slackTeamId: null, issuedAt: 0 },
      { orgName: 'Brightside Studio', countryCode: 'GB', today: TODAY },
    );
    const csv = await readFile('samples/timetastic-users.csv', 'utf8');
    const preview = await run(db, humanActor(owner), 'importCsv', { stage: 'preview', kind: 'members', csv });
    expect([preview.rows.length, preview.errorCount]).toEqual([12, 0]);
    expect((await run(db, humanActor(owner), 'importCsv', { stage: 'commit', kind: 'members', csv })).committed).toBe(12);
    expect(await db.select().from(members).where(eq(members.orgId, org.id))).toHaveLength(13);
    expect(performance.now() - t0).toBeLessThan(5 * 60_000);
  });

  it('A2: handbook → values with citations, "not stated" becomes a question, the injection line does nothing', async () => {
    // No AI: the built-in reader. Every value cites a sentence that is really in the handbook.
    const r = await run(db, humanActor(A.owner), 'importHandbook', { text: DEMO_HANDBOOK });
    expect(r.fields.annualAllowance).toMatchObject({ status: 'verified', value: 20 });
    for (const f of Object.values(r.fields)) if (f.status === 'verified') expect(DEMO_HANDBOOK).toContain(f.quote!.untrusted_text);
    expect(Object.values(r.fields).filter((f) => f.status === 'not_stated').length).toBeGreaterThan(0);
    expect(JSON.stringify(r)).not.toMatch(/unlimited/i);
    expect(r.policy).toMatchObject({ accrual: { method: 'front_loaded', annualAllowance: 20 } });

    // The model's reading of the same handbook (stored from a real run), through the same checks.
    const m = verifyHandbookProposal(DEMO_HANDBOOK, importHandbookTask.output.parse(fixture.proposal));
    expect(m.fields.annualAllowance).toMatchObject({ status: 'verified', value: 20 });
    expect(m.questions.join(' ')).toMatch(/part-time/i); // not stated → a question, not a guess
    expect(m.questions.join(' ')).toMatch(/unlimited vacation/i); // the injection is flagged, not obeyed
    expect(JSON.stringify(m.policy)).not.toContain('unlimited');
  });

  it('A3: "next Friday and Monday off" → Friday through Monday, the Monday holiday not deducted', async () => {
    // Mon 4 Jan 2027: next Friday is 15 Jan; the Monday after it is Martin Luther King Jr. Day.
    const ctx = { db, actor: humanActor(A.emp2), now: at('2027-01-04') };
    const p = await invokeCapability('parseLeaveRequestText', ctx, { text: 'next Friday and Monday off' });
    expect(p.fields).toMatchObject({ leaveType: 'vacation', start: '2027-01-15', end: '2027-01-18', clarifyingQuestion: null });
    expect(p.evaluation!.deducts).toBe(1);
    expect(p.evaluation!.excluded).toContainEqual(expect.objectContaining({ date: '2027-01-18', reason: 'holiday' }));
  });

  it('A4: auto-approval with its reason, and a coverage conflict that waits for the manager', async () => {
    await run(db, humanActor(A.owner), 'manageOrgSetup', { op: 'upsertLeaveType', key: 'vacation', name: 'Vacation', autoApprove: true, maxAutoApproveDays: 2 });
    await run(db, humanActor(A.owner), 'manageOrgSetup', { op: 'setAutonomy', capability: 'decideLeaveRequest', actorClass: 'assistant', level: 3 });
    const clean = await run(db, humanActor(A.emp2), 'submitLeaveRequest', { start: '2026-12-07', end: '2026-12-07', idempotencyKey: 'a4-clean-1' });
    expect(clean.request).toMatchObject({ status: 'approved', autoApproved: true });
    const why = await db.select().from(auditLog).where(and(eq(auditLog.orgId, A.org.id), eq(auditLog.clientId, 'auto-approval')));
    expect(why.map((w) => w.summary)).toEqual([expect.stringMatching(/Vacation, 1 day \(limit 2\), balance after 19, no coverage gap, no blackout; manager can reverse until/)]);

    // 4 engineers, rule "at least 3 in"; Emp is already off on 16 Nov, so Emp2 taking it too breaks the rule.
    await db.update(coverageRules).set({ minPresent: 3 }).where(eq(coverageRules.id, A.rule.id));
    const clash = await run(db, humanActor(A.emp2), 'submitLeaveRequest', { start: '2026-11-16', end: '2026-11-16', idempotencyKey: 'a4-clash-1' });
    expect(clash.request.status).toBe('pending');
    const queue = await run(db, humanActor(A.manager), 'listPendingApprovals', {});
    const item = queue.requests.find((r) => r.id === clash.request.id)!;
    expect(item.impact.coverage).toContainEqual(expect.objectContaining({ date: '2026-11-16', required: 3, present: 2 }));
    expect(item.autoApproval?.blockers).toContain('Would leave the team below its coverage minimum.');
  });

  it('A5: planner, 8 engineers, 41 days at risk, at least 2 in every day, the same plan every time', async () => {
    for (const n of ['E5', 'E6', 'E7', 'E8']) {
      await db.insert(members).values({ orgId: A.org.id, name: `Acme ${n}`, role: 'employee', teamId: A.team.id, locationId: A.location.id, startDate: '2024-01-01', managerId: A.manager.id, tags: ['engineer'] });
    }
    await db.update(coverageRules).set({ minPresent: 2 }).where(eq(coverageRules.id, A.rule.id));
    // Bring each person's days at risk to a fixed amount that sums to 41.
    const before = await run(db, humanActor(A.manager), 'runTeamPlan', {});
    expect(before.people).toHaveLength(8);
    const targets = [6, 5, 5, 5, 5, 5, 5, 5];
    for (const [i, p] of before.people.entries()) {
      await run(db, humanActor(A.owner), 'adjustBalance', { memberId: p.memberId, leaveType: 'vacation', amount: targets[i]! - p.atRisk, effectiveDate: '2026-11-01', reason: 'A5 scenario' });
    }
    const plan = await run(db, humanActor(A.manager), 'runTeamPlan', {});
    expect(plan.totals.atRisk).toBe(41);
    expect(plan.totals).toMatchObject({ placed: 41, stillLost: 0 });
    for (const d of plan.heatmap) for (const rule of d.rules) expect(rule.present).toBeGreaterThanOrEqual(2);
    const again = await run(db, humanActor(A.manager), 'runTeamPlan', {});
    expect(again.people).toEqual(plan.people);
    expect(again.heatmap).toEqual(plan.heatmap);
  });

  it('A6: another org cannot read or change this org, and this org is unchanged', async () => {
    const B = await buildOrg(db, 'Globex');
    const before = await snapshotOrg(db, A.org.id);
    await expect(run(db, humanActor(B.manager), 'decideLeaveRequest', { requestId: A.requestId, decision: 'approve' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(run(db, humanActor(B.owner), 'adjustBalance', { memberId: A.emp.id, leaveType: 'vacation', amount: 5, effectiveDate: TODAY, reason: 'A6 attack' })).rejects.toMatchObject({ code: 'not_found' });
    const out = await run(db, humanActor(B.owner), 'whoIsOut', { from: '2026-11-16', to: '2026-11-17' });
    expect(JSON.stringify(out)).not.toContain('Acme');
    expect(await snapshotOrg(db, A.org.id)).toEqual(before);
  });

  it('A7: with AI disabled every form still works, and nothing is billed', async () => {
    const words = await run(db, humanActor(A.emp2), 'parseLeaveRequestText', { text: 'Dec 22 to Jan 2' });
    expect(words.source.used).toBe('rules');
    expect(words.fields).toMatchObject({ start: '2026-12-22', end: '2027-01-02' });
    expect((await run(db, humanActor(A.owner), 'importHandbook', { text: DEMO_HANDBOOK })).source.used).toBe('rules');
    expect((await run(db, humanActor(A.emp2), 'explainBalanceInWords', { leaveType: 'vacation' })).source.used).toBe('rules');
    const plan = await run(db, humanActor(A.manager), 'runTeamPlan', {});
    expect(plan.summary.source).toBe('rules');
    const s = await run(db, humanActor(A.emp2), 'submitLeaveRequest', { start: '2026-12-07', end: '2026-12-08', idempotencyKey: 'a7-form-1' });
    expect(s.request.status).toBe('pending');
    expect(await db.select().from(aiUsage)).toHaveLength(0);
  });

  it('A11: L3 approves vacation of 2 days or less, reversibly; lowering to L2 sends the same request to the manager', async () => {
    await run(db, humanActor(A.owner), 'manageOrgSetup', { op: 'upsertLeaveType', key: 'vacation', name: 'Vacation', autoApprove: true, maxAutoApproveDays: 2 });
    const level = (l: 2 | 3) => run(db, humanActor(A.owner), 'manageOrgSetup', { op: 'setAutonomy', capability: 'decideLeaveRequest', actorClass: 'assistant', level: l, reversibleMinutes: 60 });
    await level(3);
    const two = await run(db, humanActor(A.emp2), 'submitLeaveRequest', { start: '2026-12-07', end: '2026-12-08', idempotencyKey: 'a11-two-1' });
    expect(two.request).toMatchObject({ status: 'approved', autoApproved: true });
    const three = await run(db, humanActor(A.emp2), 'submitLeaveRequest', { start: '2026-12-14', end: '2026-12-16', idempotencyKey: 'a11-three' });
    expect(three.request.status).toBe('pending');
    // Reversible: the manager undoes it inside the window and the days come back.
    await run(db, humanActor(A.manager), 'decideLeaveRequest', { requestId: two.request.id, decision: 'decline', note: 'undo' });
    const [undone] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, two.request.id));
    expect(undone!.status).toBe('declined');

    await level(2);
    const again = await run(db, humanActor(A.emp2), 'submitLeaveRequest', { start: '2026-12-07', end: '2026-12-08', idempotencyKey: 'a11-two-l2' });
    expect(again.request.status).toBe('pending');
  });
});

