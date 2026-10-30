import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { auditLog, balanceLedger, leaveRequests, leaveTypes } from '@/db/schema';
import { autoApprovalCheck, autonomyFor } from '@/domain/autonomy';
import { evaluateRequest, getMember, getOrg, isoDate, type Evaluation } from '@/domain/leave';
import { CapabilityError } from '../errors';
import { isAdmin, subjectMember, untrusted } from '../helpers';
import { defineCapability } from '../types';
import { emitWebhook, kickWebhooks, requestEventData } from '@/server/webhooks';
import { defer } from '@/server/defer';
import { notifyApprover, syncSlackStatuses } from '@/slack/notify';

const isoDay = z.iso.date().describe('YYYY-MM-DD');

export const requestInput = z.object({
  leaveType: z.string().min(1).max(64).default('vacation').describe('Leave type key, e.g. "vacation", "sick".'),
  start: isoDay.describe('First day, YYYY-MM-DD.'),
  end: isoDay.describe('Last day (inclusive), YYYY-MM-DD. Same as start for a single day.'),
  part: z
    .enum(['full', 'am', 'pm', 'hours'])
    .default('full')
    .describe('full days, a morning (am) or afternoon (pm) half day, or a number of hours on one day.'),
  hours: z.number().positive().max(24).optional().describe('Only when part = "hours".'),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM')
    .optional()
    .describe('Only when part = "hours": local start time, HH:MM. With endTime, lets regulated sites check the exact staffing blocks.'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM').optional().describe('Only when part = "hours": local end time, HH:MM.'),
  note: z
    .string()
    .max(500)
    .nullable()
    .optional()
    .describe('Optional note for the approver. Not allowed on sick/health leave unless the org enabled notes.'),
});

export const blockGapOutput = z.object({
  date: z.string(),
  start: z.string(),
  end: z.string(),
  roomName: z.string().nullable(),
  ruleId: z.string(),
  label: z.string(),
  required: z.number(),
  present: z.number(),
  short: z.number(),
  basis: z.enum(['law', 'org_policy']),
  needsVerification: z.boolean(),
  citation: z.object({ regulation: z.string(), section: z.string(), url: z.string(), retrievedOn: z.string() }).nullable(),
});

export const toBlockGapOutput = (g: Evaluation['blockCoverage'][number]): z.infer<typeof blockGapOutput> => ({
  date: g.date,
  start: g.start,
  end: g.end,
  roomName: g.roomName,
  ruleId: g.ruleId,
  label: g.label,
  required: g.required,
  present: g.present,
  short: g.short,
  basis: g.basis,
  needsVerification: g.needsVerification,
  citation: g.citation ? { regulation: g.citation.regulation, section: g.citation.section, url: g.citation.url, retrievedOn: g.citation.retrievedOn } : null,
});

export const evaluationOutput = z.object({
  leaveType: z.string(),
  unit: z.enum(['days', 'hours']),
  deducts: z.number().describe('Engine-computed amount this request deducts.'),
  countsAgainstBalance: z.boolean(),
  chargedDates: z.array(z.string()),
  excluded: z.array(z.object({ date: z.string(), reason: z.enum(['holiday', 'non_working']), name: z.string().optional() })),
  balanceBefore: z.number().nullable(),
  balanceAfter: z.number().nullable(),
  yearEndAfter: z.object({ yearEnd: z.string(), balance: z.number(), wouldForfeit: z.number() }).nullable(),
  coverage: z.array(z.object({ date: z.string(), required: z.number(), present: z.number(), tag: z.string().nullable() })),
  blockCoverage: z
    .array(blockGapOutput)
    .describe('Regulated sites only: staffing-ratio or required-role gaps this absence would open, per time window, with the rule and its citation. Not legal advice.'),
  blackouts: z.array(z.object({ start: z.string(), end: z.string(), reason: z.object({ untrusted_text: z.string() }).nullable(), hard: z.boolean() })),
  retroactive: z.boolean(),
  problems: z.array(z.string()).describe('Blocking. The request cannot be submitted until these are fixed.'),
  warnings: z.array(z.string()).describe('Non-blocking; shown to the approver.'),
  canSubmit: z.boolean(),
});

export function evaluationToOutput(e: Evaluation): z.infer<typeof evaluationOutput> {
  return {
    leaveType: e.leaveType.key,
    unit: e.unit,
    deducts: e.countsAgainstBalance ? e.cost.amount : 0,
    countsAgainstBalance: e.countsAgainstBalance,
    chargedDates: e.cost.chargedDates,
    excluded: e.cost.excluded,
    balanceBefore: e.balanceBefore,
    balanceAfter: e.balanceAfter,
    yearEndAfter: e.yearEndAfter,
    coverage: e.coverage.map((c) => ({ date: c.date, required: c.required, present: c.present, tag: c.tag })),
    blockCoverage: e.blockCoverage.map(toBlockGapOutput),
    blackouts: e.blackouts.map((b) => ({ start: b.start, end: b.end, reason: untrusted(b.reason), hard: b.hard })),
    retroactive: e.retroactive,
    problems: e.problems,
    warnings: e.warnings,
    canSubmit: e.problems.length === 0,
  };
}

const toEval = (i: z.infer<typeof requestInput>) => ({
  leaveTypeKey: i.leaveType,
  start: i.start,
  end: i.end,
  part: i.part,
  hours: i.hours,
  startMinute: i.startTime ? minuteOf(i.startTime) : undefined,
  endMinute: i.endTime ? minuteOf(i.endTime) : undefined,
  note: i.note ?? null,
});

const minuteOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Hours given, or derived from the start and end times. */
const hoursOf = (i: z.infer<typeof requestInput>) =>
  i.hours ?? (i.part === 'hours' && i.startTime && i.endTime ? (minuteOf(i.endTime) - minuteOf(i.startTime)) / 60 : null);

export const draftLeaveRequest = defineCapability({
  name: 'draftLeaveRequest',
  description:
    'Checks a leave request WITHOUT submitting it: the engine computes the working days it deducts ' +
    '(holidays and weekends are never deducted), the balance before and after, the year-end outlook, ' +
    'blackouts, team coverage conflicts, staffing-ratio gaps at regulated sites (blockCoverage, with citations) ' +
    'and overlaps with existing requests. Call it as dates change, and ' +
    'before submitLeaveRequest. It never creates or changes anything.',
  input: requestInput,
  output: evaluationOutput,
  scope: 'leave:request',
  effect: 'draft',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest', 'mcp', 'slack', 'assistant'],
  audit: null,
  async handler({ db, actor, now }, input) {
    const member = await subjectMember(db, actor);
    return evaluationToOutput(await evaluateRequest(db, actor.orgId, member, toEval(input), isoDate(now)));
  },
});

const requestSummary = z.object({
  id: z.uuid(),
  leaveType: z.string(),
  status: z.enum(['draft', 'pending', 'approved', 'declined', 'cancelled']),
  start: z.string(),
  end: z.string(),
  part: z.enum(['full', 'am', 'pm', 'hours']),
  hours: z.number().nullable(),
  deducts: z.number(),
  unit: z.enum(['days', 'hours']),
  autoApproved: z.boolean(),
  note: z.object({ untrusted_text: z.string() }).nullable(),
  decisionNote: z.object({ untrusted_text: z.string() }).nullable(),
  createdAt: z.string(),
});

type Snapshot = { amount: number; unit: 'days' | 'hours'; chargedDates: string[]; excluded: unknown[] };

export function summarize(r: typeof leaveRequests.$inferSelect, typeKey: string): z.infer<typeof requestSummary> {
  const snap = (r.engineSnapshot ?? { amount: 0, unit: 'days' }) as Snapshot;
  return {
    id: r.id,
    leaveType: typeKey,
    status: r.status,
    start: r.startDate,
    end: r.endDate,
    part: r.part,
    hours: r.hours == null ? null : Number(r.hours),
    deducts: snap.amount,
    unit: snap.unit,
    autoApproved: r.autoApproved,
    note: untrusted(r.note),
    decisionNote: untrusted(r.decisionNote),
    createdAt: r.createdAt.toISOString(),
  };
}

export const submitLeaveRequest = defineCapability({
  name: 'submitLeaveRequest',
  description:
    'Submits a leave request for the member. The engine re-checks everything draftLeaveRequest checks and ' +
    'refuses if there is a blocking problem. Leave types that need approval go to the manager as "pending"; ' +
    'others are approved at once and deducted. Pass an idempotencyKey so a retry never creates a duplicate.',
  input: requestInput.extend({
    idempotencyKey: z.string().min(8).max(128).describe('Unique per intended request; retries with the same key return the same request.'),
  }),
  output: z.object({ request: requestSummary, evaluation: evaluationOutput }),
  scope: 'leave:request',
  effect: 'commit',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  rateLimit: 'write',
  surfaces: ['ui', 'rest', 'mcp', 'slack', 'assistant'],
  audit: (i, o) => `Submitted ${o.request.leaveType} request ${i.start} to ${i.end} (${o.request.status})`,
  async handler({ db, actor, now }, input) {
    const member = await subjectMember(db, actor);
    const [existing] = await db
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.orgId, actor.orgId), eq(leaveRequests.idempotencyKey, input.idempotencyKey)));
    const today = isoDate(now);
    if (existing) {
      if (existing.memberId !== member.id) throw new CapabilityError('conflict', 'That idempotency key was already used for another request.');
      const ev = await evaluateRequest(db, actor.orgId, member, toEval(input), today, { excludeRequestId: existing.id });
      return { request: summarize(existing, input.leaveType), evaluation: evaluationToOutput(ev) };
    }
    const ev = await evaluateRequest(db, actor.orgId, member, toEval(input), today);
    if (ev.problems.length) throw new CapabilityError('invalid_input', `Request not submitted: ${ev.problems.join(' ')}`, { problems: ev.problems });

    const org = await getOrg(db, actor.orgId);
    const note = ev.leaveType.isHealthRelated && !org.sickNotesEnabled ? null : (input.note ?? null);
    let needsApproval = ev.leaveType.requiresApproval || ev.retroactive;
    // 3D: at L3 the approval assistant approves clean requests, reversible within the window.
    let auto: { basis: string; reversibleUntil: Date | null } | null = null;
    if (needsApproval) {
      const level = await autonomyFor(db, actor.orgId, 'decideLeaveRequest', 'assistant');
      const check = level >= 3 ? autoApprovalCheck(ev) : null;
      if (check?.eligible) {
        auto = { basis: check.basis, reversibleUntil: new Date(now.getTime() + org.autoApprovalReversibleMinutes * 60_000) };
        needsApproval = false;
      }
    }
    const snapshot: Snapshot = { amount: ev.cost.amount, unit: ev.unit, chargedDates: ev.cost.chargedDates, excluded: ev.cost.excluded };

    const request = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(leaveRequests)
        .values({
          orgId: actor.orgId,
          memberId: member.id,
          leaveTypeId: ev.leaveType.id,
          status: needsApproval ? 'pending' : 'approved',
          startDate: input.start,
          endDate: input.end,
          part: input.part,
          hours: hoursOf(input) == null ? null : String(hoursOf(input)),
          startMinute: input.part === 'hours' && input.startTime ? minuteOf(input.startTime) : null,
          endMinute: input.part === 'hours' && input.endTime ? minuteOf(input.endTime) : null,
          note,
          engineSnapshot: snapshot,
          createdByActorType: actor.type,
          createdByClientId: actor.clientId,
          decidedAt: needsApproval ? null : now,
          idempotencyKey: input.idempotencyKey,
          autoApproved: auto != null,
          autoApprovalReason: auto?.basis ?? null,
          reversibleUntil: auto?.reversibleUntil ?? null,
        })
        .returning();
      if (auto) {
        await tx.insert(auditLog).values({
          orgId: actor.orgId,
          actorType: 'service-agent',
          clientId: 'auto-approval',
          onBehalfOfMemberId: member.id,
          capability: 'decideLeaveRequest',
          effect: 'commit',
          outcome: 'ok',
          summary: `Auto-approved ${ev.leaveType.key} request ${input.start} to ${input.end}: ${auto.basis}` +
            (auto.reversibleUntil ? `; manager can reverse until ${auto.reversibleUntil.toISOString()}` : ''),
          data: { requestId: row!.id },
        });
      }
      if (!needsApproval && ev.countsAgainstBalance && ev.cost.amount > 0) {
        await tx.insert(balanceLedger).values({
          orgId: actor.orgId,
          memberId: member.id,
          leaveTypeId: ev.leaveType.id,
          kind: 'usage',
          amount: String(-ev.cost.amount),
          unit: ev.unit,
          effectiveDate: input.start,
          requestId: row!.id,
          createdByActorType: actor.type,
          createdByMemberId: actor.memberId,
        });
      }
      const data = (decided: boolean) =>
        requestEventData({
          request: row!,
          memberName: member.name,
          leaveType: ev.leaveType,
          amount: ev.cost.amount,
          unit: ev.unit,
          ...(decided ? { decidedByMemberId: null } : {}),
        });
      await emitWebhook(tx as never, actor.orgId, 'leave.requested', data(false), now);
      // Auto-approval is a decision too; requests that never needed one are not.
      if (auto) await emitWebhook(tx as never, actor.orgId, 'leave.decided', data(true), now);
      return row!;
    });
    kickWebhooks(db, actor.orgId);
    if (request.status === 'pending') defer(() => notifyApprover(db, actor.orgId, request.id, now));
    else defer(async () => void (await syncSlackStatuses(db, actor.orgId, now)));
    return { request: summarize(request, input.leaveType), evaluation: evaluationToOutput(ev) };
  },
});

