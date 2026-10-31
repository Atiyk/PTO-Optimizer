import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { balanceLedger, coverageRules, DECLINE_REASONS, leaveRequests, leaveTypes, members, shadowDecisions } from '@/db/schema';
import { blockImpact } from '@/domain/coverage';
import { buildDecisionPacket, type DecisionPacket, type DecisionSnapshot } from '@/domain/decisionFlow';
import { advanceEscalations } from '@/domain/escalation';
import { blockGapOutput, decisionOutput, decisionToOutput, toBlockGapOutput } from './requests';
import { balanceView, getLeaveTypeById, getMember, isoDate, teamCoverageMembers } from '@/domain/leave';
import { coverageViolations } from '@daysoff/engine/leave/coverage';
import { addDays, mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';

import { CapabilityError } from '../errors';
import { actingMemberId, managesMember, untrusted } from '../helpers';
import { defineCapability } from '../types';
import { reverseUsage } from './requests';
import { emitWebhook, kickWebhooks, requestEventData } from '@/server/webhooks';
import { defer } from '@/server/defer';
import { notifyDecision, syncSlackStatuses } from '@/slack/notify';

const impact = z.object({
  balanceAfter: z.number().nullable().describe('Engine balance after this request, including other pending requests.'),
  unit: z.enum(['days', 'hours']),
  yearEndForfeit: z.number().nullable(),
  coverage: z.array(z.object({ date: z.string(), required: z.number(), present: z.number(), tag: z.string().nullable() })),
  overlapping: z.array(z.object({ member: z.object({ untrusted_text: z.string() }), start: z.string(), end: z.string(), status: z.string() })),
});

export const listPendingApprovals = defineCapability({
  name: 'listPendingApprovals',
  description:
    'Lists requests waiting for the caller’s decision (their reports and team; admins see all) with the impact ' +
    'of each: balance after, year-end forfeiture, coverage on those days and teammates out at the same time. ' +
    'Reads only. Leave type names for health-related leave are shown, but never a reason.',
  input: z.object({}),
  output: z.object({
    requests: z.array(
      z.object({
        id: z.uuid(),
        member: z.object({ id: z.uuid(), name: z.object({ untrusted_text: z.string() }) }),
        leaveType: z.string(),
        start: z.string(),
        end: z.string(),
        part: z.string(),
        deducts: z.number(),
        retroactive: z.boolean(),
        note: z.object({ untrusted_text: z.string() }).nullable(),
        impact,
        autoApproval: z
          .object({ eligible: z.boolean(), blockers: z.array(z.string()) })
          .nullable()
          .describe('When the org turned on approval suggestions: whether the rules would auto-approve this, and why not.'),
        decision: decisionOutput.describe('Every check with its result, the engine recommendation and the policy. The approver decides.'),
        changedSinceSubmit: z.array(z.string()).describe('Checks whose result changed since the request was submitted.'),
        waiting: z.object({
          since: z.string(),
          hours: z.number(),
          escalationLevel: z.number().int(),
          overdue: z.boolean().describe('Past the team’s decision time (SLA).'),
          urgent: z.boolean().describe('Starts within 2 working days.'),
          review: z.boolean().describe('The requester asked for a review of a decline.'),
        }),
      }),
    ),
    recentAutoApprovals: z
      .array(
        z.object({
          id: z.uuid(),
          member: z.object({ id: z.uuid(), name: z.object({ untrusted_text: z.string() }) }),
          leaveType: z.string(),
          start: z.string(),
          end: z.string(),
          basis: z.string().nullable(),
          reversibleUntil: z.string(),
        }),
      )
      .describe('Auto-approved requests the caller can still reverse (decideLeaveRequest with decision "decline").'),
  }),
  scope: 'leave:approve',
  roles: ['owner', 'admin', 'manager'],
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest', 'mcp', 'slack', 'assistant'],
  audit: null,
  async handler({ db, actor, now }) {
    const today = isoDate(now);
    const rows = await db
      .select({ req: leaveRequests, typeKey: leaveTypes.key, member: members })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .innerJoin(members, eq(members.id, leaveRequests.memberId))
      .where(and(eq(leaveRequests.orgId, actor.orgId), eq(leaveRequests.status, 'pending'), isNull(members.deletedAt)))
      .orderBy(asc(leaveRequests.startDate));
    const out = [];
    for (const r of rows) {
      if (r.member.id === actingMemberId(actor)) continue; // nobody approves their own leave
      if (!(await managesMember(db, actor, r.member))) continue;
      const prior = (r.req.decisionSnapshot ?? null) as (DecisionSnapshot & { review?: { declinedBy: string } }) | null;
      // A review goes to someone other than the person who declined it.
      if (prior?.review && prior.review.declinedBy === actingMemberId(actor)) continue;
      const type = await getLeaveTypeById(db, actor.orgId, r.req.leaveTypeId);
      const snap = r.req.engineSnapshot as { amount: number; unit: 'days' | 'hours'; chargedDates: string[] };
      let balanceAfter: number | null = null;
      let yearEndForfeit: number | null = null;
      if (type.countsAgainstBalance) {
        const v = await balanceView(db, actor.orgId, r.member, type, r.req.startDate, [], { includePending: true });
        if (!v.projection.unlimited) {
          balanceAfter = v.projection.asOf.balance;
          yearEndForfeit = v.projection.yearEnd?.wouldForfeit ?? null;
        }
      }
      // Coverage on those days with this request counted as out.
      let coverage: z.infer<typeof impact>['coverage'] = [];
      if (r.member.teamId && snap.chargedDates.length) {
        const rules = await db.select().from(coverageRules).where(and(eq(coverageRules.orgId, actor.orgId), eq(coverageRules.teamId, r.member.teamId)));
        const team = await teamCoverageMembers(db, actor.orgId, r.member.teamId, snap.chargedDates[0]!, snap.chargedDates.at(-1)!);
        coverage = coverageViolations(
          rules.map((x) => ({ id: x.id, teamId: x.teamId, minPresent: x.minPresent, tag: x.tag, weekdays: x.weekdays, effectiveFrom: x.effectiveFrom, effectiveTo: x.effectiveTo })),
          team,
          snap.chargedDates[0]!,
          snap.chargedDates.at(-1)!,
        ).map((c) => ({ date: c.date, required: c.required, present: c.present, tag: c.tag }));
      }
      const overl = r.member.teamId
        ? await db
            .select({ name: members.name, start: leaveRequests.startDate, end: leaveRequests.endDate, status: leaveRequests.status })
            .from(leaveRequests)
            .innerJoin(members, eq(members.id, leaveRequests.memberId))
            .where(
              and(
                eq(leaveRequests.orgId, actor.orgId),
                eq(members.teamId, r.member.teamId),
                inArray(leaveRequests.status, ['pending', 'approved']),
              ),
            )
        : [];
      out.push({
        id: r.req.id,
        member: { id: r.member.id, name: { untrusted_text: r.member.name } },
        leaveType: r.typeKey,
        start: r.req.startDate,
        end: r.req.endDate,
        part: r.req.part,
        deducts: snap.amount,
        retroactive: r.req.startDate < today,
        note: untrusted(r.req.note),
        impact: {
          balanceAfter,
          unit: snap.unit,
          yearEndForfeit,
          coverage,
          overlapping: overl
            .filter((o) => o.start <= r.req.endDate && o.end >= r.req.startDate && !(o.start === r.req.startDate && o.end === r.req.endDate && o.name === r.member.name))
            .map((o) => ({ member: { untrusted_text: o.name }, start: o.start, end: o.end, status: o.status })),
        },
        ...(await packetFields(db, actor.orgId, r.member, r.req, r.typeKey, today, now, prior)),
      });
    }
    const autoRows = await db
      .select({ req: leaveRequests, typeKey: leaveTypes.key, member: members })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .innerJoin(members, eq(members.id, leaveRequests.memberId))
      .where(
        and(
          eq(leaveRequests.orgId, actor.orgId),
          eq(leaveRequests.status, 'approved'),
          eq(leaveRequests.autoApproved, true),
          gt(leaveRequests.reversibleUntil, now),
        ),
      )
      .orderBy(asc(leaveRequests.startDate));
    const recentAutoApprovals = [];
    for (const r of autoRows) {
      if (r.member.id === actingMemberId(actor) || !(await managesMember(db, actor, r.member))) continue;
      recentAutoApprovals.push({
        id: r.req.id,
        member: { id: r.member.id, name: { untrusted_text: r.member.name } },
        leaveType: r.typeKey,
        start: r.req.startDate,
        end: r.req.endDate,
        basis: r.req.autoApprovalReason,
        reversibleUntil: r.req.reversibleUntil!.toISOString(),
      });
    }
    return { requests: out, recentAutoApprovals };
  },
});

async function packetFields(
  db: Parameters<typeof getMember>[0],
  orgId: string,
  member: Awaited<ReturnType<typeof getMember>>,
  req: typeof leaveRequests.$inferSelect,
  typeKey: string,
  today: string,
  now: Date,
  prior: (DecisionSnapshot & { review?: unknown }) | null,
) {
  const packet = await buildDecisionPacket(db, orgId, member, inputOf(req, typeKey), today, { excludeRequestId: req.id, now, withAlternatives: false });
  const d = packet.decision;
  const mode = packet.choice.policy.mode;
  const changedSinceSubmit: string[] = [];
  if (prior?.checklist) {
    const before = new Map(prior.checklist.map((c) => [`${c.kind}|${c.message}`, c.status]));
    const kindsBefore = new Map(prior.checklist.map((c) => [c.kind, c.status]));
    for (const c of d.checklist) {
      const was = before.get(`${c.kind}|${c.message}`) ?? kindsBefore.get(c.kind);
      if (was && was !== c.status) changedSinceSubmit.push(c.status === 'pass' ? `Now fine: ${c.message}` : c.message);
      else if (!was && c.status !== 'pass') changedSinceSubmit.push(`New: ${c.message}`);
    }
  }
  const hours = Math.max(0, Math.round((now.getTime() - req.createdAt.getTime()) / 3_600_000));
  return {
    autoApproval: mode === 'suggest' || mode === 'auto' ? { eligible: d.wouldAutoApprove, blockers: d.blockers } : null,
    decision: decisionToOutput(packet),
    changedSinceSubmit,
    waiting: {
      since: req.createdAt.toISOString(),
      hours,
      escalationLevel: req.escalationLevel,
      overdue: hours >= packet.choice.slaHours,
      urgent: workingDaysUntil(today, req.startDate) <= 2,
      review: !!prior?.review,
    },
  };
}

export function inputOf(req: typeof leaveRequests.$inferSelect, typeKey: string) {
  return {
    leaveTypeKey: typeKey,
    start: req.startDate,
    end: req.endDate,
    part: req.part,
    hours: req.hours == null ? undefined : Number(req.hours),
    startMinute: req.startMinute ?? undefined,
    endMinute: req.endMinute ?? undefined,
  };
}

/** Weekdays from today (exclusive) to the start (inclusive); 0 when it starts today or earlier. */
export function workingDaysUntil(today: string, start: string): number {
  let n = 0;
  for (let d = addDays(today, 1); d <= start && n < 30; d = addDays(d, 1)) if (mondayIndexedDow(d) < 5) n++;
  return n;
}

export const decideLeaveRequest = defineCapability({
  name: 'decideLeaveRequest',
  description:
    'Approves or declines a pending request (or reverses an auto-approval within its window) with an optional ' +
    'note. A decline needs a reason (or a note). Only the member’s manager or an admin can decide, never the ' +
    'requester. Approval deducts the engine-computed amount from the balance. A decline sends the requester ' +
    'the engine’s other dates and a way to ask for a review.',
  input: z.object({
    requestId: z.uuid(),
    decision: z.enum(['approve', 'decline']),
    reason: z.enum(DECLINE_REASONS).optional().describe('Why it is declined: coverage, notice, peak_period or other (with a note).'),
    note: z.string().max(500).optional(),
  }),
  output: z.object({
    request: z.object({ id: z.uuid(), status: z.string(), start: z.string(), end: z.string(), leaveType: z.string() }),
    alternatives: z
      .array(z.object({ start: z.string(), end: z.string(), workingDays: z.number(), daysAway: z.number(), warnings: z.number(), wouldAutoApprove: z.boolean() }))
      .optional()
      .describe('On a decline: other dates the engine found, sent to the requester.'),
    blockCoverage: z
      .array(blockGapOutput)
      .optional()
      .describe('On approval at a regulated site: the staffing-ratio or required-role gaps this absence opens. Not legal advice.'),
  }),
  scope: 'leave:approve',
  roles: ['owner', 'admin', 'manager'],
  effect: 'commit',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  rateLimit: 'write',
  surfaces: ['ui', 'rest', 'mcp', 'slack', 'assistant'],
  audit: (i, o) => `${i.decision === 'approve' ? 'Approved' : 'Declined'} ${o.request.leaveType} request ${o.request.start} to ${o.request.end}`,
  async handler({ db, actor, now }, input) {
    const [r] = await db
      .select({ req: leaveRequests, typeKey: leaveTypes.key })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .where(and(eq(leaveRequests.orgId, actor.orgId), eq(leaveRequests.id, input.requestId)));
    if (!r) throw new CapabilityError('not_found', 'Request not found.');
    const target = await getMember(db, actor.orgId, r.req.memberId);
    if (target.id === actingMemberId(actor)) throw new CapabilityError('forbidden', 'You cannot decide your own request.');
    if (!(await managesMember(db, actor, target))) throw new CapabilityError('not_found', 'Request not found.');
    const status = input.decision === 'approve' ? 'approved' : 'declined';
    const view = (s: string) => ({ request: { id: r.req.id, status: s, start: r.req.startDate, end: r.req.endDate, leaveType: r.typeKey } });

    if (r.req.status === status) return view(status); // idempotent repeat
    const reversingAuto =
      r.req.status === 'approved' && r.req.autoApproved && input.decision === 'decline' && r.req.reversibleUntil && r.req.reversibleUntil > now;
    if (r.req.status !== 'pending' && !reversingAuto) {
      throw new CapabilityError('conflict', `This request is already ${r.req.status}.`);
    }
    if (r.req.status === 'recorded') throw new CapabilityError('conflict', 'Protected leave is recorded for HR, not approved or declined.');
    const type = await getLeaveTypeById(db, actor.orgId, r.req.leaveTypeId);
    const snap = r.req.engineSnapshot as { amount: number; unit: 'days' | 'hours'; chargedDates?: string[] };
    let reason: (typeof DECLINE_REASONS)[number] | null = null;
    let alternatives: DecisionPacket['alternatives'] = [];
    if (status === 'declined' && !reversingAuto) {
      if (!input.reason && !input.note?.trim()) throw new CapabilityError('invalid_input', 'Pick a reason for the decline (coverage, notice, peak period, or other with a note).');
      reason = input.reason ?? 'other';
      if (reason === 'other' && !input.note?.trim()) throw new CapabilityError('invalid_input', 'Add a short note when the reason is "other".');
      if (!type.isHealthRelated && type.protectedCategory === 'none') {
        const p = await buildDecisionPacket(db, actor.orgId, target, inputOf(r.req, r.typeKey), isoDate(now), { excludeRequestId: r.req.id, now, withAlternatives: true, withRouting: false, withOvertime: false }).catch(() => null);
        alternatives = p?.alternatives ?? [];
      }
    }
    const priorSnap = (r.req.decisionSnapshot ?? {}) as Record<string, unknown>;
    // A manager may approve past a gap (it is their call), but the output says so, with citations.
    const gaps =
      status === 'approved'
        ? (
            await blockImpact(
              db,
              actor.orgId,
              target.id,
              snap.chargedDates ?? [],
              r.req.part,
              r.req.startMinute != null && r.req.endMinute != null ? { startMinute: r.req.startMinute, endMinute: r.req.endMinute } : null,
              { excludeRequestId: r.req.id },
            )
          ).filter((g) => g.kind !== 'group_size')
        : [];
    await db.transaction(async (tx) => {
      await tx
        .update(leaveRequests)
        .set({
          status,
          decidedByMemberId: actingMemberId(actor),
          decidedAt: now,
          decisionNote: input.note ?? null,
          declineReason: reason,
          decisionSnapshot: { ...priorSnap, ...(status === 'declined' ? { declinedBy: actingMemberId(actor), declineAlternatives: alternatives, reversed: !!reversingAuto } : {}) },
        })
        .where(and(eq(leaveRequests.orgId, actor.orgId), eq(leaveRequests.id, r.req.id)));
      await tx
        .update(shadowDecisions)
        .set({ humanDecision: status })
        .where(and(eq(shadowDecisions.orgId, actor.orgId), eq(shadowDecisions.requestId, r.req.id)));
      if (status === 'approved' && type.countsAgainstBalance && snap.amount > 0) {
        await tx.insert(balanceLedger).values({
          orgId: actor.orgId,
          memberId: target.id,
          leaveTypeId: type.id,
          kind: 'usage',
          amount: String(-snap.amount),
          unit: snap.unit,
          effectiveDate: r.req.startDate,
          requestId: r.req.id,
          createdByActorType: actor.type,
          createdByMemberId: actor.memberId,
        });
      }
      if (reversingAuto) await reverseUsage(tx as never, actor.orgId, r.req.id, actor, 'auto-approval reversed by manager');
      await emitWebhook(
        tx as never,
        actor.orgId,
        'leave.decided',
        requestEventData({
          request: { ...r.req, status, decidedAt: now },
          memberName: target.name,
          leaveType: type,
          amount: snap.amount,
          unit: snap.unit,
          decidedByMemberId: actingMemberId(actor),
        }),
        now,
      );
    });
    kickWebhooks(db, actor.orgId);
    defer(async () => {
      await notifyDecision(db, actor.orgId, r.req.id);
      if (status === 'approved') await syncSlackStatuses(db, actor.orgId, now);
      await advanceEscalations(db, actor.orgId, now);
    });
    const out = { ...view(status), ...(status === 'declined' && !reversingAuto ? { alternatives } : {}) };
    return gaps.length ? { ...out, blockCoverage: gaps.map(toBlockGapOutput) } : out;
  },
});


export const approveAllClean = defineCapability({
  name: 'approveAllClean',
  description:
    'Approves, in one action, every pending request the caller can decide whose checks all pass under its ' +
    'approval policy ("would auto-approve"). Each approval is audited separately. Requests with any warning stay.',
  input: z.object({ requestIds: z.array(z.uuid()).max(200).optional().describe('Limit to these; default: every clean one.') }),
  output: z.object({ approved: z.array(z.uuid()), skipped: z.number().int() }),
  scope: 'leave:approve',
  roles: ['owner', 'admin', 'manager'],
  effect: 'commit',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  rateLimit: 'write',
  surfaces: ['ui', 'rest', 'slack'],
  audit: (_i, o) => `Approved ${o.approved.length} clean request${o.approved.length === 1 ? '' : 's'} at once`,
  async handler(ctx, input) {
    const { invokeCapability } = await import('../registry');
    const q = await invokeCapability('listPendingApprovals', ctx, {});
    const wanted = input.requestIds ? new Set(input.requestIds) : null;
    if (wanted && [...wanted].some((id) => !q.requests.some((r) => r.id === id))) throw new CapabilityError('not_found', 'Request not found.');
    const approved: string[] = [];
    let skipped = 0;
    for (const r of q.requests) {
      if (wanted && !wanted.has(r.id)) continue;
      if (!r.decision.wouldAutoApprove || r.decision.route !== 'needs_person') {
        skipped++;
        continue;
      }
      await invokeCapability('decideLeaveRequest', ctx, { requestId: r.id, decision: 'approve', note: 'Approved with "approve all clean": every check passed.' });
      approved.push(r.id);
    }
    return { approved, skipped };
  },
});

export const requestReview = defineCapability({
  name: 'requestReview',
  description:
    'The requester asks for a review of one of their declined requests (within 14 days, once). It goes back ' +
    'to pending for the backup approver or an admin, never the person who declined it.',
  input: z.object({ requestId: z.uuid() }),
  output: z.object({ request: z.object({ id: z.uuid(), status: z.string() }) }),
  scope: 'leave:request',
  effect: 'commit',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  rateLimit: 'write',
  surfaces: ['ui', 'rest'],
  audit: () => 'Asked for a review of a declined request',
  async handler({ db, actor, now }, input) {
    const me = actingMemberId(actor);
    const [r] = await db.select().from(leaveRequests).where(and(eq(leaveRequests.orgId, actor.orgId), eq(leaveRequests.id, input.requestId)));
    if (!r || r.memberId !== me) throw new CapabilityError('not_found', 'Request not found.');
    const snap = (r.decisionSnapshot ?? {}) as Record<string, unknown> & { review?: unknown; declinedBy?: string; reversed?: boolean };
    if (r.status === 'pending' && snap.review) return { request: { id: r.id, status: r.status } };
    if (r.status !== 'declined' || snap.reversed) throw new CapabilityError('conflict', 'Only a declined request can be reviewed.');
    if (snap.review) throw new CapabilityError('conflict', 'This request was already reviewed once.');
    if (!r.decidedAt || now.getTime() - r.decidedAt.getTime() > 14 * 86_400_000) throw new CapabilityError('conflict', 'Reviews can be asked for within 14 days of the decision.');
    if (r.startDate < isoDate(now)) throw new CapabilityError('conflict', 'This request has already started.');
    await db
      .update(leaveRequests)
      .set({ status: 'pending', decidedAt: null, decidedByMemberId: null, escalationLevel: 1, lastRemindedAt: null, decisionSnapshot: { ...snap, review: { declinedBy: snap.declinedBy ?? r.decidedByMemberId, askedAt: now.toISOString(), reason: r.declineReason } } })
      .where(and(eq(leaveRequests.orgId, actor.orgId), eq(leaveRequests.id, r.id)));
    defer(async () => {
      const { notifyReview } = await import('@/domain/escalation');
      await notifyReview(db, actor.orgId, r.id, now);
    });
    return { request: { id: r.id, status: 'pending' } };
  },
});
