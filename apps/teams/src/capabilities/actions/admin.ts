import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  auditLog,
  autonomySettings,
  balanceLedger,
  blackouts,
  coverageRules,
  coverOffers,
  credentials,
  extraClosures,
  hoursWorked,
  invites,
  leavePolicies,
  leaveRequests,
  leaveTypes,
  locations,
  memberCoverPrefs,
  memberCredentials,
  memberLocationHistory,
  memberPayRates,
  members,
  organizations,
  shiftTemplates,
  teams,
} from '@/db/schema';
import { autonomyFor } from '@/domain/autonomy';
import { getLeaveTypeByKey, getMember, isoDate } from '@/domain/leave';
import { policySchema } from '@/domain/policySchema';
import { newToken } from '@/lib/tokens';
import { CapabilityError } from '../errors';
import { untrusted } from '../helpers';
import { defineCapability } from '../types';

const ADMIN_ROLES = ['owner', 'admin'] as const;
const workWeek = z.string().regex(/^[01]{7}$/).describe('7 chars, Monday first: "1111100" = Mon–Fri.');

// ── Org setup ────────────────────────────────────────────────────────────────

const setupOp = z.discriminatedUnion('op', [
  z.object({ op: z.literal('updateSettings'), name: z.string().min(1).max(120).optional(), visibility: z.enum(['org', 'team', 'custom']).optional(), showLeaveType: z.boolean().optional(), sickNotesEnabled: z.boolean().optional(), weekStart: z.union([z.literal(0), z.literal(1)]).optional() }),
  z.object({ op: z.literal('addLocation'), name: z.string().min(1).max(120), countryCode: z.string().regex(/^[A-Z]{2}$/), subdivisionCode: z.string().max(10).nullable().optional(), timezone: z.string().max(64).optional() }),
  z.object({ op: z.literal('addTeam'), name: z.string().min(1).max(120) }),
  z.object({ op: z.literal('renameTeam'), teamId: z.uuid(), name: z.string().min(1).max(120) }),
  z.object({
    op: z.literal('upsertLeaveType'),
    key: z.string().regex(/^[a-z][a-z0-9-]{0,40}$/),
    name: z.string().min(1).max(80),
    paid: z.boolean().default(true),
    countsAgainstBalance: z.boolean().default(true),
    requiresApproval: z.boolean().default(true),
    isHealthRelated: z.boolean().default(false),
    autoApprove: z.boolean().default(false),
    maxAutoApproveDays: z.number().min(0).max(365).nullable().optional(),
  }),
  z.object({
    op: z.literal('savePolicy'),
    leaveType: z.string().min(1).max(64),
    name: z.string().min(1).max(120).default('Policy'),
    effectiveFrom: z.iso.date(),
    appliesTo: z.union([z.object({ all: z.literal(true) }), z.object({ teamIds: z.array(z.uuid()).min(1) }), z.object({ locationIds: z.array(z.uuid()).min(1) })]).default({ all: true }),
    policy: policySchema,
    citations: z.record(z.string(), z.string()).nullable().optional(),
  }),
  z.object({ op: z.literal('addCoverageRule'), teamId: z.uuid(), minPresent: z.number().int().min(1).max(500), tag: z.string().max(40).nullable().optional(), weekdays: workWeek.default('1111100') }),
  z.object({ op: z.literal('removeCoverageRule'), ruleId: z.uuid() }),
  z.object({ op: z.literal('addBlackout'), teamId: z.uuid().nullable().optional(), start: z.iso.date(), end: z.iso.date(), reason: z.string().min(1).max(200), hard: z.boolean().default(false) }),
  z.object({ op: z.literal('removeBlackout'), blackoutId: z.uuid() }),
  z.object({ op: z.literal('addClosure'), locationId: z.uuid().nullable().optional(), date: z.iso.date(), name: z.string().min(1).max(120) }),
  z.object({
    op: z.literal('setAutonomy'),
    capability: z.string().min(1).max(64).describe('Registry capability name, e.g. "decideLeaveRequest" for the approval assistant.'),
    actorClass: z.enum(['agent', 'assistant']),
    level: z.coerce.number().int().min(0).max(3).describe('0 off, 1 suggest, 2 draft (a person confirms), 3 act within policy (undo window).'),
    reversibleMinutes: z.number().int().min(5).max(14 * 24 * 60).optional().describe('Undo window for level 3 auto-approvals.'),
  }),
]);