export const cancelLeaveRequest = defineCapability({
  name: 'cancelLeaveRequest',
  description:
    "Cancels one of the member's own pending or approved requests. Cancelling an approved request gives the " +
    'days back through a reversing ledger entry. Admins can cancel anyone’s request. Past approved leave cannot ' +
    'be cancelled here (ask an admin for an adjustment).',
  input: z.object({ requestId: z.uuid() }),
  output: z.object({ request: requestSummary }),
  scope: 'leave:request',
  effect: 'commit',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  rateLimit: 'write',
  surfaces: ['ui', 'rest', 'mcp', 'slack', 'assistant'],
  audit: (_i, o) => `Cancelled ${o.request.leaveType} request ${o.request.start} to ${o.request.end}`,
  async handler({ db, actor, now }, input) {
    const [r] = await db
      .select({ req: leaveRequests, typeKey: leaveTypes.key })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .where(and(eq(leaveRequests.orgId, actor.orgId), eq(leaveRequests.id, input.requestId)));
    if (!r) throw new CapabilityError('not_found', 'Request not found.');
    const mine = r.req.memberId === (actor.onBehalfOfMemberId ?? actor.memberId);
    if (!mine && !isAdmin(actor)) throw new CapabilityError('not_found', 'Request not found.');
    if (r.req.status === 'cancelled') return { request: summarize(r.req, r.typeKey) };
    if (r.req.status !== 'pending' && r.req.status !== 'approved') {
      throw new CapabilityError('conflict', `A ${r.req.status} request cannot be cancelled.`);
    }
    if (r.req.status === 'approved' && r.req.startDate < isoDate(now) && !isAdmin(actor)) {
      throw new CapabilityError('conflict', 'This leave has already started. Ask an admin for an adjustment.');
    }
    const updated = await db.transaction(async (tx) => {
      const [u] = await tx
        .update(leaveRequests)
        .set({ status: 'cancelled' })
        .where(and(eq(leaveRequests.orgId, actor.orgId), eq(leaveRequests.id, r.req.id)))
        .returning();
      await reverseUsage(tx as never, actor.orgId, r.req.id, actor, 'request cancelled');
      return u!;
    });
    return { request: summarize(updated, r.typeKey) };
  },
});

