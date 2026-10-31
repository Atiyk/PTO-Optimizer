import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { leaveRequests, leaveTypes, members, msteamsUsers } from '@/db/schema';
import { invokeCapability } from '@/capabilities/registry';
import { ROLE_SCOPES } from '@/capabilities/scopes';
import type { Actor } from '@/capabilities/types';
import { range, type PendingItem } from '@/slack/format';
import { msTeamsConfigured, sendActivity } from './api';
import { approvalCard, md, text } from './cards';

/*
 * Push messages in Teams, after the response (server/defer): a new request goes to the routed
 * approvers as an Adaptive Card with Approve / Decline; the decision goes back to the person.
 * Only for people who have the app (a saved 1:1 conversation) and when the bot is configured.
 */

type MemberRow = typeof members.$inferSelect;
const asHuman = (m: MemberRow): Actor => ({ type: 'human', orgId: m.orgId, memberId: m.id, role: m.role, clientId: 'msteams', onBehalfOfMemberId: null, scopes: ROLE_SCOPES[m.role] });

async function conversationFor(db: Db, orgId: string, memberId: string) {
  const [c] = await db.select().from(msteamsUsers).where(and(eq(msteamsUsers.orgId, orgId), eq(msteamsUsers.memberId, memberId)));
  return c ?? null;
}

export async function notifyTeamsApprovers(db: Db, orgId: string, requestId: string, approvers: MemberRow[], now: Date, lead?: string): Promise<number> {
  if (!msTeamsConfigured()) return 0;
  let sent = 0;
  for (const mgr of approvers) {
    const conv = await conversationFor(db, orgId, mgr.id);
    if (!conv) continue;
    // Exactly what the approver's web queue shows, through the same capability.
    const q = await invokeCapability('listPendingApprovals', { db, actor: asHuman(mgr), now }, {});
    const item = q.requests.find((x) => x.id === requestId);
    if (!item) continue;
    await sendActivity(conv.serviceUrl, conv.conversationId, approvalCard(item as PendingItem, lead));
    sent += 1;
  }
  return sent;
}

export async function notifyTeamsDecision(db: Db, orgId: string, requestId: string): Promise<void> {
  if (!msTeamsConfigured()) return;
  const [row] = await db
    .select({ r: leaveRequests, type: leaveTypes })
    .from(leaveRequests)
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .where(and(eq(leaveRequests.orgId, orgId), eq(leaveRequests.id, requestId)));
  if (!row || (row.r.status !== 'approved' && row.r.status !== 'declined')) return;
  const conv = await conversationFor(db, orgId, row.r.memberId);
  if (!conv) return;
  const ok = row.r.status === 'approved';
  const { declineDetails } = await import('@/slack/notify');
  await sendActivity(conv.serviceUrl, conv.conversationId, text(`${ok ? '✅' : '❌'} Your ${md(row.type.name.toLowerCase())}, ${range(row.r.startDate, row.r.endDate)}, was ${ok ? 'approved' : 'declined'}.` + (ok ? '' : declineDetails(row.r, md))));
}