export const manageOrgSetup = defineCapability({
  name: 'manageOrgSetup',
  description:
    'Admin-only org configuration, one operation per call: settings, locations, teams, leave types, policies ' +
    '(validated by the engine), coverage rules, blackouts and closures. Every change is audited.',
  input: setupOp,
  output: z.object({ ok: z.literal(true), id: z.string().nullable() }),
  scope: 'admin',
  roles: ADMIN_ROLES,
  effect: 'commit',
  idempotent: false,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  rateLimit: 'write',
  surfaces: ['ui', 'rest'],
  audit: (i) => `Org setup: ${i.op}${'name' in i && i.name ? ` "${i.name}"` : ''}`,
  async handler({ db, actor }, input) {
    const orgId = actor.orgId;
    const ensureTeam = async (teamId: string) => {
      const [t] = await db.select({ id: teams.id }).from(teams).where(and(eq(teams.orgId, orgId), eq(teams.id, teamId)));
      if (!t) throw new CapabilityError('not_found', 'Team not found.');
    };
    switch (input.op) {
      case 'updateSettings': {
        const { op: _op, ...rest } = input;
        if (Object.keys(rest).length) await db.update(organizations).set(rest).where(eq(organizations.id, orgId));
        return { ok: true as const, id: orgId };
      }
      case 'addLocation': {
        const [l] = await db.insert(locations).values({ orgId, name: input.name, countryCode: input.countryCode, subdivisionCode: input.subdivisionCode ?? null, timezone: input.timezone ?? 'UTC' }).returning();
        return { ok: true as const, id: l!.id };
      }
      case 'addTeam': {
        const [t] = await db.insert(teams).values({ orgId, name: input.name }).returning();
        return { ok: true as const, id: t!.id };
      }
      case 'renameTeam': {
        await ensureTeam(input.teamId);
        await db.update(teams).set({ name: input.name }).where(and(eq(teams.orgId, orgId), eq(teams.id, input.teamId)));
        return { ok: true as const, id: input.teamId };
      }
      case 'upsertLeaveType': {
        const { op: _op, maxAutoApproveDays, ...vals } = input;
        const values = { ...vals, maxAutoApproveDays: maxAutoApproveDays == null ? null : String(maxAutoApproveDays) };
        const [existing] = await db.select().from(leaveTypes).where(and(eq(leaveTypes.orgId, orgId), eq(leaveTypes.key, input.key)));
        if (existing) {
          await db.update(leaveTypes).set(values).where(eq(leaveTypes.id, existing.id));
          return { ok: true as const, id: existing.id };
        }
        const [t] = await db.insert(leaveTypes).values({ orgId, ...values }).returning();
        return { ok: true as const, id: t!.id };
      }
      case 'savePolicy': {
        const type = await getLeaveTypeByKey(db, orgId, input.leaveType);
        const a = input.appliesTo as { teamIds?: string[]; locationIds?: string[] };
        for (const id of a.teamIds ?? []) await ensureTeam(id);
        for (const id of a.locationIds ?? []) {
          const [l] = await db.select({ id: locations.id }).from(locations).where(and(eq(locations.orgId, orgId), eq(locations.id, id)));
          if (!l) throw new CapabilityError('not_found', 'Location not found.');
        }
        const [p] = await db
          .insert(leavePolicies)
          .values({ orgId, leaveTypeId: type.id, name: input.name, effectiveFrom: input.effectiveFrom, appliesTo: input.appliesTo, policy: input.policy, citations: input.citations ?? null })
          .returning();
        return { ok: true as const, id: p!.id };
      }
      case 'addCoverageRule': {
        await ensureTeam(input.teamId);
        const [r] = await db.insert(coverageRules).values({ orgId, teamId: input.teamId, minPresent: input.minPresent, tag: input.tag ?? null, weekdays: input.weekdays }).returning();
        return { ok: true as const, id: r!.id };
      }
      case 'removeCoverageRule': {
        const res = await db.delete(coverageRules).where(and(eq(coverageRules.orgId, orgId), eq(coverageRules.id, input.ruleId))).returning();
        if (!res.length) throw new CapabilityError('not_found', 'Coverage rule not found.');
        return { ok: true as const, id: input.ruleId };
      }
      case 'addBlackout': {
        if (input.end < input.start) throw new CapabilityError('invalid_input', 'end must be on or after start.');
        if (input.teamId) await ensureTeam(input.teamId);
        const [b] = await db.insert(blackouts).values({ orgId, teamId: input.teamId ?? null, startDate: input.start, endDate: input.end, reason: input.reason, hard: input.hard }).returning();
        return { ok: true as const, id: b!.id };
      }
      case 'removeBlackout': {
        const res = await db.delete(blackouts).where(and(eq(blackouts.orgId, orgId), eq(blackouts.id, input.blackoutId))).returning();
        if (!res.length) throw new CapabilityError('not_found', 'Blackout not found.');
        return { ok: true as const, id: input.blackoutId };
      }
      case 'addClosure': {
        if (input.locationId) {
          const [l] = await db.select({ id: locations.id }).from(locations).where(and(eq(locations.orgId, orgId), eq(locations.id, input.locationId)));
          if (!l) throw new CapabilityError('not_found', 'Location not found.');
        }
        const [c] = await db.insert(extraClosures).values({ orgId, locationId: input.locationId ?? null, date: input.date, name: input.name }).returning();
        return { ok: true as const, id: c!.id };
      }
      case 'setAutonomy': {
        const [row] = await db
          .insert(autonomySettings)
          .values({ orgId, capability: input.capability, actorClass: input.actorClass, level: input.level, updatedByMemberId: actor.memberId })
          .onConflictDoUpdate({
            target: [autonomySettings.orgId, autonomySettings.capability, autonomySettings.actorClass],
            set: { level: input.level, updatedByMemberId: actor.memberId, updatedAt: new Date() },
          })
          .returning();
        if (input.reversibleMinutes != null) {
          await db.update(organizations).set({ autoApprovalReversibleMinutes: input.reversibleMinutes }).where(eq(organizations.id, orgId));
        }
        return { ok: true as const, id: row!.id };
      }
    }
  },
});