/** Appends a positive usage row that cancels the request's earlier deduction(s). */
export async function reverseUsage(
  db: Parameters<typeof getMember>[0],
  orgId: string,
  requestId: string,
  actor: { type: 'human' | 'agent-on-behalf-of-user' | 'service-agent'; memberId: string | null },
  reason: string,
): Promise<void> {
  const rows = await db
    .select()
    .from(balanceLedger)
    .where(and(eq(balanceLedger.orgId, orgId), eq(balanceLedger.requestId, requestId)));
  const net = rows.reduce((s, r) => s + Math.round(Number(r.amount) * 10_000), 0);
  if (net === 0 || rows.length === 0) return;
  const first = rows[0]!;
  await db.insert(balanceLedger).values({
    orgId,
    memberId: first.memberId,
    leaveTypeId: first.leaveTypeId,
    kind: 'usage',
    amount: String(-net / 10_000),
    unit: first.unit,
    effectiveDate: first.effectiveDate,
    requestId,
    reason,
    createdByActorType: actor.type,
    createdByMemberId: actor.memberId,
  });
}

export const listMyRequests = defineCapability({
  name: 'listMyRequests',
  description: "Lists the member's own leave requests, newest first, with status and the engine-computed amount deducted.",
  input: z.object({
    status: z.array(z.enum(['pending', 'approved', 'declined', 'cancelled'])).optional().describe('Filter by status; all by default.'),
    limit: z.number().int().min(1).max(200).default(50),
  }),
  output: z.object({ requests: z.array(requestSummary) }),
  scope: 'leave:read',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest', 'mcp', 'slack', 'assistant'],
  audit: null,
  async handler({ db, actor }, input) {
    const member = await subjectMember(db, actor);
    const rows = await db
      .select({ req: leaveRequests, typeKey: leaveTypes.key })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .where(
        and(
          eq(leaveRequests.orgId, actor.orgId),
          eq(leaveRequests.memberId, member.id),
          input.status ? inArray(leaveRequests.status, input.status) : undefined,
        ),
      )
      .orderBy(desc(leaveRequests.startDate))
      .limit(input.limit);
    return { requests: rows.map((r) => summarize(r.req, r.typeKey)) };
  },
});

