import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { balanceLedger, coverageRules, leaveRequests, leaveTypes, members } from '@/db/schema';
import { autoApprovalCheck, autonomyFor } from '@/domain/autonomy';
import { balanceView, evaluateRequest, getLeaveTypeById, getMember, isoDate, teamCoverageMembers } from '@/domain/leave';
import { coverageViolations } from '@daysoff/engine/leave/coverage';

import { CapabilityError } from '../errors';
import { managesMember, untrusted } from '../helpers';
import { defineCapability } from '../types';
import { reverseUsage } from './requests';

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
    const suggest = (await autonomyFor(db, actor.orgId, 'decideLeaveRequest', 'assistant')) >= 1;
    const rows = await db
      .select({ req: leaveRequests, typeKey: leaveTypes.key, member: members })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .innerJoin(members, eq(members.id, leaveRequests.memberId))
      .where(and(eq(leaveRequests.orgId, actor.orgId), eq(leaveRequests.status, 'pending'), isNull(members.deletedAt)))
      .orderBy(asc(leaveRequests.startDate));
    const out = [];
    for (const r of rows) {
      if (r.member.id === actor.memberId) continue; // nobody approves their own leave
      if (!(await managesMember(db, actor, r.member))) continue;
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
        autoApproval: suggest ? await suggestion(db, actor.orgId, r.member, r.req, r.typeKey, today) : null,
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
      if (r.member.id === actor.memberId || !(await managesMember(db, actor, r.member))) continue;
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

async function suggestion(
  db: Parameters<typeof getMember>[0],
  orgId: string,
  member: Awaited<ReturnType<typeof getMember>>,
  req: typeof leaveRequests.$inferSelect,
  typeKey: string,
  today: string,
) {
  const ev = await evaluateRequest(
    db,
    orgId,
    member,
    { leaveTypeKey: typeKey, start: req.startDate, end: req.endDate, part: req.part, hours: req.hours == null ? undefined : Number(req.hours) },
    today,
    { excludeRequestId: req.id },
  );
  const c = autoApprovalCheck(ev);
  return { eligible: c.eligible, blockers: c.blockers };
}

export const decideLeaveRequest = defineCapability({
  name: 'decideLeaveRequest',
  description:
    'Approves or declines a pending request (or reverses an auto-approval within its window) with an optional ' +
    'note. Only the member’s manager or an admin can decide, never the requester. Approval deducts the ' +
    'engine-computed amount from the balance.',
  input: z.object({
    requestId: z.uuid(),
    decision: z.enum(['approve', 'decline']),
    note: z.string().max(500).optional(),
  }),
  output: z.object({ request: z.object({ id: z.uuid(), status: z.string(), start: z.string(), end: z.string(), leaveType: z.string() }) }),
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
    if (target.id === actor.memberId) throw new CapabilityError('forbidden', 'You cannot decide your own request.');
    if (!(await managesMember(db, actor, target))) throw new CapabilityError('not_found', 'Request not found.');
    const status = input.decision === 'approve' ? 'approved' : 'declined';
    const view = (s: string) => ({ request: { id: r.req.id, status: s, start: r.req.startDate, end: r.req.endDate, leaveType: r.typeKey } });

    if (r.req.status === status) return view(status); // idempotent repeat
    const reversingAuto =
      r.req.status === 'approved' && r.req.autoApproved && input.decision === 'decline' && r.req.reversibleUntil && r.req.reversibleUntil > now;
    if (r.req.status !== 'pending' && !reversingAuto) {
      throw new CapabilityError('conflict', `This request is already ${r.req.status}.`);
    }
    const type = await getLeaveTypeById(db, actor.orgId, r.req.leaveTypeId);
    const snap = r.req.engineSnapshot as { amount: number; unit: 'days' | 'hours' };
    await db.transaction(async (tx) => {
      await tx
        .update(leaveRequests)
        .set({ status, decidedByMemberId: actor.memberId, decidedAt: now, decisionNote: input.note ?? null })
        .where(and(eq(leaveRequests.orgId, actor.orgId), eq(leaveRequests.id, r.req.id)));
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
    });
    return view(status);
  },
});