export const getOrgSetup = defineCapability({
  name: 'getOrgSetup',
  description: 'Reads the org configuration (settings, locations, teams, leave types, policies, coverage rules, blackouts) for the admin screens.',
  input: z.object({}),
  output: z.object({
    org: z.object({ id: z.uuid(), name: z.string(), visibility: z.string(), showLeaveType: z.boolean(), sickNotesEnabled: z.boolean(), agentAccessEnabled: z.boolean() }),
    locations: z.array(z.object({ id: z.uuid(), name: z.string(), countryCode: z.string(), subdivisionCode: z.string().nullable() })),
    teams: z.array(z.object({ id: z.uuid(), name: z.string() })),
    leaveTypes: z.array(z.object({ id: z.uuid(), key: z.string(), name: z.string(), paid: z.boolean(), countsAgainstBalance: z.boolean(), requiresApproval: z.boolean(), isHealthRelated: z.boolean(), autoApprove: z.boolean(), maxAutoApproveDays: z.number().nullable() })),
    policies: z.array(z.object({ id: z.uuid(), leaveType: z.string(), name: z.string(), effectiveFrom: z.string(), appliesTo: z.unknown(), policy: z.unknown(), citations: z.unknown() })),
    coverageRules: z.array(z.object({ id: z.uuid(), teamId: z.uuid(), minPresent: z.number(), tag: z.string().nullable(), weekdays: z.string() })),
    blackouts: z.array(z.object({ id: z.uuid(), teamId: z.uuid().nullable(), start: z.string(), end: z.string(), reason: z.string(), hard: z.boolean() })),
    autoApproval: z.object({ level: z.number().int(), reversibleMinutes: z.number().int() }).describe('The approval assistant (decideLeaveRequest, assistant class).'),
  }),
  scope: 'policy:read',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest'],
  audit: null,
  async handler({ db, actor }) {
    const orgId = actor.orgId;
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    const lt = await db.select().from(leaveTypes).where(eq(leaveTypes.orgId, orgId)).orderBy(asc(leaveTypes.createdAt));
    const key = new Map(lt.map((t) => [t.id, t.key]));
    return {
      org: { id: org!.id, name: org!.name, visibility: org!.visibility, showLeaveType: org!.showLeaveType, sickNotesEnabled: org!.sickNotesEnabled, agentAccessEnabled: org!.agentAccessEnabled },
      locations: (await db.select().from(locations).where(eq(locations.orgId, orgId)).orderBy(asc(locations.createdAt))).map((l) => ({ id: l.id, name: l.name, countryCode: l.countryCode, subdivisionCode: l.subdivisionCode })),
      teams: (await db.select().from(teams).where(eq(teams.orgId, orgId)).orderBy(asc(teams.name))).map((t) => ({ id: t.id, name: t.name })),
      leaveTypes: lt.map((t) => ({ id: t.id, key: t.key, name: t.name, paid: t.paid, countsAgainstBalance: t.countsAgainstBalance, requiresApproval: t.requiresApproval, isHealthRelated: t.isHealthRelated, autoApprove: t.autoApprove, maxAutoApproveDays: t.maxAutoApproveDays == null ? null : Number(t.maxAutoApproveDays) })),
      policies: (await db.select().from(leavePolicies).where(eq(leavePolicies.orgId, orgId)).orderBy(asc(leavePolicies.effectiveFrom))).map((p) => ({ id: p.id, leaveType: key.get(p.leaveTypeId) ?? '?', name: p.name, effectiveFrom: p.effectiveFrom, appliesTo: p.appliesTo, policy: p.policy, citations: p.citations })),
      coverageRules: (await db.select().from(coverageRules).where(eq(coverageRules.orgId, orgId))).map((r) => ({ id: r.id, teamId: r.teamId, minPresent: r.minPresent, tag: r.tag, weekdays: r.weekdays })),
      blackouts: (await db.select().from(blackouts).where(eq(blackouts.orgId, orgId)).orderBy(asc(blackouts.startDate))).map((b) => ({ id: b.id, teamId: b.teamId, start: b.startDate, end: b.endDate, reason: b.reason, hard: b.hard })),
      autoApproval: { level: await autonomyFor(db, orgId, 'decideLeaveRequest', 'assistant'), reversibleMinutes: org!.autoApprovalReversibleMinutes },
    };
  },
});

