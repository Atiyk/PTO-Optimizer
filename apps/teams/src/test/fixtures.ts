import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { apiTokens, blackouts, coverageRules, drafts, invites, leaveRequests, leaveTypes, members, oauthClients, teams, webhookDeliveries, webhookEndpoints, rooms, siteRulePacks, demandTemplates, shiftTemplates, shiftExceptions, memberCredentials, hoursWorked, coverRequests, coverOffers, coverEvents, groups, groupMembers, policyRules, teamEvents, profileChangeRequests, msteamsTenants, approvalPolicies, hrTasks, shadowDecisions, windowAllocations } from '@/db/schema';
import { invokeCapability, type CapabilityName } from '@/capabilities/registry';
import { ROLE_SCOPES } from '@/capabilities/scopes';
import type { Actor } from '@/capabilities/types';
import { createOrganization } from '@/server/bootstrap';

export const TODAY = '2026-11-02'; // a Monday
export const NOW = new Date(`${TODAY}T12:00:00Z`);

export function humanActor(m: { id: string; orgId: string; role: 'owner' | 'admin' | 'manager' | 'employee' }): Actor {
  return { type: 'human', orgId: m.orgId, memberId: m.id, role: m.role, clientId: null, onBehalfOfMemberId: null, scopes: ROLE_SCOPES[m.role] };
}

export function run<N extends CapabilityName>(db: Db, actor: Actor, name: N, input: unknown) {
  return invokeCapability(name, { db, actor, now: NOW }, input);
}

/** A complete small org: owner, manager, two employees in one team, a coverage rule, a request. */
export async function buildOrg(db: Db, name: string) {
  const { org, owner, team, location } = await createOrganization(
    db,
    { provider: 'dev', subject: `${name}-owner`, name: `${name} Owner`, email: null, slackTeamId: null, issuedAt: 0 },
    { orgName: name, countryCode: 'US', today: TODAY, teamName: 'Eng', now: NOW },
  );
  const mk = async (n: string, role: 'manager' | 'employee', managerId?: string) =>
    (await db.insert(members).values({ orgId: org.id, name: `${name} ${n}`, role, teamId: team.id, locationId: location.id, startDate: '2024-01-01', managerId, tags: ['engineer'] }).returning())[0]!;
  const manager = await mk('Manager', 'manager');
  const emp = await mk('Emp', 'employee', manager.id);
  const emp2 = await mk('Emp2', 'employee', manager.id);
  await db.update(members).set({ startDate: '2024-01-01', tags: ['engineer'] }).where(eq(members.id, owner.id));
  const [rule] = await db.insert(coverageRules).values({ orgId: org.id, teamId: team.id, minPresent: 1, tag: 'engineer' }).returning();
  const [bl] = await db.insert(blackouts).values({ orgId: org.id, startDate: '2026-12-30', endDate: '2026-12-31', reason: 'close', hard: false }).returning();
  const [inv] = await db.insert(invites).values({ orgId: org.id, tokenHash: `hash-${name}`, expiresAt: new Date('2027-01-01') }).returning();
  const sub = await run(db, humanActor(emp), 'submitLeaveRequest', { leaveType: 'vacation', start: '2026-11-16', end: '2026-11-17', idempotencyKey: `${name}-req-1` });
  const [vac] = await db.select().from(leaveTypes).where(and(eq(leaveTypes.orgId, org.id), eq(leaveTypes.key, 'vacation')));
  return { org, owner, manager, emp, emp2, team, location, rule: rule!, blackout: bl!, invite: inv!, requestId: sub.request.id, vacation: vac! };
}

export async function snapshotOrg(db: Db, orgId: string) {
  return {
    members: await db.select().from(members).where(eq(members.orgId, orgId)),
    requests: await db.select().from(leaveRequests).where(eq(leaveRequests.orgId, orgId)),
    teams: await db.select().from(teams).where(eq(teams.orgId, orgId)),
    rules: await db.select().from(coverageRules).where(eq(coverageRules.orgId, orgId)),
    blackouts: await db.select().from(blackouts).where(eq(blackouts.orgId, orgId)),
    invites: await db.select().from(invites).where(eq(invites.orgId, orgId)),
    drafts: await db.select().from(drafts).where(eq(drafts.orgId, orgId)),
    tokens: await db.select().from(apiTokens).where(eq(apiTokens.orgId, orgId)),
    clients: await db.select().from(oauthClients).where(eq(oauthClients.orgId, orgId)),
    webhooks: await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.orgId, orgId)),
    deliveries: await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.orgId, orgId)),
    rooms: await db.select().from(rooms).where(eq(rooms.orgId, orgId)),
    siteRulePacks: await db.select().from(siteRulePacks).where(eq(siteRulePacks.orgId, orgId)),
    demand: await db.select().from(demandTemplates).where(eq(demandTemplates.orgId, orgId)),
    shifts: await db.select().from(shiftTemplates).where(eq(shiftTemplates.orgId, orgId)),
    shiftExceptions: await db.select().from(shiftExceptions).where(eq(shiftExceptions.orgId, orgId)),
    memberCredentials: await db.select().from(memberCredentials).where(eq(memberCredentials.orgId, orgId)),
    hoursWorked: await db.select().from(hoursWorked).where(eq(hoursWorked.orgId, orgId)),
    coverRequests: await db.select().from(coverRequests).where(eq(coverRequests.orgId, orgId)),
    coverOffers: await db.select().from(coverOffers).where(eq(coverOffers.orgId, orgId)),
    coverEvents: await db.select().from(coverEvents).where(eq(coverEvents.orgId, orgId)),
    groups: await db.select().from(groups).where(eq(groups.orgId, orgId)),
    groupMembers: await db.select().from(groupMembers).where(eq(groupMembers.orgId, orgId)),
    policyRules: await db.select().from(policyRules).where(eq(policyRules.orgId, orgId)),
    teamEvents: await db.select().from(teamEvents).where(eq(teamEvents.orgId, orgId)),
    profileChanges: await db.select().from(profileChangeRequests).where(eq(profileChangeRequests.orgId, orgId)),
    msteamsTenants: await db.select().from(msteamsTenants).where(eq(msteamsTenants.orgId, orgId)),
    approvalPolicies: await db.select().from(approvalPolicies).where(eq(approvalPolicies.orgId, orgId)),
    hrTasks: await db.select().from(hrTasks).where(eq(hrTasks.orgId, orgId)),
    shadowDecisions: await db.select().from(shadowDecisions).where(eq(shadowDecisions.orgId, orgId)),
    windowAllocations: await db.select().from(windowAllocations).where(eq(windowAllocations.orgId, orgId)),
  };
}
