import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  apiTokens,
  drafts,
  leaveRequests,
  loginCodes,
  memberCoverPrefs,
  memberCredentials,
  memberPayRates,
  members,
  organizations,
  passkeys,
  pushSubscriptions,
  shiftExceptions,
  shiftTemplates,
  webhookDeliveries,
} from '@/db/schema';
import { getMember } from '@/domain/leave';
import { CapabilityError } from '../errors';
import { defineCapability } from '../types';

/*
 * Data-subject erasure and workspace deletion (docs/teams/PRIVACY.md). Export is exportData.
 */

export const eraseMember = defineCapability({
  name: 'eraseMember',
  description:
    'Admin only. Erases a person’s personal data: name, email, Slack link, tags, request notes, their agent ' +
    'tokens, drafts addressed to them, webhook deliveries that named them, and for coverage their passkeys, sign-in ' +
    'codes, phone number and cover preferences, push devices, credentials, pay rates and rota. Leave dates, balance ' +
    'entries, hours worked and past cover events stay, attached to "Former member", so the organisation keeps its ' +
    'records. Cannot be undone.',
  input: z.object({ memberId: z.uuid() }),
  output: z.object({ erased: z.literal(true), memberId: z.uuid() }),
  scope: 'admin',
  roles: ['owner', 'admin'],
  effect: 'commit',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  rateLimit: 'write',
  surfaces: ['ui'],
  audit: () => 'Erased a member’s personal data',
  async handler({ db, actor, now }, input) {
    if (actor.type !== 'human') throw new CapabilityError('forbidden', 'Only a signed-in admin can erase personal data.');
    const orgId = actor.orgId;
    const [target] = await db.select().from(members).where(and(eq(members.orgId, orgId), eq(members.id, input.memberId)));
    if (!target) throw new CapabilityError('not_found', 'Member not found.');
    if (target.role === 'owner') throw new CapabilityError('conflict', 'Transfer ownership before erasing an owner.');
    if (target.id === actor.memberId) throw new CapabilityError('conflict', 'Ask another admin to erase your own data.');
    await db.transaction(async (tx) => {
      await tx
        .update(members)
        .set({ name: 'Former member', email: null, slackUserId: null, tags: [], deletedAt: target.deletedAt ?? now })
        .where(and(eq(members.orgId, orgId), eq(members.id, target.id)));
      await tx.update(members).set({ managerId: null }).where(and(eq(members.orgId, orgId), eq(members.managerId, target.id)));
      await tx.update(leaveRequests).set({ note: null, decisionNote: null }).where(and(eq(leaveRequests.orgId, orgId), eq(leaveRequests.memberId, target.id)));
      await tx.delete(apiTokens).where(and(eq(apiTokens.orgId, orgId), eq(apiTokens.memberId, target.id)));
      await tx.delete(drafts).where(and(eq(drafts.orgId, orgId), eq(drafts.addressedToMemberId, target.id)));
      await tx.delete(webhookDeliveries).where(and(eq(webhookDeliveries.orgId, orgId), sql`${webhookDeliveries.payload}::text like ${`%${target.id}%`}`));
      // Regulated coverage: sign-in keys and codes, phone number and cover preferences, push
      // devices, credentials, pay rates and their rota. Hours worked and past cover events stay
      // (sick-leave records and the fairness ledger), attached to "Former member".
      for (const t of [passkeys, loginCodes, pushSubscriptions, memberCoverPrefs, memberCredentials, memberPayRates, shiftTemplates, shiftExceptions] as const) {
        await tx.delete(t).where(and(eq(t.orgId, orgId), eq(t.memberId, target.id)));
      }
    });
    return { erased: true as const, memberId: target.id };
  },
});

export const deleteWorkspace = defineCapability({
  name: 'deleteWorkspace',
  description:
    'Owner only. Permanently deletes the whole workspace and everything in it (people, leave, policies, audit ' +
    'log, tokens, webhooks). The owner types the workspace name to confirm. Cannot be undone; export first.',
  input: z.object({ confirmName: z.string().min(1).max(200) }),
  output: z.object({ deleted: z.literal(true) }),
  scope: 'admin',
  roles: ['owner'],
  effect: 'commit',
  idempotent: false,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  rateLimit: 'write',
  surfaces: ['ui'],
  // Nothing to audit into: the audit log is deleted with the workspace.
  audit: null,
  async handler({ db, actor }, input) {
    if (actor.type !== 'human') throw new CapabilityError('forbidden', 'Only the signed-in owner can delete the workspace.');
    await getMember(db, actor.orgId, actor.memberId!);
    const [org] = await db.select().from(organizations).where(eq(organizations.id, actor.orgId));
    if (!org) throw new CapabilityError('not_found', 'Workspace not found.');
    if (input.confirmName.trim() !== org.name) throw new CapabilityError('invalid_input', `Type the workspace name exactly ("${org.name}") to confirm.`);
    // Every org table references organizations with ON DELETE CASCADE.
    await db.delete(organizations).where(eq(organizations.id, org.id));
    return { deleted: true as const };
  },
});