// ── Members ─────────────────────────────────────────────────────────────────

const memberOp = z.discriminatedUnion('op', [
  z.object({ op: z.literal('createInvite'), role: z.enum(['admin', 'manager', 'employee']).default('employee'), teamId: z.uuid().nullable().optional(), maxUses: z.number().int().min(1).max(500).default(25), expiresInDays: z.number().int().min(1).max(60).default(14) }),
  z.object({ op: z.literal('revokeInvite'), inviteId: z.uuid() }),
  z.object({ op: z.literal('setRole'), memberId: z.uuid(), role: z.enum(['owner', 'admin', 'manager', 'employee']) }),
  z.object({
    op: z.literal('update'),
    memberId: z.uuid(),
    name: z.string().min(1).max(120).optional(),
    teamId: z.uuid().nullable().optional(),
    locationId: z.uuid().nullable().optional(),
    locationEffectiveFrom: z.iso.date().optional(),
    managerId: z.uuid().nullable().optional(),
    workWeek: workWeek.optional(),
    hoursPerDay: z.number().min(0.5).max(24).optional(),
    startDate: z.iso.date().nullable().optional(),
    tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  }),
  z.object({ op: z.literal('remove'), memberId: z.uuid() }),
]);

export const manageMembers = defineCapability({
  name: 'manageMembers',
  description: 'Admin-only: create or revoke invite links, change roles, update member details, remove a member (soft delete; history is kept). Audited.',
  input: memberOp,
  output: z.object({ ok: z.literal(true), id: z.string(), inviteToken: z.string().optional().describe('Shown once; build the join link from it.') }),
  scope: 'admin',
  roles: ADMIN_ROLES,
  effect: 'commit',
  idempotent: false,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  rateLimit: 'write',
  surfaces: ['ui', 'rest'],
  audit: (i) => `Members: ${i.op}${'role' in i ? ` (${i.role})` : ''}`,
  async handler({ db, actor, now }, input) {
    const orgId = actor.orgId;
    const ensureRef = async (table: typeof teams | typeof locations, id: string | null | undefined, what: string) => {
      if (!id) return;
      const [r] = await db.select({ id: table.id }).from(table).where(and(eq(table.orgId, orgId), eq(table.id, id)));
      if (!r) throw new CapabilityError('not_found', `${what} not found.`);
    };
    switch (input.op) {
      case 'createInvite': {
        await ensureRef(teams, input.teamId, 'Team');
        const { token, hash } = newToken('inv');
        const [inv] = await db
          .insert(invites)
          .values({ orgId, role: input.role, teamId: input.teamId ?? null, tokenHash: hash, maxUses: input.maxUses, expiresAt: new Date(now.getTime() + input.expiresInDays * 86_400_000), createdByMemberId: actor.memberId })
          .returning();
        return { ok: true as const, id: inv!.id, inviteToken: token };
      }
      case 'revokeInvite': {
        const res = await db.update(invites).set({ revokedAt: now }).where(and(eq(invites.orgId, orgId), eq(invites.id, input.inviteId))).returning();
        if (!res.length) throw new CapabilityError('not_found', 'Invite not found.');
        return { ok: true as const, id: input.inviteId };
      }
      case 'setRole': {
        const target = await getMember(db, orgId, input.memberId);
        if ((input.role === 'owner' || target.role === 'owner') && actor.role !== 'owner') {
          throw new CapabilityError('forbidden', 'Only an owner can grant or remove the owner role.');
        }
        if (target.role === 'owner' && input.role !== 'owner') {
          const owners = await db.select({ id: members.id }).from(members).where(and(eq(members.orgId, orgId), eq(members.role, 'owner'), isNull(members.deletedAt)));
          if (owners.length <= 1) throw new CapabilityError('conflict', 'An organization needs at least one owner.');
        }
        await db.update(members).set({ role: input.role }).where(and(eq(members.orgId, orgId), eq(members.id, input.memberId)));
        return { ok: true as const, id: input.memberId };
      }
      case 'update': {
        const target = await getMember(db, orgId, input.memberId);
        await ensureRef(teams, input.teamId, 'Team');
        await ensureRef(locations, input.locationId, 'Location');
        if (input.managerId) await getMember(db, orgId, input.managerId);
        const { op: _op, memberId, hoursPerDay, locationEffectiveFrom, ...rest } = input;
        await db
          .update(members)
          .set({ ...rest, ...(hoursPerDay != null ? { hoursPerDay: String(hoursPerDay) } : {}) })
          .where(and(eq(members.orgId, orgId), eq(members.id, memberId)));
        if (input.locationId && input.locationId !== target.locationId) {
          await db.insert(memberLocationHistory).values({ orgId, memberId, locationId: input.locationId, effectiveFrom: locationEffectiveFrom ?? isoDate(now) });
        }
        return { ok: true as const, id: memberId };
      }
      case 'remove': {
        const target = await getMember(db, orgId, input.memberId);
        if (target.role === 'owner') throw new CapabilityError('conflict', 'Transfer ownership before removing an owner.');
        await db.update(members).set({ deletedAt: now }).where(and(eq(members.orgId, orgId), eq(members.id, input.memberId)));
        return { ok: true as const, id: input.memberId };
      }
    }
  },
});

