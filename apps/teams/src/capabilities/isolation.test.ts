import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '@/db/client';
import { CAPABILITIES, type CapabilityName } from './registry';
import { authenticateBearer } from '@/lib/agentAuth';
import { callAsAgent } from '@/server/agentGateway';
import { buildOrg, humanActor, NOW, run, snapshotOrg } from '@/test/fixtures';
import { freshDb } from '@/test/db';
import { eq } from 'drizzle-orm';
import { coverOffers, timePunches } from '@/db/schema';

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
let bRoomId: string;
let bMemberCredId: string;
let bHoursBatch: string;
let bCoverId: string;
let bOfferId: string;
let bPunchId: string;

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
  const bo = humanActor(B.owner);
  await run(db, bo, 'manageSchedule', { op: 'selectRulePack', locationId: B.location.id, packKey: 'childcare-us-ca', sickPolicy: 'none' });
  bRoomId = (await run(db, bo, 'manageSchedule', { op: 'upsertRoom', locationId: B.location.id, name: 'Infants', kind: 'room', groupKey: 'infant' })).id!;
  await run(db, bo, 'manageSchedule', { op: 'setShifts', memberId: B.emp.id, rows: [{ roomId: bRoomId, weekday: 0, start: '08:00', end: '16:00' }] });
  await run(db, bo, 'manageCredentials', { op: 'define', key: 'cpr', name: 'CPR' });
  bMemberCredId = (await run(db, bo, 'manageCredentials', { op: 'grant', memberId: B.emp.id, credentialKey: 'cpr', expiresOn: '2027-06-01' })).id;
  bCoverId = (await run(db, bo, 'requestCover', { op: 'create', locationId: B.location.id, roomId: bRoomId, date: '2026-11-09', start: '08:00', end: '12:00', idempotencyKey: 'b-cover-0001' })).requestId;
  [{ id: bOfferId }] = await db.select({ id: coverOffers.id }).from(coverOffers).where(eq(coverOffers.coverRequestId, bCoverId)).limit(1) as [{ id: string }];
  await run(db, bo, 'manageWorkRules', { op: 'setTimeClock', enabled: true });
  await run(db, humanActor(B.emp), 'clockPunch', { op: 'in', idempotencyKey: 'b-punch-0001' });
  [{ id: bPunchId }] = (await db.select({ id: timePunches.id }).from(timePunches).where(eq(timePunches.orgId, B.org.id)).limit(1)) as [{ id: string }];
  bHoursBatch = (await run(db, bo, 'importHoursWorked', { stage: 'commit', rows: [{ member: B.emp.id, periodStart: '2026-10-01', periodEnd: '2026-10-07', hours: 40 }] })).batchId!;
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
  ['eraseMember', { memberId: B.emp.id }],
  ['getCoverage', { locationId: B.location.id, date: '2026-11-02' }],
  ['manageSchedule', { op: 'upsertRoom', locationId: B.location.id, name: 'pwned', kind: 'room', groupKey: 'infant' }],
  ['manageSchedule', { op: 'upsertRoom', roomId: bRoomId, locationId: A.location.id, name: 'pwned', kind: 'room', groupKey: 'infant' }],
  ['manageSchedule', { op: 'archiveRoom', roomId: bRoomId }],
  ['manageSchedule', { op: 'setTimezone', locationId: B.location.id, timezone: 'UTC' }],
  ['manageSchedule', { op: 'selectRulePack', locationId: B.location.id, packKey: 'childcare-us-tx', sickPolicy: 'none' }],
  ['manageSchedule', { op: 'setDemand', roomId: bRoomId, rows: [{ weekday: 0, start: '08:00', end: '12:00', group: 'infant', count: 9 }] }],
  ['manageSchedule', { op: 'addDemandException', roomId: bRoomId, date: '2026-11-02', closed: true }],
  ['manageSchedule', { op: 'setShifts', memberId: B.emp.id, rows: [] }],
  ['manageSchedule', { op: 'setShifts', memberId: A.emp.id, rows: [{ roomId: bRoomId, weekday: 0, start: '08:00', end: '16:00' }] }],
  ['manageSchedule', { op: 'addShiftException', memberId: B.emp.id, date: '2026-11-02', kind: 'off' }],
  ['manageCredentials', { op: 'grant', memberId: B.emp.id, credentialKey: 'cpr', expiresOn: '2027-06-01' }],
  ['manageCredentials', { op: 'remove', memberCredentialId: bMemberCredId }],
  ['getCredentials', { memberId: B.emp.id }],
  ['getSickLeave', { memberId: B.emp.id }],
  ['importHoursWorked', { stage: 'undo', batchId: bHoursBatch }],
  ['importCsv', { stage: 'undo', kind: 'hours', batchId: bHoursBatch }],
  ['listRulePacks', { locationId: B.location.id }],
  ['findCover', { locationId: B.location.id, roomId: bRoomId, date: '2026-11-09', start: '08:00', end: '12:00' }],
  ['findCover', { locationId: A.location.id, roomId: bRoomId, date: '2026-11-09', start: '08:00', end: '12:00' }],
  ['explainCoverInWords', { locationId: B.location.id, roomId: bRoomId, date: '2026-11-09', start: '08:00', end: '12:00' }],
  ['explainCoverInWords', { locationId: A.location.id, roomId: bRoomId, date: '2026-11-09', start: '08:00', end: '12:00' }],
  ['getCoverageForecast', { locationId: B.location.id }],
  ['requestCover', { op: 'create', locationId: B.location.id, roomId: bRoomId, date: '2026-11-09', start: '08:00', end: '12:00', idempotencyKey: 'a-attack-001' }],
  ['requestCover', { op: 'create', locationId: A.location.id, roomId: bRoomId, date: '2026-11-09', start: '08:00', end: '12:00', idempotencyKey: 'a-attack-002' }],
  ['requestCover', { op: 'create', locationId: A.location.id, roomId: bRoomId, date: '2026-11-09', start: '08:00', end: '12:00', absentMemberId: B.emp.id, idempotencyKey: 'a-attack-003' }],
  ['requestCover', { op: 'cancel', requestId: bCoverId }],
  ['respondToCover', { offerId: bOfferId, response: 'decline' }],
  ['getCoverRequests', { locationId: B.location.id }],
  ['manageStaffSignIn', { op: 'issueCode', memberId: B.emp.id }],
  ['manageStaffSignIn', { op: 'listPasskeys', memberId: B.emp.id }],
  ['manageStaffSignIn', { op: 'revokePasskey', passkeyId: '00000000-0000-4000-8000-000000000000' }],
  ['setMyCoverPrefs', { allowedLocationIds: [B.location.id] }],
  ['getTimesheets', { memberId: B.emp.id }],
  ['manageTimesheets', { op: 'approve', week: '2026-11-02', memberIds: [B.emp.id] }],
  ['manageTimesheets', { op: 'correct', memberId: B.emp.id, voidPunchId: bPunchId, note: 'pwned' }],
  ['manageTimesheets', { op: 'correct', memberId: A.emp.id, voidPunchId: bPunchId, note: 'pwned' }],
  ['manageWorkRules', { op: 'setSiteLaborPack', locationId: B.location.id, packKey: 'labor-us-ca' }],
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

  it('the same attacks through agent tokens (personal and service) fail too, and create no drafts', async () => {
    const before = await snapshotOrg(db, B.org.id);
    const pat = await run(db, humanActor(A.owner), 'managePersonalTokens', { op: 'create', name: 'a', scopes: ['leave:read', 'leave:request', 'leave:approve', 'policy:read', 'planner:run', 'coverage:read'] });
    const key = await run(db, humanActor(A.owner), 'manageAgentAccess', { op: 'createApiKey', name: 'a', scopes: ['leave:read', 'leave:request', 'planner:run', 'coverage:read'] });
    const agents = [
      { auth: await authenticateBearer(db, `Bearer ${pat.created!.token}`, NOW), extra: {} },
      { auth: await authenticateBearer(db, `Bearer ${key.created!.token}`, NOW), extra: { forMemberId: A.emp.id } },
    ];
    let tried = 0;
    for (const { auth, extra } of agents) {
      for (const [name, input] of attacks()) {
        if (!(CAPABILITIES[name].surfaces as readonly string[]).includes('mcp')) continue;
        if (!auth.actor.scopes.includes(CAPABILITIES[name].scope as never)) continue;
        tried++;
        const p = callAsAgent(db, auth, name, { ...(input as object), ...extra }, NOW, 'mcp');
        await expect(p, `${auth.actor.type} ${name} ${JSON.stringify(input)}`).rejects.toMatchObject({ code: expect.stringMatching(/^(not_found|forbidden)$/) });
      }
    }
    expect(tried).toBeGreaterThan(8);
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
