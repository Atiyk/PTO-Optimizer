import 'server-only';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { auditLog, invites, leavePolicies, leaveTypes, locations, members, organizations, teams } from '@/db/schema';
import { CapabilityError } from '@/capabilities/errors';
import { DEFAULT_SICK_POLICY, DEFAULT_VACATION_POLICY } from '@/domain/policySchema';
import { hashToken } from '@/lib/tokens';
import type { Identity } from '@/lib/session';

/*
 * Bootstrap actions run before the caller belongs to an org, so they cannot go through the
 * capability registry (which needs an org-scoped actor). They are the only exception, are
 * kept here, and write the same audit rows.
 */

export interface CreateOrgInput {
  orgName: string;
  countryCode: string;
  subdivisionCode?: string | null;
  teamName?: string;
  /** Today, for the default policies' effective date. */
  today: string;
}

/**
 * Sensible defaults so a 10-person team is set up in minutes: one location, one team,
 * vacation (20 days front-loaded, carry up to 5), sick (tracked, no balance, no notes),
 * personal and unpaid.
 */
export async function createOrganization(db: Db, identity: Identity, input: CreateOrgInput) {
  return db.transaction(async (tx) => {
    const [org] = await tx.insert(organizations).values({ name: input.orgName }).returning();
    const orgId = org!.id;
    const [loc] = await tx
      .insert(locations)
      .values({ orgId, name: !input.subdivisionCode ? input.countryCode : input.subdivisionCode.startsWith(`${input.countryCode}-`) ? input.subdivisionCode : `${input.countryCode}-${input.subdivisionCode}`, countryCode: input.countryCode, subdivisionCode: input.subdivisionCode ?? null })
      .returning();
    const [team] = await tx.insert(teams).values({ orgId, name: input.teamName?.trim() || 'Team' }).returning();
    const [owner] = await tx
      .insert(members)
      .values({
        orgId,
        name: identity.name,
        email: identity.email,
        slackUserId: identity.provider === 'slack' ? identity.subject : null,
        role: 'owner',
        locationId: loc!.id,
        teamId: team!.id,
        startDate: input.today,
      })
      .returning();
    const types = await tx
      .insert(leaveTypes)
      .values([
        { orgId, key: 'vacation', name: 'Vacation', paid: true, countsAgainstBalance: true, requiresApproval: true },
        { orgId, key: 'sick', name: 'Sick', paid: true, countsAgainstBalance: false, requiresApproval: false, isHealthRelated: true },
        { orgId, key: 'personal', name: 'Personal', paid: true, countsAgainstBalance: false, requiresApproval: true },
        { orgId, key: 'unpaid', name: 'Unpaid', paid: false, countsAgainstBalance: false, requiresApproval: true },
      ])
      .returning();
    const byKey = new Map(types.map((t) => [t.key, t.id]));
    const yearStart = `${input.today.slice(0, 4)}-01-01`;
    await tx.insert(leavePolicies).values([
      { orgId, leaveTypeId: byKey.get('vacation')!, name: 'Vacation (default)', effectiveFrom: yearStart, policy: DEFAULT_VACATION_POLICY },
      { orgId, leaveTypeId: byKey.get('sick')!, name: 'Sick (default)', effectiveFrom: yearStart, policy: DEFAULT_SICK_POLICY },
    ]);
    await tx.insert(auditLog).values({
      orgId,
      actorType: 'human',
      actorMemberId: owner!.id,
      scopes: [],
      capability: 'createOrganization',
      effect: 'commit',
      outcome: 'ok',
      summary: `Created organization with default location, team and leave types`,
    });
    return { org: org!, owner: owner!, team: team!, location: loc! };
  });
}

/** Joins the org behind an invite token; returns the new (or existing) member. */
export async function acceptInvite(db: Db, token: string, identity: Identity, now: Date) {
  const [inv] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.tokenHash, hashToken(token)), isNull(invites.revokedAt), gt(invites.expiresAt, now)));
  const invalid = () => new CapabilityError('not_found', 'This invite link is invalid, used up or expired.');
  if (!inv) throw invalid();
  // Following the same link again (same Slack user) is not a new use.
  if (identity.provider === 'slack') {
    const [existing] = await db
      .select()
      .from(members)
      .where(and(eq(members.orgId, inv.orgId), eq(members.slackUserId, identity.subject), isNull(members.deletedAt)));
    if (existing) return existing;
  }
  if (inv.uses >= inv.maxUses) throw invalid();
  return db.transaction(async (tx) => {
    const [loc] = await tx.select({ id: locations.id }).from(locations).where(eq(locations.orgId, inv.orgId)).limit(1);
    const [m] = await tx
      .insert(members)
      .values({
        orgId: inv.orgId,
        name: identity.name,
        email: identity.email,
        slackUserId: identity.provider === 'slack' ? identity.subject : null,
        role: inv.role,
        teamId: inv.teamId,
        locationId: loc?.id ?? null,
        startDate: now.toISOString().slice(0, 10),
      })
      .returning();
    await tx.update(invites).set({ uses: sql`${invites.uses} + 1` }).where(eq(invites.id, inv.id));
    await tx.insert(auditLog).values({
      orgId: inv.orgId,
      actorType: 'human',
      actorMemberId: m!.id,
      scopes: [],
      capability: 'acceptInvite',
      effect: 'commit',
      outcome: 'ok',
      summary: `Joined via invite as ${inv.role}`,
    });
    return m!;
  });
}

/** Members (across orgs) linked to a Slack user, for sign-in. */
export async function membersForSlackUser(db: Db, slackUserId: string) {
  return db.select().from(members).where(and(eq(members.slackUserId, slackUserId), isNull(members.deletedAt)));
}
