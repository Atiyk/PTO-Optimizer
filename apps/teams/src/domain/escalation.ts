import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { auditLog, leaveRequests, leaveTypes, members } from '@/db/schema';
import { addDays, mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import { approvalPolicyFor, awayToday } from './decisionFlow';
import { isoDate, type MemberRow } from './leave';
import { approvalRoute } from './routing';

/*
 * Exceptions only: a pending request that nobody decides is first reminded, then escalated along
 * the route (team approver → backup → manager → admins), skipping anyone who is away that day.
 * A request that starts within 2 working days escalates at once. Nothing is ever approved because
 * nobody answered: a pending request already failed the auto-approval rules.
 * Idempotent: the level and the reminder time are stored on the request.
 */

export interface EscalationStep {
  requestId: string;
  kind: 'reminder' | 'escalated';
  to: string[];
  level: number;
}

function workingDaysUntil(today: string, start: string): number {
  let n = 0;
  for (let d = addDays(today, 1); d <= start && n < 30; d = addDays(d, 1)) if (mondayIndexedDow(d) < 5) n++;
  return n;
}

/** Who should hold the request at each level: the route without the requester, the decliner (on review) or anyone away. */
export async function escalationLadder(db: Db, orgId: string, person: MemberRow, today: string, exclude: string[] = []): Promise<MemberRow[]> {
  const route = await approvalRoute(db, orgId, person);
  const away = await awayToday(db, orgId, route.deciders.map((m) => m.id), today);
  return route.deciders.filter((m) => !away.has(m.id) && !exclude.includes(m.id));
}

export async function advanceEscalations(db: Db, orgId: string | null, now: Date): Promise<EscalationStep[]> {
  const today = isoDate(now);
  const rows = await db
    .select({ r: leaveRequests, m: members, t: leaveTypes })
    .from(leaveRequests)
    .innerJoin(members, eq(members.id, leaveRequests.memberId))
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .where(and(eq(leaveRequests.status, 'pending'), isNull(members.deletedAt), orgId ? eq(leaveRequests.orgId, orgId) : undefined));
  const steps: EscalationStep[] = [];
  for (const { r, m, t } of rows) {
    if (r.endDate < today) continue; // past: nothing useful to escalate
    const choice = await approvalPolicyFor(db, r.orgId, m, t);
    const snap = (r.decisionSnapshot ?? {}) as { review?: { declinedBy?: string | null; askedAt?: string } };
    const exclude = snap.review?.declinedBy ? [snap.review.declinedBy] : [];
    const ladder = await escalationLadder(db, r.orgId, m, today, exclude);
    if (!ladder.length) continue;
    const since = snap.review?.askedAt ? new Date(snap.review.askedAt) : r.createdAt;
    const hours = (now.getTime() - since.getTime()) / 3_600_000;
    const urgent = workingDaysUntil(today, r.startDate) <= 2;
    const byTime = Math.floor(hours / choice.escalateAfterHours);
    const target = Math.min(ladder.length - 1, Math.max(byTime, urgent ? 1 : 0, r.escalationLevel));
    if (target > r.escalationLevel) {
      const to = ladder[target]!;
      await db.update(leaveRequests).set({ escalationLevel: target, lastRemindedAt: now }).where(and(eq(leaveRequests.orgId, r.orgId), eq(leaveRequests.id, r.id), eq(leaveRequests.escalationLevel, r.escalationLevel)));
      await audit(db, r.orgId, r.id, `Escalated request ${r.startDate} to ${r.endDate} to the next approver${urgent ? ' (starts within 2 working days)' : ''}`);
      await send(db, r.orgId, r.id, [to], now, urgent ? `Urgent: starts ${r.startDate} and is still waiting. You are next in line to decide.` : `Escalated to you: waiting ${Math.round(hours)} hours.`);
      steps.push({ requestId: r.id, kind: 'escalated', to: [to.id], level: target });
      continue;
    }
    if (target === 0 && hours >= choice.slaHours && !r.lastRemindedAt) {
      const to = ladder[0]!;
      await db.update(leaveRequests).set({ lastRemindedAt: now }).where(and(eq(leaveRequests.orgId, r.orgId), eq(leaveRequests.id, r.id), isNull(leaveRequests.lastRemindedAt)));
      await audit(db, r.orgId, r.id, `Reminded the approver about request ${r.startDate} to ${r.endDate}`);
      await send(db, r.orgId, r.id, [to], now, `Reminder: waiting ${Math.round(hours)} hours for your decision.`);
      steps.push({ requestId: r.id, kind: 'reminder', to: [to.id], level: 0 });
    }
  }
  return steps;
}

/** A review of a decline goes to the next person on the ladder, never the one who declined. */
export async function notifyReview(db: Db, orgId: string, requestId: string, now: Date): Promise<void> {
  const [row] = await db.select({ r: leaveRequests, m: members }).from(leaveRequests).innerJoin(members, eq(members.id, leaveRequests.memberId)).where(and(eq(leaveRequests.orgId, orgId), eq(leaveRequests.id, requestId)));
  if (!row) return;
  const snap = (row.r.decisionSnapshot ?? {}) as { review?: { declinedBy?: string | null } };
  const ladder = await escalationLadder(db, orgId, row.m, isoDate(now), snap.review?.declinedBy ? [snap.review.declinedBy] : []);
  if (ladder[0]) await send(db, orgId, requestId, [ladder[0]], now, 'Review asked: this request was declined and the person asked for a second look.');
}

async function audit(db: Db, orgId: string, requestId: string, summary: string) {
  await db.insert(auditLog).values({ orgId, actorType: 'service-agent', clientId: 'escalation', capability: 'decideLeaveRequest', effect: 'commit', outcome: 'ok', summary, data: { requestId } });
}

async function send(db: Db, orgId: string, requestId: string, to: MemberRow[], now: Date, lead: string) {
  try {
    const { notifyDeciders } = await import('@/slack/notify');
    await notifyDeciders(db, orgId, requestId, to, now, lead);
  } catch {
    // Delivery is best-effort; the web queue shows the escalation either way.
  }
}
