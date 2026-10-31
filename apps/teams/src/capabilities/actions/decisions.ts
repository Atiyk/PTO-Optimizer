import { createHash } from 'node:crypto';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { z } from 'zod';
import { decideRoute, POLICY_MODES, TOLERABLE_WARNINGS, type ApprovalPolicy } from '@daysoff/engine/leave/decision';
import { allocateWindow, type WindowRequest } from '@daysoff/engine/leave/requestWindow';
import { daysBetween, inScope } from '@daysoff/engine/leave/rules';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { approvalPolicies, groups as groupsTable, hoursWorked, hrTasks, leaveRequests, leaveTypes, locations, members, policyRules, teams, windowAllocations } from '@/db/schema';
import { groupIdsByMember, ruleFromRow, type RuleParams } from '@/domain/automations';
import { factsOf } from '@/domain/decisionFlow';
import { evaluateRequest, isoDate } from '@/domain/leave';
import { CapabilityError } from '../errors';
import { actingMemberId, managesMember, untrusted } from '../helpers';
import { defineCapability, type CapabilityContext } from '../types';
import { inputOf } from './approvals';

/*
 * The decision flow's admin and HR side: shadow replay before switching a team to auto, HR tasks
 * for protected leave and possible FMLA notices, and request windows for contested periods.
 * UI and REST only (the MCP budget is full). Every number comes from the engine (D1).
 */

const ADMIN_ROLES = ['owner', 'admin'] as const;

// ── Shadow replay ────────────────────────────────────────────────────────────

const policyDraft = z.object({
  mode: z.enum(POLICY_MODES).default('auto'),
  leaveTypeKeys: z.array(z.string().max(64)).max(20).default([]),
  locationIds: z.array(z.uuid()).max(50).default([]),
  teamIds: z.array(z.uuid()).max(50).default([]),
  groupIds: z.array(z.uuid()).max(50).default([]),
  maxDays: z.number().min(0.5).max(365).nullable().default(null),
  minNoticeDays: z.number().int().min(0).max(365).nullable().default(null),
  toleratedWarnings: z.array(z.enum(TOLERABLE_WARNINGS)).default([]),
});