export const listMembers = defineCapability({
  name: 'listMembers',
  description: 'Admin view of members with role, team, location, manager and work pattern, plus open invites.',
  input: z.object({}),
  output: z.object({
    members: z.array(z.object({ id: z.uuid(), name: z.string(), email: z.string().nullable(), role: z.string(), teamId: z.string().nullable(), locationId: z.string().nullable(), managerId: z.string().nullable(), workWeek: z.string(), hoursPerDay: z.number(), startDate: z.string().nullable(), tags: z.array(z.string()), slackLinked: z.boolean() })),
    invites: z.array(z.object({ id: z.uuid(), role: z.string(), teamId: z.string().nullable(), uses: z.number(), maxUses: z.number(), expiresAt: z.string(), revoked: z.boolean() })),
  }),
  scope: 'admin',
  roles: ADMIN_ROLES,
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest'],
  audit: null,
  async handler({ db, actor }) {
    const ms = await db.select().from(members).where(and(eq(members.orgId, actor.orgId), isNull(members.deletedAt))).orderBy(asc(members.name));
    const inv = await db.select().from(invites).where(eq(invites.orgId, actor.orgId)).orderBy(desc(invites.createdAt));
    return {
      members: ms.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role, teamId: m.teamId, locationId: m.locationId, managerId: m.managerId, workWeek: m.workWeek, hoursPerDay: Number(m.hoursPerDay), startDate: m.startDate, tags: m.tags, slackLinked: !!m.slackUserId })),
      invites: inv.map((i) => ({ id: i.id, role: i.role, teamId: i.teamId, uses: i.uses, maxUses: i.maxUses, expiresAt: i.expiresAt.toISOString(), revoked: !!i.revokedAt })),
    };
  },
});

