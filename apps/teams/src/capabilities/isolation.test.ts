import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '@/db/client';
import { CAPABILITIES, type CapabilityName } from './registry';
import { authenticateBearer } from '@/lib/agentAuth';
import { callAsAgent } from '@/server/agentGateway';
import { buildOrg, humanActor, NOW, run, snapshotOrg } from '@/test/fixtures';
import { freshDb } from '@/test/db';

/*
 * A6 / tenant isolation: an admin of org A tries to read or change org B's objects through
 * every capability that takes an id. Every attempt must fail with not_found/forbidden (or,
 * for list-style reads, return nothing of B's), and B must be unchanged afterwards.
 */

let db: Db;
let A: Awaited<ReturnType<typeof buildOrg>>;
let B: Awaited<ReturnType<typeof buildOrg>>;
let bProposalId: string;
let bTokenId: string;
let bClientRowId: string;
let bDraftId: string;
let bHookId: string;
let bDeliveryId: string;

beforeAll(async () => {
  db = await freshDb();
  A = await buildOrg(db, 'Acme');
  B = await buildOrg(db, 'Globex');
  const plan = await run(db, humanActor(B.manager), 'runTeamPlan', {});
  const p = plan.people.find((x) => x.memberId === B.emp.id)!;
  await run(db, humanActor(B.manager), 'sendPlanProposals', { teamId: B.team.id, proposals: [{ memberId: B.emp.id, blocks: p.requests, deadline: p.deadline }] });
  bProposalId = (await run(db, humanActor(B.emp), 'listMyProposals', {})).proposals[0]!.id;
  const pat = await run(db, humanActor(B.emp), 'managePersonalTokens', { op: 'create', name: 'b', scopes: ['leave:read', 'leave:request'] });
  bTokenId = pat.created!.id;
  const cl = await run(db, humanActor(B.owner), 'manageAgentAccess', { op: 'createOAuthClient', name: 'b', scopes: ['leave:read'] });
  bClientRowId = cl.clients[0]!.id;
  const auth = await authenticateBearer(db, `Bearer ${pat.created!.token}`, NOW);
  const d = await callAsAgent(db, auth, 'submitLeaveRequest', { start: '2026-12-07', end: '2026-12-07', idempotencyKey: 'b-draft-1' }, NOW, 'mcp');
  bDraftId = d.status === 'confirmation_required' ? d.draftId : '';
  const hook = await run(db, humanActor(B.owner), 'manageWebhooks', { op: 'create', url: 'https://hooks.example.com/b', events: ['leave.requested'] });
  bHookId = hook.created!.endpointId;
  await run(db, humanActor(B.emp2), 'submitLeaveRequest', { start: '2026-12-14', end: '2026-12-14', idempotencyKey: 'b-hook-1' });
  bDeliveryId = (await run(db, humanActor(B.owner), 'manageWebhooks', { op: 'list' })).deliveries[0]!.id;
});