export const getShadowReplay = defineCapability({
  name: 'getShadowReplay',
  description:
    'Replays the last 90 days of requests a person decided through an approval policy (saved or drafted) with ' +
    'today’s rules, and says how many it would have approved by itself and which of those a person declined. ' +
    'Read-only: run it before switching a team to auto.',
  input: z.object({ policyId: z.uuid().optional(), draft: policyDraft.optional(), days: z.number().int().min(7).max(365).default(90) }),
  output: z.object({
    decided: z.number().int(),
    wouldAutoApprove: z.number().int(),
    approvedOfThose: z.number().int(),
    declinedOfThose: z.array(z.object({ requestId: z.uuid(), member: z.object({ untrusted_text: z.string() }), start: z.string(), end: z.string(), leaveType: z.string(), reason: z.string().nullable() })),
    blockedReasons: z.array(z.object({ reason: z.string(), count: z.number().int() })).describe('Why the rest would still go to a person, most common first.'),
    truncated: z.boolean(),
  }),
  scope: 'admin',
  roles: ADMIN_ROLES,
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'planner',
  surfaces: ['ui', 'rest'],
  audit: null,
  async handler({ db, actor, now }, input) {
    let draft: z.infer<typeof policyDraft>;
    let name = 'Draft policy';
    if (input.policyId) {
      const [p] = await db.select().from(approvalPolicies).where(and(eq(approvalPolicies.orgId, actor.orgId), eq(approvalPolicies.id, input.policyId)));
      if (!p) throw new CapabilityError('not_found', 'Approval policy not found.');
      name = p.name;
      draft = {
        mode: 'auto',
        leaveTypeKeys: p.leaveTypeKeys,
        locationIds: p.locationIds,
        teamIds: p.teamIds,
        groupIds: p.groupIds,
        maxDays: p.maxDays == null ? null : Number(p.maxDays),
        minNoticeDays: p.minNoticeDays,
        toleratedWarnings: p.toleratedWarnings as z.infer<typeof policyDraft>['toleratedWarnings'],
      };
    } else if (input.draft) {
      draft = input.draft;
      await ensureOwnScope(db, actor.orgId, draft);
    }
    else throw new CapabilityError('invalid_input', 'Give a saved policy or a draft to replay.');
    const policy: ApprovalPolicy = { id: input.policyId ?? null, name, mode: 'auto', maxDays: draft.maxDays, minNoticeDays: draft.minNoticeDays, toleratedWarnings: draft.toleratedWarnings, requiresTypeOptIn: false, typeOptedIn: true };

    const since = new Date(now.getTime() - input.days * 86_400_000);
    const rows = await db
      .select({ r: leaveRequests, m: members, key: leaveTypes.key })
      .from(leaveRequests)
      .innerJoin(members, eq(members.id, leaveRequests.memberId))
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .where(
        and(
          eq(leaveRequests.orgId, actor.orgId),
          inArray(leaveRequests.status, ['approved', 'declined']),
          eq(leaveRequests.autoApproved, false),
          isNotNull(leaveRequests.decidedByMemberId),
          gte(leaveRequests.createdAt, since),
          isNull(members.deletedAt),
        ),
      )
      .orderBy(desc(leaveRequests.createdAt))
      .limit(201);
    const groups = await groupIdsByMember(db, actor.orgId);
    const inPolicy = rows.filter(({ m, key }) => inScope(draft, { locationId: m.locationId, teamId: m.teamId, groupIds: groups.get(m.id) ?? [] }, key));
    const truncated = inPolicy.length > 200;
    let would = 0;
    let approvedOf = 0;
    const declinedOf: { requestId: string; member: { untrusted_text: string }; start: string; end: string; leaveType: string; reason: string | null }[] = [];
    const reasons = new Map<string, number>();
    for (const { r, m, key } of inPolicy.slice(0, 200)) {
      const asked = isoDate(r.createdAt);
      const ev = await evaluateRequest(db, actor.orgId, m, inputOf(r, key), asked, { excludeRequestId: r.id });
      const d = decideRoute(factsOf(ev, null), policy, daysBetween(asked, r.startDate));
      if (!d.wouldAutoApprove) {
        for (const b of d.blockers.length ? d.blockers : ['Needs no approval or is protected leave']) {
          const k = b.replace(/\d{4}-\d{2}-\d{2}/g, '…').replace(/\d+(\.\d+)?/g, 'N');
          reasons.set(k, (reasons.get(k) ?? 0) + 1);
        }
        continue;
      }
      would++;
      if (r.status === 'approved') approvedOf++;
      else declinedOf.push({ requestId: r.id, member: { untrusted_text: m.name }, start: r.startDate, end: r.endDate, leaveType: key, reason: r.declineReason });
    }
    return {
      decided: Math.min(inPolicy.length, 200),
      wouldAutoApprove: would,
      approvedOfThose: approvedOf,
      declinedOfThose: declinedOf,
      blockedReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 6),
      truncated,
    };
  },
});

async function ensureOwnScope(db: CapabilityContext['db'], orgId: string, sc: { teamIds: string[]; locationIds: string[]; groupIds: string[] }) {
  const check = async (ids: string[], table: typeof teams | typeof locations | typeof groupsTable) => {
    if (!ids.length) return;
    const found = await db.select({ id: table.id }).from(table).where(and(eq(table.orgId, orgId), inArray(table.id, ids)));
    if (found.length !== new Set(ids).size) throw new CapabilityError('not_found', 'Team, location or group not found.');
  };
  await check(sc.teamIds, teams);
  await check(sc.locationIds, locations);
  await check(sc.groupIds, groupsTable);
}

// ── HR tasks ─────────────────────────────────────────────────────────────────

const HR_KIND_TEXT = {
  fmla_notice: 'May be FMLA-qualifying: the eligibility notice is due within 5 business days (29 CFR 825.300(b)(1)).',
  protected_ack: 'Protected leave recorded: acknowledge it and send any paperwork.',
  approved_now_conflicts: 'Approved leave now overlaps a new hard blackout. It stays approved: talk to the person if needed.',
} as const;