// ── Ledger adjustments, export, audit ───────────────────────────────────────

export const adjustBalance = defineCapability({
  name: 'adjustBalance',
  description: 'Admin-only ledger adjustment for one member and leave type, with a required reason. Appends a row; never edits history. Audited.',
  input: z.object({
    memberId: z.uuid(),
    leaveType: z.string().min(1).max(64),
    amount: z.number().min(-1000).max(1000).refine((n) => n !== 0, 'amount cannot be 0').describe('Positive adds, negative removes.'),
    effectiveDate: z.iso.date(),
    reason: z.string().min(3).max(300).describe('Required; shown in the member’s ledger.'),
  }),
  output: z.object({ ok: z.literal(true), ledgerEntryId: z.uuid() }),
  scope: 'admin',
  roles: ADMIN_ROLES,
  effect: 'commit',
  idempotent: false,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  rateLimit: 'write',
  surfaces: ['ui', 'rest'],
  audit: (i) => `Adjusted ${i.leaveType} by ${i.amount} on ${i.effectiveDate}`,
  async handler({ db, actor }, input) {
    const m = await getMember(db, actor.orgId, input.memberId);
    const t = await getLeaveTypeByKey(db, actor.orgId, input.leaveType);
    const [row] = await db
      .insert(balanceLedger)
      .values({ orgId: actor.orgId, memberId: m.id, leaveTypeId: t.id, kind: 'adjustment', amount: String(input.amount), effectiveDate: input.effectiveDate, reason: input.reason, createdByActorType: actor.type, createdByMemberId: actor.memberId })
      .returning();
    return { ok: true as const, ledgerEntryId: row!.id };
  },
});