const attacks = (): [CapabilityName, unknown][] => [
  ['cancelLeaveRequest', { requestId: B.requestId }],
  ['decideLeaveRequest', { requestId: B.requestId, decision: 'approve' }],
  ['manageOrgSetup', { op: 'renameTeam', teamId: B.team.id, name: 'pwned' }],
  ['manageOrgSetup', { op: 'addCoverageRule', teamId: B.team.id, minPresent: 1 }],
  ['manageOrgSetup', { op: 'removeCoverageRule', ruleId: B.rule.id }],
  ['manageOrgSetup', { op: 'addBlackout', teamId: B.team.id, start: '2026-12-01', end: '2026-12-02', reason: 'x' }],
  ['manageOrgSetup', { op: 'removeBlackout', blackoutId: B.blackout.id }],
  ['manageOrgSetup', { op: 'addClosure', locationId: B.location.id, date: '2026-12-01', name: 'x' }],
  ['manageOrgSetup', { op: 'savePolicy', leaveType: 'vacation', effectiveFrom: '2026-01-01', appliesTo: { teamIds: [B.team.id] }, policy: { unit: 'days', accrual: { method: 'unlimited' }, planYear: { type: 'calendar' }, carryover: { type: 'none' } } }],
  ['manageMembers', { op: 'setRole', memberId: B.emp.id, role: 'admin' }],
  ['manageMembers', { op: 'update', memberId: B.emp.id, name: 'pwned' }],
  ['manageMembers', { op: 'update', memberId: A.emp.id, teamId: B.team.id }],
  ['manageMembers', { op: 'update', memberId: A.emp.id, managerId: B.manager.id }],
  ['manageMembers', { op: 'remove', memberId: B.emp.id }],
  ['manageMembers', { op: 'revokeInvite', inviteId: B.invite.id }],
  ['manageMembers', { op: 'createInvite', teamId: B.team.id }],
  ['adjustBalance', { memberId: B.emp.id, leaveType: 'vacation', amount: 5, effectiveDate: '2026-11-01', reason: 'pwned' }],
  ['exportData', { memberId: B.emp.id }],
  ['runTeamPlan', { teamId: B.team.id }],
  ['sendPlanProposals', { teamId: B.team.id, proposals: [{ memberId: B.emp.id, blocks: [{ start: '2026-12-07', end: '2026-12-08' }], deadline: '2026-12-31' }] }],
  ['sendPlanProposals', { teamId: A.team.id, proposals: [{ memberId: B.emp.id, blocks: [{ start: '2026-12-07', end: '2026-12-08' }], deadline: '2026-12-31' }] }],
  ['respondToProposal', { proposalId: bProposalId, response: 'accept' }],
  ['managePersonalTokens', { op: 'revoke', tokenId: bTokenId }],
  ['manageAgentAccess', { op: 'revokeToken', tokenId: bTokenId }],
  ['manageAgentAccess', { op: 'revokeOAuthClient', clientRowId: bClientRowId }],
  ['decideAgentDraft', { draftId: bDraftId, decision: 'confirm' }],
  ['manageWebhooks', { op: 'setActive', endpointId: bHookId, active: false }],
  ['manageWebhooks', { op: 'delete', endpointId: bHookId }],
  ['manageWebhooks', { op: 'sendTest', endpointId: bHookId, event: 'leave.requested' }],
  ['manageWebhooks', { op: 'retry', deliveryId: bDeliveryId }],
];

describe('tenant isolation (A6)', () => {
  it('every id-taking write or read of another org fails, and that org is unchanged', async () => {
    const before = await snapshotOrg(db, B.org.id);
    const owner = humanActor(A.owner);
    for (const [name, input] of attacks()) {
      const p = run(db, owner, name, input);
      await expect(p, `${name} ${JSON.stringify(input)}`).rejects.toMatchObject({ code: expect.stringMatching(/^(not_found|forbidden)$/) });
    }
    expect(await snapshotOrg(db, B.org.id)).toEqual(before);
  });

  it('list-style reads never include another org’s data', async () => {
    const owner = humanActor(A.owner);
    const out = await run(db, owner, 'whoIsOut', { from: '2026-11-01', to: '2026-11-30', includePending: true, teamId: B.team.id });
    expect(out.teams).toEqual([]);
    const all = await run(db, owner, 'whoIsOut', { from: '2026-11-01', to: '2026-11-30', includePending: true });
    const ids = all.teams.flatMap((t) => t.out.map((o) => o.memberId));
    expect(ids).not.toContain(B.emp.id);
    const pend = await run(db, owner, 'listPendingApprovals', {});
    expect(pend.requests.map((r) => r.id)).not.toContain(B.requestId);
    const members = await run(db, owner, 'listMembers', {});
    expect(members.members.map((m) => m.id)).not.toContain(B.emp.id);
    const exp = await run(db, owner, 'exportData', { format: 'json' });
    expect(exp.files['export.json']).not.toContain(B.emp.id);
    expect(exp.files['export.json']).not.toContain('Globex');
    const setup = await run(db, owner, 'getOrgSetup', {});
    expect(setup.teams.map((t) => t.id)).not.toContain(B.team.id);
    const audit = await run(db, owner, 'getAuditLog', { limit: 500 });
    expect(JSON.stringify(audit)).not.toContain('Globex');
  });

  it('a forged actor pairing org A with a member of org B is refused', async () => {
    const forged = { ...humanActor(B.emp), orgId: A.org.id };
    await expect(run(db, forged, 'getMyBalance', {})).rejects.toMatchObject({ code: 'not_found' });
    await expect(run(db, forged, 'submitLeaveRequest', { start: '2026-11-20', end: '2026-11-20', idempotencyKey: 'forged-1234' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('covers every id-taking capability in the registry', () => {
    // If a new capability takes an id, add an attack for it above.
    const idTaking = Object.values(CAPABILITIES)
      .filter((c) => /(Id|memberId|requestId)\b/.test(JSON.stringify(c.input.toJSONSchema?.() ?? {})))
      .map((c) => c.name)
      .sort();
    const attacked = [...new Set(attacks().map(([n]) => n))];
    for (const n of idTaking) expect(attacked.concat(['whoIsOut', 'importCsv']), `missing isolation attack for ${n}`).toContain(n);
  });
});