export const listHrTasks = defineCapability({
  name: 'listHrTasks',
  description:
    'HR tasks for owners and admins: protected leave to acknowledge, possible-FMLA notices with their due date, ' +
    'and approved leave that a later rule now overlaps. Facts for HR, never a determination; no reason or diagnosis is stored.',
  input: z.object({ includeDone: z.boolean().default(false) }),
  output: z.object({
    tasks: z.array(
      z.object({
        id: z.uuid(),
        kind: z.enum(['fmla_notice', 'protected_ack', 'approved_now_conflicts']),
        what: z.string(),
        member: z.object({ id: z.uuid(), name: z.object({ untrusted_text: z.string() }) }).nullable(),
        request: z.object({ id: z.uuid(), start: z.string(), end: z.string(), leaveType: z.string() }).nullable(),
        dueAt: z.string().nullable(),
        businessDaysLeft: z.number().int().nullable(),
        overdue: z.boolean(),
        done: z.boolean(),
        facts: z
          .object({ startDate: z.string().nullable(), monthsEmployed: z.number().nullable(), hoursLast12Months: z.number().nullable() })
          .nullable()
          .describe('For possible FMLA: tenure and recorded hours. Facts for HR, not an eligibility determination.'),
        citation: z.object({ regulation: z.string(), section: z.string(), url: z.string() }).nullable(),
      }),
    ),
  }),
  scope: 'admin',
  roles: ADMIN_ROLES,
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest'],
  audit: null,
  async handler({ db, actor, now }, input) {
    const today = isoDate(now);
    const rows = await db
      .select({ t: hrTasks, m: members, r: leaveRequests, type: leaveTypes })
      .from(hrTasks)
      .leftJoin(members, eq(members.id, hrTasks.memberId))
      .leftJoin(leaveRequests, eq(leaveRequests.id, hrTasks.requestId))
      .leftJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .where(and(eq(hrTasks.orgId, actor.orgId), input.includeDone ? undefined : isNull(hrTasks.doneAt)))
      .orderBy(asc(hrTasks.dueAt));
    const tasks = [];
    for (const { t, m, r, type } of rows) {
      let facts = null;
      if (t.kind === 'fmla_notice' && m) {
        const from = addDays(today, -365);
        const hw = await db
          .select({ h: hoursWorked.hours })
          .from(hoursWorked)
          .where(and(eq(hoursWorked.orgId, actor.orgId), eq(hoursWorked.memberId, m.id), gte(hoursWorked.periodStart, from), isNull(hoursWorked.voidedAt)));
        const months = m.startDate ? Math.floor(daysBetween(m.startDate, today) / 30.44) : null;
        facts = { startDate: m.startDate, monthsEmployed: months, hoursLast12Months: hw.length ? Math.round(hw.reduce((s, x) => s + Number(x.h), 0) * 10) / 10 : null };
      }
      const left = t.dueAt ? businessDaysBetween(today, t.dueAt) : null;
      tasks.push({
        id: t.id,
        kind: t.kind,
        what: HR_KIND_TEXT[t.kind],
        member: m ? { id: m.id, name: { untrusted_text: m.name } } : null,
        // Health-related types show as "Leave" here too: HR sees that it may be FMLA, never why.
        request: r ? { id: r.id, start: r.startDate, end: r.endDate, leaveType: type?.isHealthRelated ? 'leave' : (type?.key ?? 'leave') } : null,
        dueAt: t.dueAt,
        businessDaysLeft: left,
        overdue: !t.doneAt && !!t.dueAt && t.dueAt < today,
        done: !!t.doneAt,
        facts,
        citation: t.kind === 'fmla_notice' ? { regulation: '29 CFR Part 825 (FMLA)', section: '825.300(b)(1)', url: 'https://www.law.cornell.edu/cfr/text/29/825.300' } : null,
      });
    }
    return { tasks };
  },
});