export const exportData = defineCapability({
  name: 'exportData',
  description:
    'Admin-only export of the org’s data (members, leave types, policies, requests, ledger, audit log) as JSON ' +
    'or CSV tables. Health-related request notes are excluded unless the org enabled sick notes. Optionally one member only.',
  input: z.object({ format: z.enum(['json', 'csv']).default('json'), memberId: z.uuid().optional() }),
  output: z.object({ format: z.enum(['json', 'csv']), files: z.record(z.string(), z.string()) }),
  scope: 'admin',
  roles: ADMIN_ROLES,
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest'],
  audit: (i) => `Exported data (${i.format}${i.memberId ? ', one member' : ''})`,
  async handler({ db, actor }, input) {
    const orgId = actor.orgId;
    if (input.memberId) await getMember(db, orgId, input.memberId);
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    const types = await db.select().from(leaveTypes).where(eq(leaveTypes.orgId, orgId));
    const health = new Set(types.filter((t) => t.isHealthRelated).map((t) => t.id));
    const byMember = <T extends { memberId: string }>(rows: T[]) => (input.memberId ? rows.filter((r) => r.memberId === input.memberId) : rows);
    const tables: Record<string, Record<string, unknown>[]> = {
      members: (await db.select().from(members).where(eq(members.orgId, orgId)))
        .filter((m) => !input.memberId || m.id === input.memberId)
        .map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role, team_id: m.teamId, location_id: m.locationId, manager_id: m.managerId, work_week: m.workWeek, hours_per_day: m.hoursPerDay, start_date: m.startDate, deleted_at: m.deletedAt?.toISOString() ?? null })),
      leave_types: types.map((t) => ({ id: t.id, key: t.key, name: t.name, paid: t.paid, counts_against_balance: t.countsAgainstBalance, requires_approval: t.requiresApproval, is_health_related: t.isHealthRelated })),
      policies: (await db.select().from(leavePolicies).where(eq(leavePolicies.orgId, orgId))).map((p) => ({ id: p.id, leave_type_id: p.leaveTypeId, name: p.name, effective_from: p.effectiveFrom, applies_to: JSON.stringify(p.appliesTo), policy: JSON.stringify(p.policy) })),
      requests: byMember(await db.select().from(leaveRequests).where(eq(leaveRequests.orgId, orgId))).map((r) => ({
        id: r.id, member_id: r.memberId, leave_type_id: r.leaveTypeId, status: r.status, start_date: r.startDate, end_date: r.endDate, part: r.part, hours: r.hours,
        note: health.has(r.leaveTypeId) && !org!.sickNotesEnabled ? null : r.note,
        deducted: (r.engineSnapshot as { amount?: number } | null)?.amount ?? null, auto_approved: r.autoApproved, decided_at: r.decidedAt?.toISOString() ?? null, created_at: r.createdAt.toISOString(),
      })),
      ledger: byMember(await db.select().from(balanceLedger).where(eq(balanceLedger.orgId, orgId))).map((l) => ({ id: l.id, member_id: l.memberId, leave_type_id: l.leaveTypeId, kind: l.kind, amount: l.amount, unit: l.unit, effective_date: l.effectiveDate, request_id: l.requestId, reason: l.reason, created_at: l.createdAt.toISOString() })),
      // Regulated coverage: what we hold per person. Children appear only as counts per room,
      // which are not anyone's personal data, so they are not here.
      credentials: byMember(
        await db
          .select({ memberId: memberCredentials.memberId, key: credentials.key, name: credentials.name, issuedOn: memberCredentials.issuedOn, expiresOn: memberCredentials.expiresOn })
          .from(memberCredentials)
          .innerJoin(credentials, eq(credentials.id, memberCredentials.credentialId))
          .where(eq(memberCredentials.orgId, orgId)),
      ).map((c) => ({ member_id: c.memberId, credential: c.key, name: c.name, issued_on: c.issuedOn, expires_on: c.expiresOn })),
      shifts: byMember(await db.select().from(shiftTemplates).where(eq(shiftTemplates.orgId, orgId))).map((t) => ({ member_id: t.memberId, room_id: t.roomId, weekday: t.weekday, start_minute: t.startMinute, end_minute: t.endMinute, effective_from: t.effectiveFrom, effective_to: t.effectiveTo })),
      hours_worked: byMember(await db.select().from(hoursWorked).where(eq(hoursWorked.orgId, orgId))).map((h) => ({ member_id: h.memberId, period_start: h.periodStart, period_end: h.periodEnd, hours: h.hours })),
      cover_preferences: byMember(await db.select().from(memberCoverPrefs).where(eq(memberCoverPrefs.orgId, orgId))).map(({ orgId: _o, ...p }) => plain(p)),
      cover_offers: byMember(await db.select().from(coverOffers).where(eq(coverOffers.orgId, orgId))).map((o) => ({ member_id: o.memberId, cover_request_id: o.coverRequestId, wave: o.wave, rank: o.rank, channel: o.channel, sent_at: o.sentAt.toISOString(), response: o.response, responded_at: o.respondedAt?.toISOString() ?? null })),
      // Pay rates exist only while cost-aware ranking is on; exports are admin-only.
      pay_rates: byMember(await db.select().from(memberPayRates).where(eq(memberPayRates.orgId, orgId))).map((r) => ({ member_id: r.memberId, hourly_rate: r.hourlyRate, effective_from: r.effectiveFrom })),
      audit_log: input.memberId
        ? []
        : (await db.select().from(auditLog).where(eq(auditLog.orgId, orgId)).orderBy(asc(auditLog.at))).map((a) => ({ at: a.at.toISOString(), actor_type: a.actorType, actor_member_id: a.actorMemberId, client_id: a.clientId, on_behalf_of: a.onBehalfOfMemberId, capability: a.capability, outcome: a.outcome, summary: a.summary })),
    };
    if (input.format === 'json') return { format: 'json' as const, files: { 'export.json': JSON.stringify(tables, null, 2) } };
    const files: Record<string, string> = {};
    for (const [name, rows] of Object.entries(tables)) files[`${name}.csv`] = toCsv(rows);
    return { format: 'csv' as const, files };
  },
});

