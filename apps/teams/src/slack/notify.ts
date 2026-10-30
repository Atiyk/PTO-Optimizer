import { and, eq, isNull, lte, gte } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { leaveRequests, leaveTypes, members, slackStatusGrants } from '@/db/schema';
import { invokeCapability } from '@/capabilities/registry';
import { ROLE_SCOPES } from '@/capabilities/scopes';
import type { Actor } from '@/capabilities/types';
import { openSecret } from '@/lib/secretBox';
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
  const inst = await installationForOrg(db, orgId);
  if (!inst) return;
  const [r] = await db.select().from(leaveRequests).where(and(eq(leaveRequests.orgId, orgId), eq(leaveRequests.id, requestId)));
  if (!r || r.status !== 'pending') return;
  const [person] = await db.select().from(members).where(and(eq(members.orgId, orgId), eq(members.id, r.memberId)));
  if (!person?.managerId) return;
  const [mgr] = await db.select().from(members).where(and(eq(members.orgId, orgId), eq(members.id, person.managerId), isNull(members.deletedAt)));
  if (!mgr?.slackUserId) return;
  // Exactly what the manager's web queue shows, through the same capability.
  const q = await invokeCapability('listPendingApprovals', { db, actor: asHuman(mgr), now }, {});
  const item = q.requests.find((x) => x.id === requestId);
  if (!item) return;
  await slackApi('chat.postMessage', inst.token, { channel: mgr.slackUserId, ...approvalMessage(item as PendingItem) });
}

export async function notifyDecision(db: Db, orgId: string, requestId: string): Promise<void> {
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
    text: `${ok ? ':white_check_mark:' : ':x:'} Your ${esc(row.type.name.toLowerCase())}, ${range(row.r.startDate, row.r.endDate)}, was ${ok ? 'approved' : 'declined'}.`,
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