function businessDaysBetween(from: string, to: string): number {
  if (to <= from) return to === from ? 0 : -1;
  let n = 0;
  for (let d = addDays(from, 1); d <= to && n < 400; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

export const completeHrTask = defineCapability({
  name: 'completeHrTask',
  description: 'Marks an HR task done (notice sent, leave acknowledged, conflict handled). Owners and admins only; audited.',
  input: z.object({ taskId: z.uuid() }),
  output: z.object({ ok: z.literal(true) }),
  scope: 'admin',
  roles: ADMIN_ROLES,
  effect: 'commit',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  rateLimit: 'write',
  surfaces: ['ui', 'rest'],
  audit: () => 'Completed an HR task',
  async handler({ db, actor, now }, input) {
    const res = await db
      .update(hrTasks)
      .set({ doneAt: now, doneByMemberId: actingMemberId(actor) })
      .where(and(eq(hrTasks.orgId, actor.orgId), eq(hrTasks.id, input.taskId), isNull(hrTasks.doneAt)))
      .returning();
    if (!res.length) {
      const [t] = await db.select().from(hrTasks).where(and(eq(hrTasks.orgId, actor.orgId), eq(hrTasks.id, input.taskId)));
      if (!t) throw new CapabilityError('not_found', 'Task not found.');
    }
    return { ok: true as const };
  },
});

// ── Request windows ──────────────────────────────────────────────────────────

const allocationOut = z.object({
  requestId: z.uuid(),
  member: z.object({ id: z.uuid(), name: z.object({ untrusted_text: z.string() }) }),
  start: z.string(),
  end: z.string(),
  in: z.boolean(),
  reason: z.string(),
});

export const getRequestWindows = defineCapability({
  name: 'getRequestWindows',
  description:
    'Request windows (contested periods such as the holidays): how many asked, and once collection closes the ' +
    'engine’s fair allocation (rotation, seniority or a seeded lottery) for a person to confirm. Counts only for employees; managers see the batch.',
  input: z.object({}),
  output: z.object({
    windows: z.array(
      z.object({
        ruleId: z.uuid(),
        name: z.string(),
        start: z.string(),
        end: z.string(),
        collectUntil: z.string(),
        slots: z.number().int(),
        tieBreak: z.enum(['rotation', 'seniority', 'lottery']),
        status: z.enum(['collecting', 'ready', 'confirmed']),
        requests: z.number().int(),
        allocation: z.array(allocationOut).describe('Only for approvers, once collection has closed.'),
        seed: z.number().int().nullable(),
      }),
    ),
  }),
  scope: 'leave:read',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest'],
  audit: null,
  async handler(ctx) {
    return { windows: await windowsFor(ctx) };
  },
});

export const confirmRequestWindow = defineCapability({
  name: 'confirmRequestWindow',
  description:
    'Confirms the engine’s allocation for a closed request window: approves the requests that are in and declines ' +
    'the rest with the reason "busy period" (each person gets other dates and can ask for a review). A person confirms; nothing is automatic.',
  input: z.object({ ruleId: z.uuid() }),
  output: z.object({ approved: z.number().int(), declined: z.number().int(), skipped: z.number().int() }),
  scope: 'leave:approve',
  roles: ['owner', 'admin', 'manager'],
  effect: 'commit',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  rateLimit: 'write',
  surfaces: ['ui', 'rest'],
  audit: (_i, o) => `Confirmed a request window: ${o.approved} approved, ${o.declined} declined`,
  async handler(ctx, input) {
    const { db, actor, now } = ctx;
    const w = (await windowsFor(ctx)).find((x) => x.ruleId === input.ruleId);
    if (!w) throw new CapabilityError('not_found', 'Request window not found.');
    if (w.status === 'collecting') throw new CapabilityError('conflict', `Requests are collected until ${w.collectUntil}.`);
    if (w.status === 'confirmed') return { approved: 0, declined: 0, skipped: 0 };
    const { invokeCapability } = await import('../registry');
    let approved = 0;
    let declined = 0;
    let skipped = 0;
    for (const a of w.allocation) {
      try {
        if (a.in) await invokeCapability('decideLeaveRequest', ctx, { requestId: a.requestId, decision: 'approve', note: `${w.name}: place given (${a.reason}).` });
        else await invokeCapability('decideLeaveRequest', ctx, { requestId: a.requestId, decision: 'decline', reason: 'peak_period', note: `${w.name}: the places were shared by ${w.tieBreak}; ${a.reason}.` });
        if (a.in) approved++;
        else declined++;
      } catch {
        skipped++; // someone the confirmer doesn't manage, or already decided
      }
    }
    await db
      .insert(windowAllocations)
      .values({ orgId: actor.orgId, ruleId: w.ruleId, seed: w.seed, results: w.allocation, confirmedByMemberId: actingMemberId(actor), confirmedAt: now })
      .onConflictDoNothing();
    return { approved, declined, skipped };
  },
});

async function windowsFor(ctx: CapabilityContext) {
  const { db, actor, now } = ctx;
  const today = isoDate(now);
  const rules = await db.select().from(policyRules).where(and(eq(policyRules.orgId, actor.orgId), eq(policyRules.kind, 'request_window')));
  const groups = await groupIdsByMember(db, actor.orgId);
  const approver = actor.role === 'owner' || actor.role === 'admin' || actor.role === 'manager';
  const out = [];
  for (const row of rules) {
    const rule = ruleFromRow(row);
    if (rule.kind !== 'request_window') continue;
    const p = row.params as RuleParams;
    const [done] = await db.select().from(windowAllocations).where(and(eq(windowAllocations.orgId, actor.orgId), eq(windowAllocations.ruleId, row.id)));
    const reqs = await db
      .select({ r: leaveRequests, m: members, key: leaveTypes.key })
      .from(leaveRequests)
      .innerJoin(members, eq(members.id, leaveRequests.memberId))
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .where(
        and(
          eq(leaveRequests.orgId, actor.orgId),
          eq(leaveRequests.status, 'pending'),
          lte(leaveRequests.startDate, rule.end),
          gte(leaveRequests.endDate, rule.start),
          isNull(members.deletedAt),
          eq(leaveTypes.isHealthRelated, false),
          eq(leaveTypes.protectedCategory, 'none'),
        ),
      );
    const inRule = reqs.filter(({ m, key }) => inScope(rule, { locationId: m.locationId, teamId: m.teamId, groupIds: groups.get(m.id) ?? [] }, key));
    const status: 'collecting' | 'ready' | 'confirmed' = done?.confirmedAt ? 'confirmed' : today <= rule.collectUntil ? 'collecting' : 'ready';
    let allocation: z.infer<typeof allocationOut>[] = [];
    const seed = rule.tieBreak === 'lottery' ? (done?.seed ?? seedFor(row.id)) : null;
    if (status === 'confirmed' && approver) {
      allocation = (done!.results as z.infer<typeof allocationOut>[]) ?? [];
    } else if (status === 'ready' && approver) {
      const visible = [];
      for (const x of inRule) if (await managesMember(db, actor, x.m)) visible.push(x);
      const history = await lastYearInPeriod(db, actor.orgId, visible.map((x) => x.m.id), rule.start, rule.end);
      const input: WindowRequest[] = visible.map(({ r, m }) => ({
        requestId: r.id,
        memberId: m.id,
        dates: ((r.engineSnapshot as { chargedDates?: string[] } | null)?.chargedDates ?? []).filter((d) => d >= rule.start && d <= rule.end),
        submittedAt: r.createdAt.toISOString(),
        lastYearInPeriod: history.get(m.id) ?? null,
        startDate: m.startDate,
      }));
      const a = allocateWindow(input, p.slots ?? rule.slots, rule.tieBreak, seed ?? undefined);
      const byId = new Map(visible.map((x) => [x.r.id, x]));
      allocation = a.order.map((id) => {
        const x = byId.get(id)!;
        const res = a.results.find((y) => y.requestId === id)!;
        return { requestId: id, member: { id: x.m.id, name: untrusted(x.m.name)! }, start: x.r.startDate, end: x.r.endDate, in: res.in, reason: res.reason };
      });
    }
    out.push({ ruleId: row.id, name: row.name, start: rule.start, end: rule.end, collectUntil: rule.collectUntil, slots: rule.slots, tieBreak: rule.tieBreak, status, requests: inRule.length, allocation, seed });
  }
  return out;
}

/** A stable per-rule seed, stored with the confirmed allocation for the audit. */
function seedFor(ruleId: string): number {
  return parseInt(createHash('sha256').update(ruleId).digest('hex').slice(0, 8), 16) >>> 1;
}

/** For rotation: the latest earlier year each person had approved leave in the same calendar period. */
async function lastYearInPeriod(db: Parameters<typeof evaluateRequest>[0], orgId: string, memberIds: string[], start: string, end: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!memberIds.length) return out;
  const year = Number(start.slice(0, 4));
  for (let back = 1; back <= 5; back++) {
    const s = `${year - back}${start.slice(4)}`;
    const e = `${year - back + (end.slice(0, 4) !== start.slice(0, 4) ? 1 : 0)}${end.slice(4)}`;
    const rows = await db
      .select({ m: leaveRequests.memberId })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.orgId, orgId), inArray(leaveRequests.memberId, memberIds), eq(leaveRequests.status, 'approved'), lte(leaveRequests.startDate, e), gte(leaveRequests.endDate, s)));
    for (const r of rows) if (!out.has(r.m)) out.set(r.m, year - back);
  }
  return out;
}
