import { and, eq, lte, gte } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { leaveRequests, leaveTypes, members, slackStatusGrants } from '@/db/schema';
import { invokeCapability } from '@/capabilities/registry';
import { ROLE_SCOPES } from '@/capabilities/scopes';
import type { Actor } from '@/capabilities/types';
import { openSecret } from '@/lib/secretBox';
import { approvalRoute } from '@/domain/routing';
import { awayToday } from '@/domain/decisionFlow';
import { notifyTeamsApprovers, notifyTeamsDecision } from '@/msteams/notify';
import { installationForOrg } from './actor';
import { slackApi } from './api';
import { approvalMessage, day, esc, range, type PendingItem } from './format';

/*
 * Push messages: a new request goes to the approver's DMs with Approve / Decline; the decision
 * goes back to the person. Both are sent after the response (server/defer) and only when the
 * workspace installed the app and the person is linked to Slack.
 */

const asHuman = (m: typeof members.$inferSelect): Actor => ({
  type: 'human', orgId: m.orgId, memberId: m.id, role: m.role, clientId: 'slack', onBehalfOfMemberId: null, scopes: ROLE_SCOPES[m.role],
});

export async function notifyApprover(db: Db, orgId: string, requestId: string, now: Date): Promise<void> {
  const [r] = await db.select().from(leaveRequests).where(and(eq(leaveRequests.orgId, orgId), eq(leaveRequests.id, requestId)));
  if (!r || r.status !== 'pending') return;
  const [person] = await db.select().from(members).where(and(eq(members.orgId, orgId), eq(members.id, r.memberId)));
  if (!person) return;
  // Routing (team approver → backup → manager → admins); the primary and the backup are told.
  // Approvers who are away today are skipped: the next in line is told instead.
  const route = await approvalRoute(db, orgId, person);
  const away = await awayToday(db, orgId, route.deciders.map((m) => m.id), now.toISOString().slice(0, 10));
  let targets = [route.primary, route.backup].filter((m): m is typeof members.$inferSelect => !!m && !away.has(m.id));
  if (!targets.length) targets = route.deciders.filter((m) => !away.has(m.id)).slice(0, 1);
  await notifyDeciders(db, orgId, requestId, targets, now);
}

/** Sends the approval card to these deciders in Teams and Slack. `lead` is a first line (reminder, escalation). */
export async function notifyDeciders(db: Db, orgId: string, requestId: string, targets: (typeof members.$inferSelect)[], now: Date, lead?: string): Promise<number> {
  let sent = await notifyTeamsApprovers(db, orgId, requestId, targets, now, lead).catch(() => 0);
  const inst = await installationForOrg(db, orgId);
  if (!inst) return sent;
  for (const mgr of targets) {
    if (!mgr.slackUserId) continue;
    // Exactly what the approver's web queue shows, through the same capability.
    const q = await invokeCapability('listPendingApprovals', { db, actor: asHuman(mgr), now }, {});
    const item = q.requests.find((x) => x.id === requestId);
    if (!item) continue;
    await slackApi('chat.postMessage', inst.token, { channel: mgr.slackUserId, ...approvalMessage(item as PendingItem, lead) });
    sent += 1;
  }
  return sent;
}

export async function notifyDecision(db: Db, orgId: string, requestId: string): Promise<void> {
  await notifyTeamsDecision(db, orgId, requestId).catch(() => undefined);
  const inst = await installationForOrg(db, orgId);
  if (!inst) return;
  const [row] = await db
    .select({ r: leaveRequests, type: leaveTypes, person: members })
    .from(leaveRequests)
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .innerJoin(members, eq(members.id, leaveRequests.memberId))
    .where(and(eq(leaveRequests.orgId, orgId), eq(leaveRequests.id, requestId)));
  if (!row?.person.slackUserId || (row.r.status !== 'approved' && row.r.status !== 'declined')) return;
  const ok = row.r.status === 'approved';
  await slackApi('chat.postMessage', inst.token, {
    channel: row.person.slackUserId,
    text: `${ok ? ':white_check_mark:' : ':x:'} Your ${esc(row.type.name.toLowerCase())}, ${range(row.r.startDate, row.r.endDate)}, was ${ok ? 'approved' : 'declined'}.` + (ok ? '' : declineDetails(row.r, esc)),
  });
}

/**
 * Optional "out of office" Slack status for people who allowed it (user token with
 * users.profile:write). Generic text only: never the leave type or a reason.
 */
export async function syncSlackStatuses(db: Db, orgId: string, now: Date): Promise<number> {
  const today = now.toISOString().slice(0, 10);
  const grants = await db.select().from(slackStatusGrants).where(eq(slackStatusGrants.orgId, orgId));
  let set = 0;
  for (const g of grants) {
    const [r] = await db
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.orgId, orgId), eq(leaveRequests.memberId, g.memberId), eq(leaveRequests.status, 'approved'), lte(leaveRequests.startDate, today), gte(leaveRequests.endDate, today)));
    if (!r || r.id === g.lastRequestId) continue;
    const partial = r.part !== 'full';
    const text = partial
      ? `Out ${r.part === 'am' ? 'this morning' : r.part === 'pm' ? 'this afternoon' : `for ${Number(r.hours)} h today`}`
      : r.endDate > today
        ? `Out of office until ${day(r.endDate)}`
        : 'Out of office today';
    // Clears itself at the end of the last day off (UTC midnight).
    const until = Date.parse(`${partial ? today : r.endDate}T00:00:00Z`) / 1000 + 86_400;
    try {
      await slackApi('users.profile.set', openSecret(g.userToken), { profile: { status_text: text, status_emoji: ':palm_tree:', status_expiration: until } });
      await db.update(slackStatusGrants).set({ lastRequestId: r.id }).where(eq(slackStatusGrants.id, g.id));
      set++;
    } catch {
      // Token revoked or scope removed: leave the grant; the person can reconnect.
    }
  }
  return set;
}

export const DECLINE_REASON_TEXT: Record<string, string> = {
  coverage: 'not enough cover on those days',
  notice: 'not enough notice',
  peak_period: 'a busy period',
  other: 'see the note',
};

/** Reason, the engine's other dates and how to ask for a review, for a decline message. */
export function declineDetails(r: typeof leaveRequests.$inferSelect, escape: (s: string) => string): string {
  const snap = (r.decisionSnapshot ?? {}) as { declineAlternatives?: { start: string; end: string }[]; reversed?: boolean };
  if (snap.reversed) return '';
  const parts: string[] = [];
  if (r.declineReason) parts.push(` Reason: ${DECLINE_REASON_TEXT[r.declineReason] ?? r.declineReason}.`);
  if (r.decisionNote) parts.push(` Note: "${escape(r.decisionNote)}".`);
  const alts = snap.declineAlternatives ?? [];
  if (alts.length) parts.push(` Dates that work: ${alts.map((a) => range(a.start, a.end)).join(', ')}.`);
  parts.push(' You can ask for a review in Days Off, under My requests.');
  return parts.join('');
}
