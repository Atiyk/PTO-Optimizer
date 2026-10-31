import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { members, msteamsTenants, msteamsUsers } from '@/db/schema';
import { ROLE_SCOPES } from '@/capabilities/scopes';
import type { Actor } from '@/capabilities/types';
import { getConversationMember } from './api';

/** The subset of a Bot Framework activity we read. Everything here is from the signed request. */
export interface Activity {
  type: string;
  id?: string;
  channelId?: string;
  serviceUrl?: string;
  text?: string;
  value?: Record<string, unknown>;
  replyToId?: string;
  from?: { id: string; aadObjectId?: string; name?: string };
  recipient?: { id: string };
  conversation?: { id: string; conversationType?: string; tenantId?: string };
  channelData?: { tenant?: { id?: string } };
  membersAdded?: { id: string }[];
}

export const tenantOf = (a: Activity) => a.conversation?.tenantId ?? a.channelData?.tenant?.id ?? null;

export async function orgForTenant(db: Db, tenantId: string | null): Promise<string | null> {
  if (!tenantId) return null;
  const [t] = await db.select().from(msteamsTenants).where(eq(msteamsTenants.tenantId, tenantId));
  return t?.orgId ?? null;
}

/**
 * The person behind a Teams user. Microsoft has verified who they are (signed activity), so they
 * act as a human with `clientId: 'msteams'`. Linking: by Entra object id saved earlier, else by
 * matching the work email from the conversation roster, which is then saved with the 1:1
 * conversation reference used for approval cards.
 */
export async function teamsActor(db: Db, orgId: string, a: Activity): Promise<Actor | null> {
  const aad = a.from?.aadObjectId;
  if (!aad || !a.from || !a.serviceUrl || !a.conversation) return null;
  const personal = a.conversation.conversationType === 'personal';
  const [link] = await db.select().from(msteamsUsers).where(and(eq(msteamsUsers.orgId, orgId), eq(msteamsUsers.aadObjectId, aad)));
  let memberId = link?.memberId ?? null;
  if (link && personal && (link.conversationId !== a.conversation.id || link.serviceUrl !== a.serviceUrl)) {
    await db.update(msteamsUsers).set({ conversationId: a.conversation.id, serviceUrl: a.serviceUrl }).where(eq(msteamsUsers.id, link.id));
  }
  if (!link) {
    try {
      const info = await getConversationMember(a.serviceUrl, a.conversation.id, a.from.id);
      const email = (info.email ?? info.userPrincipalName ?? '').toLowerCase();
      if (email) {
        const [m] = await db
          .select()
          .from(members)
          .where(and(eq(members.orgId, orgId), eq(sql`lower(${members.email})`, email), isNull(members.deletedAt)));
        if (m && personal) {
          await db
            .insert(msteamsUsers)
            .values({ orgId, memberId: m.id, aadObjectId: aad, teamsUserId: a.from.id, serviceUrl: a.serviceUrl, conversationId: a.conversation.id })
            .onConflictDoNothing();
        }
        memberId = m?.id ?? null;
      }
    } catch {
      // Roster lookup failed: treat as unlinked.
    }
  }
  if (!memberId) return null;
  const [m] = await db.select().from(members).where(and(eq(members.orgId, orgId), eq(members.id, memberId), isNull(members.deletedAt)));
  if (!m) return null;
  return { type: 'human', orgId, memberId: m.id, role: m.role, clientId: 'msteams', onBehalfOfMemberId: null, scopes: ROLE_SCOPES[m.role] };
}
