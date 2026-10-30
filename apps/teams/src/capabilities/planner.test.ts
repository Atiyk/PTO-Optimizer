import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/db/client';
import { coverageRules } from '@/db/schema';
import { buildOrg, humanActor, run } from '@/test/fixtures';
import { freshDb } from '@/test/db';

/*
 * Default vacation policy: 20 days front-loaded, calendar year, carry up to 5. Today is
 * Mon 2026-11-02, so everyone forfeits on 2027-01-01 whatever is above 5 at year end.
 * Team Eng: owner, manager, emp, emp2, all tagged engineer; rule: at least 1 engineer in.
 */
let db: Db;
let A: Awaited<ReturnType<typeof buildOrg>>;
beforeEach(async () => {
  db = await freshDb();
  A = await buildOrg(db, 'Acme');
});

describe('team planner (Phase 4)', () => {
  it('finds days at risk from the engine and places all of them within coverage', async () => {
    const r = await run(db, humanActor(A.manager), 'runTeamPlan', {});
    const emp = r.people.find((p) => p.memberId === A.emp.id)!;
    expect(emp).toMatchObject({ atRisk: 13, deadline: '2026-12-31', placed: 13, stillLost: 0 }); // 20 - 2 pending - 5 carried
    expect(r.totals).toEqual({ atRisk: 13 + 15 * 3, placed: 58, stillLost: 0, lostToCoverage: 0, partDays: 0 });
    expect(r.exact).toBe(true);
    for (const h of r.heatmap) for (const rule of h.rules) expect(rule.slackLeft).toBeGreaterThanOrEqual(0);
    // At least one engineer is in on every weekday.
    for (const h of r.heatmap) for (const rule of h.rules) expect(rule.present).toBeGreaterThanOrEqual(rule.required);
    expect(r.summary.text).toMatch(/58 days/);
    const again = await run(db, humanActor(A.manager), 'runTeamPlan', {});
    expect(again.people).toEqual(r.people); // deterministic
  });

  it('when coverage leaves no room it says so and plans nothing', async () => {
    await db.update(coverageRules).set({ minPresent: 4 }).where(eq(coverageRules.id, A.rule.id));
    const r = await run(db, humanActor(A.manager), 'runTeamPlan', {});
    expect(r.totals.placed).toBe(0);
    expect(r.totals.stillLost).toBe(r.totals.atRisk);
    expect(r.people.every((p) => p.shortfallReason?.startsWith('Coverage rules leave room'))).toBe(true);
    expect(r.summary.text).toMatch(/minimum possible/);
  });

  it('proposals: sent by the manager, accepted by the member as normal requests, not visible to others', async () => {
    const plan = await run(db, humanActor(A.manager), 'runTeamPlan', {});
    const emp = plan.people.find((p) => p.memberId === A.emp.id)!;
    const sent = await run(db, humanActor(A.manager), 'sendPlanProposals', {
      teamId: plan.team.id, proposals: [{ memberId: A.emp.id, blocks: emp.requests, deadline: emp.deadline }],
    });
    expect(sent).toEqual({ sent: 1, alreadyOpen: 0 });
    expect(await run(db, humanActor(A.manager), 'sendPlanProposals', { teamId: plan.team.id, proposals: [{ memberId: A.emp.id, blocks: emp.requests, deadline: emp.deadline }] })).toEqual({ sent: 0, alreadyOpen: 1 });

    expect((await run(db, humanActor(A.emp2), 'listMyProposals', {})).proposals).toEqual([]);
    const [mine] = (await run(db, humanActor(A.emp), 'listMyProposals', {})).proposals;
    await expect(run(db, humanActor(A.emp2), 'respondToProposal', { proposalId: mine!.id, response: 'accept' })).rejects.toMatchObject({ code: 'not_found' });

    const res = await run(db, humanActor(A.emp), 'respondToProposal', { proposalId: mine!.id, response: 'accept' });
    expect(res.failed).toEqual([]);
    expect(res.submitted.length).toBe(emp.requests.length);
    expect(res.submitted.every((s) => s.status === 'pending')).toBe(true);
    // Accepting twice does not book twice.
    const twice = await run(db, humanActor(A.emp), 'respondToProposal', { proposalId: mine!.id, response: 'accept' });
    expect(twice.submitted.length).toBe(emp.requests.length);
    expect((await run(db, humanActor(A.emp), 'listMyRequests', {})).requests.filter((q) => q.status === 'pending')).toHaveLength(emp.requests.length + 1);
    // Re-planning: emp is no longer at risk.
    const after = await run(db, humanActor(A.manager), 'runTeamPlan', {});
    expect(after.people.find((p) => p.memberId === A.emp.id)).toBeUndefined();
  });

  it('employees cannot run the planner; dismissing a proposal books nothing', async () => {
    await expect(run(db, humanActor(A.emp), 'runTeamPlan', {})).rejects.toMatchObject({ code: 'forbidden' });
    const plan = await run(db, humanActor(A.owner), 'runTeamPlan', {});
    const p = plan.people.find((x) => x.memberId === A.emp2.id)!;
    await run(db, humanActor(A.owner), 'sendPlanProposals', { teamId: plan.team.id, proposals: [{ memberId: A.emp2.id, blocks: p.requests, deadline: p.deadline }] });
    const [mine] = (await run(db, humanActor(A.emp2), 'listMyProposals', {})).proposals;
    await run(db, humanActor(A.emp2), 'respondToProposal', { proposalId: mine!.id, response: 'dismiss' });
    expect((await run(db, humanActor(A.emp2), 'listMyRequests', {})).requests).toEqual([]);
    expect((await run(db, humanActor(A.emp2), 'listMyProposals', {})).proposals).toEqual([]);
  });
});