/** A row as export values: dates as ISO strings, arrays and objects as JSON. */
function plain(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), v instanceof Date ? v.toISOString() : v !== null && typeof v === 'object' ? JSON.stringify(v) : v]),
  );
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]!);
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    // Quote, and neutralise spreadsheet formula injection (=, +, -, @ at the start).
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}

export const getAuditLog = defineCapability({
  name: 'getAuditLog',
  description: 'Admin-only: recent audit entries with actor type, client id and on-behalf-of member.',
  input: z.object({ limit: z.number().int().min(1).max(500).default(100) }),
  output: z.object({
    entries: z.array(z.object({ at: z.string(), actorType: z.string(), actorMemberId: z.string().nullable(), clientId: z.string().nullable(), onBehalfOfMemberId: z.string().nullable(), capability: z.string(), outcome: z.string(), summary: z.object({ untrusted_text: z.string() }) })),
  }),
  scope: 'admin',
  roles: ADMIN_ROLES,
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest'],
  audit: null,
  async handler({ db, actor }, input) {
    const rows = await db.select().from(auditLog).where(eq(auditLog.orgId, actor.orgId)).orderBy(desc(auditLog.at)).limit(input.limit);
    return { entries: rows.map((a) => ({ at: a.at.toISOString(), actorType: a.actorType, actorMemberId: a.actorMemberId, clientId: a.clientId, onBehalfOfMemberId: a.onBehalfOfMemberId, capability: a.capability, outcome: a.outcome, summary: untrusted(a.summary)! })) };
  },
});
